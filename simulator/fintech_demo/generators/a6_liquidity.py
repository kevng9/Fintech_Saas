"""A6 Liquidity Command Center baseline: positions, settlements, and a forecast.

``DELAY_ENTITY_ID`` / ``DELAY_CURRENCY`` name the entity and currency
``A6_SETTLEMENT_DELAY`` targets: the baseline seeds a USD 25,000,000 pending
inbound settlement for that entity so a dashboard has something to show
before the scenario runs, and the scenario adds an offsetting -25,000,000
pending inbound settlement for the same entity and currency. Both rows carry
``status = 'pending'``, so ``aa_liquidity_position`` (migration 010) nets them
to zero without any row being updated in place: the projected 24-hour
liquidity for that entity and currency falls by exactly USD 25,000,000, the
published delta, purely from an extra inserted row.
"""

from __future__ import annotations

from datetime import timedelta

from ..generator import World
from ..model import CURRENCY_BY_COUNTRY, GEOGRAPHIES
from ..rng import det_choice, det_float, det_int
from ..rowbatch import TableBatch
from ..tables import TABLE_COLUMNS
from .shared_dims import COUNTERPARTY_COUNT, ENTITY_COUNT, counterparty_id, entity_id

_COUNTRIES: tuple[str, ...] = tuple(geography[1] for geography in GEOGRAPHIES)

DELAY_ENTITY_ID = entity_id(1)
DELAY_COUNTERPARTY_ID = counterparty_id(1)
DELAY_CURRENCY = "USD"
DELAY_BASELINE_SETTLEMENT_ID = "STL-A6B-DELAYCANDIDATE"
DELAY_AMOUNT_USD = 25_000_000.00

SETTLEMENTS_PER_ENTITY = 3
QUEUED_PER_ENTITY = 2


def _entity_currency(index: int) -> str:
    country = _COUNTRIES[(index - 1) % len(_COUNTRIES)]
    return CURRENCY_BY_COUNTRY[country]


def _account_id(index: int) -> str:
    return f"CASH-{entity_id(index)}"


def _settlement_id(index: int, slot: int) -> str:
    return f"STL-A6B-{index:02d}-{slot:02d}"


def _queued_id(index: int, slot: int) -> str:
    return f"QP-A6B-{index:02d}-{slot:02d}"


def seed_baseline(world: World, run_id: int) -> list[TableBatch]:
    snapshot_rows: list[tuple] = []
    settlement_rows: list[tuple] = []
    queued_rows: list[tuple] = []
    forecast_rows: list[tuple] = []

    for index in range(1, ENTITY_COUNT + 1):
        eid = entity_id(index)
        currency = _entity_currency(index)
        account_id = _account_id(index)
        base_balance = 4_000_000.0 + index * 1_250_000.0

        for day in range(max(world.baseline_days, 1)):
            snapshot_time = world.baseline_from + timedelta(days=day, hours=6)
            drift = det_float(world.seed, "a6b-drift", index, day, low=-0.05, high=0.05)
            ledger_balance = round(base_balance * (1 + drift), 2)
            available_balance = round(ledger_balance * 0.96, 2)
            usd_rate = 1.0 if currency == "USD" else {"GBP": 1.27, "EUR": 1.09, "CAD": 0.74}[currency]
            snapshot_rows.append(
                (
                    run_id,
                    snapshot_time,
                    eid,
                    account_id,
                    currency,
                    ledger_balance,
                    available_balance,
                    round(ledger_balance * usd_rate, 2),
                    round(available_balance * usd_rate, 2),
                )
            )
            forecast_rows.append(
                (
                    run_id,
                    snapshot_time,
                    world.baseline_from + timedelta(days=day + 1),
                    eid,
                    currency,
                    round(base_balance * 0.02, 2),
                    round(base_balance * 0.018, 2),
                    round(base_balance * 0.02 * usd_rate, 2),
                    round(base_balance * 0.018 * usd_rate, 2),
                    "forecast-v1",
                )
            )

        usd_rate = 1.0 if currency == "USD" else {"GBP": 1.27, "EUR": 1.09, "CAD": 0.74}[currency]
        for slot in range(SETTLEMENTS_PER_ENTITY):
            amount = round(det_float(world.seed, "a6b-settle-amount", index, slot, low=50_000.0, high=1_800_000.0), 2)
            direction = "inbound" if slot % 2 == 0 else "outbound"
            status = det_choice(("pending", "settled"), world.seed, "a6b-settle-status", index, slot)
            created_at = world.baseline_from + timedelta(days=det_int(world.seed, "a6b-settle-day", index, slot, low=0, high=max(world.baseline_days - 1, 0)))
            due_at = created_at + timedelta(hours=det_int(world.seed, "a6b-settle-due", index, slot, low=4, high=72))
            settlement_rows.append(
                (
                    run_id,
                    _settlement_id(index, slot),
                    eid,
                    counterparty_id(1 + ((index + slot) % COUNTERPARTY_COUNT)),
                    currency,
                    amount,
                    round(amount * usd_rate, 2),
                    direction,
                    created_at,
                    due_at,
                    status,
                    None,
                )
            )

        for slot in range(QUEUED_PER_ENTITY):
            amount = round(det_float(world.seed, "a6b-queued-amount", index, slot, low=20_000.0, high=400_000.0), 2)
            created_at = world.baseline_from + timedelta(days=max(world.baseline_days - 1, 0))
            due_at = world.epoch + timedelta(hours=det_int(world.seed, "a6b-queued-due", index, slot, low=2, high=96))
            queued_rows.append(
                (
                    run_id,
                    _queued_id(index, slot),
                    eid,
                    currency,
                    amount,
                    round(amount * usd_rate, 2),
                    created_at,
                    due_at,
                    "queued",
                )
            )

    # The designated pending inbound settlement A6_SETTLEMENT_DELAY targets.
    settlement_rows.append(
        (
            run_id,
            DELAY_BASELINE_SETTLEMENT_ID,
            DELAY_ENTITY_ID,
            DELAY_COUNTERPARTY_ID,
            DELAY_CURRENCY,
            DELAY_AMOUNT_USD,
            DELAY_AMOUNT_USD,
            "inbound",
            world.baseline_from + timedelta(days=max(world.baseline_days - 1, 0)),
            world.epoch + timedelta(hours=8),
            "pending",
            None,
        )
    )

    return [
        TableBatch("cash_position_snapshot", TABLE_COLUMNS["cash_position_snapshot"], snapshot_rows),
        TableBatch("settlement", TABLE_COLUMNS["settlement"], settlement_rows),
        TableBatch("queued_payment", TABLE_COLUMNS["queued_payment"], queued_rows),
        TableBatch("cash_flow_forecast", TABLE_COLUMNS["cash_flow_forecast"], forecast_rows),
    ]
