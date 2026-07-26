"""A2_PROCESSOR_TIMEOUT: a two-minute authorization timeout burst.

The burst owns the P2 / Mastercard / GB lane for two logical minutes. Counts are
fixed so the published deltas are exact:

    attempts             200   (100 per logical minute)
    approvals            176   -> approval rate 88.00 percent
    timeout declines      14   -> timeout share  7.00 percent
    other declines        10
    latency               14 events at 680 ms, everything else at or below 450 ms
                          -> p95 for the window is exactly 680 ms

The comparison baseline is the same lane over the seeded history: 96.00 percent
approval, 1.00 percent timeout share, p95 180 ms.
"""

from __future__ import annotations

from datetime import timedelta

from ..generator import (
    PAYMENT_EVENT_COLUMNS,
    SCENARIO_SEQUENCE_OFFSET,
    SEQUENCE_STRIDE,
    World,
    payment_id_for,
)
from ..model import (
    AFFECTED_SEGMENT,
    RAIL_BY_PROCESSOR,
    merchants_for_country_category,
    to_usd,
)
from ..rng import det_hash
from .base import ScenarioDefinition, TableBatch

SCENARIO_ID = "A2_PROCESSOR_TIMEOUT"
EVENTS_PER_MINUTE = 100
WINDOW_MINUTES = 2
DECLINES_PER_MINUTE = 12
TIMEOUTS_PER_MINUTE = 7
TIMEOUT_LATENCY_MS = 680
DEGRADED_DECLINE_LATENCY_MS = 250
BURST_CATEGORY = "Digital Goods"
OTHER_DECLINE_CODES = ("DO_NOT_HONOR", "DO_NOT_HONOR", "DO_NOT_HONOR", "ISSUER_UNAVAILABLE", "ISSUER_UNAVAILABLE")

DEFINITION = ScenarioDefinition(
    scenario_id=SCENARIO_ID,
    anchor_id="a2",
    name="Processor timeout burst",
    description=(
        "A two-minute authorization timeout burst on processor P2 (Cardinal Rails) "
        "for Mastercard traffic with GB issuers. Approval rate falls, p95 latency "
        "rises, and timeout declines dominate the decline mix for that lane."
    ),
    metric_window="T+2m from injection watermark",
    window_minutes=WINDOW_MINUTES,
    expected_deltas={
        "segment": {
            "processor_id": AFFECTED_SEGMENT.processor_id,
            "card_network": AFFECTED_SEGMENT.card_network,
            "issuer_country": AFFECTED_SEGMENT.issuer_country,
        },
        "rows_inserted": {"payment_event": EVENTS_PER_MINUTE * WINDOW_MINUTES},
        "baseline": {
            "window": "seeded history for the affected lane",
            "approval_rate": 0.96,
            "timeout_decline_rate": 0.01,
            "p95_latency_ms": 180,
        },
        "after": {
            "window": "injection window",
            "attempts": EVENTS_PER_MINUTE * WINDOW_MINUTES,
            "approvals": (EVENTS_PER_MINUTE - DECLINES_PER_MINUTE) * WINDOW_MINUTES,
            "timeout_declines": TIMEOUTS_PER_MINUTE * WINDOW_MINUTES,
            "approval_rate": 0.88,
            "timeout_decline_rate": 0.07,
            "p95_latency_ms": TIMEOUT_LATENCY_MS,
        },
        "tolerance": {
            "approval_rate": 0.0005,
            "timeout_decline_rate": 0.0005,
            "p95_latency_ms": 0,
        },
        "narrative": (
            "Approval rate 96 percent to 88 percent, p95 latency 180 ms to 680 ms, "
            "timeout declines 1 percent to 7 percent for P2 / Mastercard / GB."
        ),
    },
    excluded_segment_keys=(AFFECTED_SEGMENT.key,),
)


def _marked(index: int, total: int, wanted: int) -> bool:
    if wanted <= 0 or total <= 0:
        return False
    if wanted >= total:
        return True
    return ((index + 1) * wanted) // total > (index * wanted) // total


def build_rows(world: World, run_id: int, start_minute: int) -> list[TableBatch]:
    segment = AFFECTED_SEGMENT
    merchants = merchants_for_country_category(
        world.merchants, segment.issuer_country, BURST_CATEGORY
    )
    rows: list[tuple] = []
    for window_minute in range(WINDOW_MINUTES):
        minute_index = start_minute + window_minute
        minute_start = world.minute_start(minute_index)
        for position in range(EVENTS_PER_MINUTE):
            is_decline = _marked(position, EVENTS_PER_MINUTE, DECLINES_PER_MINUTE)
            is_timeout = False
            if is_decline:
                decline_rank = position * DECLINES_PER_MINUTE // EVENTS_PER_MINUTE
                is_timeout = _marked(decline_rank, DECLINES_PER_MINUTE, TIMEOUTS_PER_MINUTE)

            if is_timeout:
                response_code = "TIMEOUT"
                latency_ms = TIMEOUT_LATENCY_MS
            elif is_decline:
                other_rank = (position * DECLINES_PER_MINUTE // EVENTS_PER_MINUTE) - (
                    position * TIMEOUTS_PER_MINUTE // EVENTS_PER_MINUTE
                )
                response_code = OTHER_DECLINE_CODES[other_rank % len(OTHER_DECLINE_CODES)]
                latency_ms = DEGRADED_DECLINE_LATENCY_MS
            else:
                response_code = "APPROVED"
                latency_ms = 300 + ((position * 17) % 150)

            merchant = merchants[
                det_hash(world.seed, SCENARIO_ID, "merchant", minute_index, position)
                % len(merchants)
            ]
            customer = world.pick_customer(
                segment.issuer_country, SCENARIO_ID, "customer", minute_index, position
            )
            amount = world.amount_for(
                merchant["merchant_category"], SCENARIO_ID, "amount", minute_index, position
            )
            sequence_no = minute_index * SEQUENCE_STRIDE + SCENARIO_SEQUENCE_OFFSET + position
            rows.append(
                (
                    run_id,
                    payment_id_for(run_id, sequence_no),
                    sequence_no,
                    minute_start + timedelta(seconds=position * 60.0 / EVENTS_PER_MINUTE),
                    customer["customer_id"],
                    merchant["merchant_id"],
                    segment.processor_id,
                    RAIL_BY_PROCESSOR[segment.processor_id],
                    segment.card_network,
                    amount,
                    to_usd(amount, "GBP"),
                    "GBP",
                    response_code,
                    0 if is_decline else 1,
                    latency_ms,
                    segment.issuer_country,
                    SCENARIO_ID,
                )
            )
    return [TableBatch(table="payment_event", columns=PAYMENT_EVENT_COLUMNS, rows=rows)]
