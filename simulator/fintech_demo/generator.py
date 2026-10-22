"""Deterministic synthetic payment authorization generator.

The generator is a pure function of (run seed, logical minute). Baseline
seeding and the live event stream both call it, so the event set for a logical
minute is identical no matter when it is produced, at what speed multiplier, or
after how many restarts.

Volumes are chosen so the documented A2 metrics are exact rather than
approximate: attempts per segment-hour are always a multiple of 100, approval
rates have two decimals, and the timeout share is exactly one percent.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Iterable, Iterator, Sequence

from .model import (
    AMOUNT_RANGE_BY_CATEGORY,
    APPROVED_CODE,
    CURRENCY_BY_COUNTRY,
    DECLINE_CODE_WEIGHTS,
    RAIL_BY_PROCESSOR,
    SEGMENTS,
    TIMEOUT_CODE,
    Segment,
    build_accounts,
    build_customers,
    build_merchants,
    customers_for_country,
    merchants_for_country,
    to_usd,
)
from .rng import det_float, det_hash, det_int, det_weighted_choice

PAYMENT_EVENT_COLUMNS = (
    "run_id",
    "payment_id",
    "sequence_no",
    "event_time",
    "customer_id",
    "merchant_id",
    "processor_id",
    "rail",
    "card_network",
    "amount",
    "amount_usd",
    "currency",
    "response_code",
    "approved",
    "latency_ms",
    "issuer_country",
    "scenario_id",
)

SEQUENCE_STRIDE = 100_000
SCENARIO_SEQUENCE_OFFSET = 50_000
MINUTES_PER_DAY = 1440


def payment_id_for(run_id: int, sequence_no: int) -> str:
    return f"PAY-{run_id}-{sequence_no}"


class World:
    """Dimension members plus the rules that turn a logical minute into rows."""

    def __init__(self, seed: int, epoch: datetime, baseline_days: int) -> None:
        self.seed = seed
        self.epoch = epoch
        self.baseline_days = baseline_days
        self.baseline_from = epoch - timedelta(days=baseline_days)
        self.merchants = build_merchants(seed)
        self.customers = build_customers(seed, epoch.date())
        self.accounts = build_accounts(self.customers)
        self._merchants_by_country = {
            country: merchants_for_country(self.merchants, country)
            for country in CURRENCY_BY_COUNTRY
        }
        self._customers_by_country = {
            country: customers_for_country(self.customers, country)
            for country in CURRENCY_BY_COUNTRY
        }
        self._merchant_category = {m["merchant_id"]: m["merchant_category"] for m in self.merchants}

    # -- logical clock ----------------------------------------------------

    @property
    def baseline_minutes(self) -> int:
        return self.baseline_days * MINUTES_PER_DAY

    def minute_start(self, minute_index: int) -> datetime:
        return self.baseline_from + timedelta(minutes=minute_index)

    def minute_index_for(self, moment: datetime) -> int:
        delta = moment - self.baseline_from
        return int(delta.total_seconds() // 60)

    # -- generation -------------------------------------------------------

    def generate_minute(
        self,
        run_id: int,
        minute_index: int,
        *,
        excluded_segment_keys: Sequence[str] = (),
    ) -> list[tuple]:
        minute_start = self.minute_start(minute_index)
        hour_of_day = minute_start.hour
        minute_of_hour = minute_index % 60
        rows: list[tuple] = []
        position = 0
        for segment in SEGMENTS:
            if segment.key in excluded_segment_keys:
                continue
            attempts_in_hour = segment.attempts_for_hour(hour_of_day)
            slice_start = attempts_in_hour * minute_of_hour // 60
            slice_end = attempts_in_hour * (minute_of_hour + 1) // 60
            count_in_minute = slice_end - slice_start
            for offset in range(count_in_minute):
                index_in_hour = slice_start + offset
                rows.append(
                    self._build_row(
                        run_id=run_id,
                        segment=segment,
                        minute_index=minute_index,
                        minute_start=minute_start,
                        position_in_minute=position,
                        seconds_in_minute=(offset * 60.0 / count_in_minute)
                        if count_in_minute
                        else 0.0,
                        index_in_hour=index_in_hour,
                        attempts_in_hour=attempts_in_hour,
                    )
                )
                position += 1
        return rows

    def generate_range(
        self,
        run_id: int,
        start_minute: int,
        end_minute: int,
        *,
        excluded_segment_keys: Sequence[str] = (),
    ) -> Iterator[tuple]:
        for minute_index in range(start_minute, end_minute):
            yield from self.generate_minute(
                run_id, minute_index, excluded_segment_keys=excluded_segment_keys
            )

    def _build_row(
        self,
        *,
        run_id: int,
        segment: Segment,
        minute_index: int,
        minute_start: datetime,
        position_in_minute: int,
        seconds_in_minute: float,
        index_in_hour: int,
        attempts_in_hour: int,
    ) -> tuple:
        approvals = int(round(attempts_in_hour * segment.approval_rate))
        timeouts = attempts_in_hour // 100
        declines = attempts_in_hour - approvals
        other_declines = declines - timeouts

        is_decline = _marked(index_in_hour, attempts_in_hour, declines)
        is_timeout = False
        if is_decline and declines > 0:
            decline_rank = index_in_hour * declines // attempts_in_hour
            is_timeout = _marked(decline_rank, declines, timeouts)

        latency_ms = self._baseline_latency(segment, index_in_hour, is_timeout)

        if is_timeout:
            response_code = TIMEOUT_CODE
        elif is_decline:
            response_code = det_weighted_choice(
                DECLINE_CODE_WEIGHTS, self.seed, "decline", segment.key, minute_index, index_in_hour
            )
        else:
            response_code = APPROVED_CODE

        merchant_pool = self._merchants_by_country[segment.issuer_country]
        merchant = merchant_pool[
            det_hash(self.seed, "merchant", segment.key, minute_index, index_in_hour)
            % len(merchant_pool)
        ]
        customer_pool = self._customers_by_country[segment.issuer_country]
        customer = customer_pool[
            det_hash(self.seed, "customer", segment.key, minute_index, index_in_hour)
            % len(customer_pool)
        ]

        low, high = AMOUNT_RANGE_BY_CATEGORY[merchant["merchant_category"]]
        amount = round(
            det_float(
                self.seed,
                "amount",
                segment.key,
                minute_index,
                index_in_hour,
                low=float(low),
                high=float(high),
            ),
            2,
        )

        sequence_no = minute_index * SEQUENCE_STRIDE + position_in_minute
        event_time = minute_start + timedelta(seconds=seconds_in_minute)
        currency = CURRENCY_BY_COUNTRY[segment.issuer_country]
        _ = other_declines  # documented split, derived above for clarity

        return (
            run_id,
            payment_id_for(run_id, sequence_no),
            sequence_no,
            event_time,
            customer["customer_id"],
            merchant["merchant_id"],
            segment.processor_id,
            RAIL_BY_PROCESSOR[segment.processor_id],
            segment.card_network,
            amount,
            to_usd(amount, currency),
            currency,
            response_code,
            0 if is_decline else 1,
            latency_ms,
            segment.issuer_country,
            None,
        )

    def _baseline_latency(self, segment: Segment, index_in_hour: int, is_timeout: bool) -> int:
        if is_timeout:
            return segment.tail_latency_ms + 120
        if index_in_hour % 10 == 9:
            # Exactly ten percent of a segment-hour sits on the tail value, so
            # p95 for that segment-hour equals tail_latency_ms exactly.
            return segment.tail_latency_ms
        return segment.tail_latency_ms - 70 + ((index_in_hour * 37) % 60)

    # -- helpers used by scenarios ---------------------------------------

    def merchant_category(self, merchant_id: str) -> str:
        return self._merchant_category[merchant_id]

    def pick_merchants(self, candidates: Iterable[dict], *parts: object) -> dict:
        pool = list(candidates)
        return pool[det_hash(self.seed, *parts) % len(pool)]

    def pick_customer(self, country: str, *parts: object) -> dict:
        pool = self._customers_by_country[country]
        return pool[det_hash(self.seed, *parts) % len(pool)]

    def amount_for(self, category: str, *parts: object) -> float:
        low, high = AMOUNT_RANGE_BY_CATEGORY[category]
        return round(det_float(self.seed, *parts, low=float(low), high=float(high)), 2)

    def spread_int(self, low: int, high: int, *parts: object) -> int:
        return det_int(self.seed, *parts, low=low, high=high)


def _marked(index: int, total: int, wanted: int) -> bool:
    """True when ``index`` carries one of ``wanted`` marks spread over ``total``."""
    if wanted <= 0 or total <= 0:
        return False
    if wanted >= total:
        return True
    return ((index + 1) * wanted) // total > (index * wanted) // total
