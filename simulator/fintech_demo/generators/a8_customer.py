"""A8 Embedded Insights Strategy baseline: one customer's transaction history.

Every view migration 012 creates is physically filtered to ``CUST-0001``
(spec section 12.3), so this baseline only needs to be rich for that one
synthetic identity. ``build_daily_activity`` and ``last_ending_balance`` are
exported so ``scenarios/a8_dining_spike.py`` can continue the same running
balance the baseline ends on instead of guessing a starting point.
"""

from __future__ import annotations

from datetime import timedelta

from ..generator import World
from ..rng import det_choice, det_float, det_int
from ..rowbatch import TableBatch
from ..tables import TABLE_COLUMNS

DEMO_CUSTOMER_ID = "CUST-0001"
STARTING_BALANCE = 4_200.00
OUTFLOW_CATEGORIES: tuple[str, ...] = ("Dining", "Groceries", "Transport", "Entertainment", "Utilities", "Shopping")
SALARY_AMOUNT = 2_100.00


def _transaction_id(index: int) -> str:
    return f"TXN-A8B-{index:06d}"


def demo_account_id(world: World) -> str:
    for account in world.accounts:
        if account["customer_id"] == DEMO_CUSTOMER_ID:
            return account["account_id"]
    raise LookupError(f"no account found for {DEMO_CUSTOMER_ID}")


def build_daily_activity(world: World) -> list[dict]:
    """One dict per baseline day: ``{date, inflows: [...], outflows: [...]}``.

    Each inflow/outflow is ``(category, amount)``. Deterministic in day index
    and the run seed only, so the baseline and the scenario always agree on
    history that has already happened.
    """
    activity: list[dict] = []
    for day in range(max(world.baseline_days, 1)):
        date = (world.baseline_from + timedelta(days=day)).date()
        outflow_count = det_int(world.seed, "a8b-outflow-count", day, low=3, high=5)
        outflows = [
            (
                det_choice(OUTFLOW_CATEGORIES, world.seed, "a8b-category", day, slot),
                round(det_float(world.seed, "a8b-outflow-amount", day, slot, low=6.0, high=140.0), 2),
            )
            for slot in range(outflow_count)
        ]
        inflows = [("Salary", SALARY_AMOUNT)] if day % 7 == 0 else []
        activity.append({"date": date, "inflows": inflows, "outflows": outflows})
    return activity


def last_ending_balance(world: World) -> float:
    balance = STARTING_BALANCE
    for day in build_daily_activity(world):
        inflow_total = sum(amount for _, amount in day["inflows"])
        outflow_total = sum(amount for _, amount in day["outflows"])
        balance += inflow_total - outflow_total
    return round(balance, 2)


def seed_baseline(world: World, run_id: int) -> list[TableBatch]:
    transaction_rows: list[tuple] = []
    daily_rows: list[tuple] = []

    account_id = demo_account_id(world)
    merchants = world.merchants
    counter = 0
    balance = STARTING_BALANCE
    for day_index, day in enumerate(build_daily_activity(world)):
        day_start = world.baseline_from + timedelta(days=day_index)
        inflow_total = 0.0
        outflow_total = 0.0
        for slot, (category, amount) in enumerate(day["inflows"] + day["outflows"]):
            counter += 1
            direction = "inflow" if (category, amount) in day["inflows"] else "outflow"
            merchant = merchants[det_int(world.seed, "a8b-merchant", day_index, slot, low=0, high=len(merchants) - 1)]
            event_time = day_start + timedelta(
                seconds=det_int(world.seed, "a8b-event-offset", day_index, slot, low=0, high=86_399)
            )
            transaction_rows.append(
                (
                    run_id,
                    _transaction_id(counter),
                    DEMO_CUSTOMER_ID,
                    account_id,
                    event_time,
                    merchant["merchant_id"],
                    category,
                    amount,
                    amount,
                    "USD",
                    direction,
                    None,
                )
            )
            if direction == "inflow":
                inflow_total += amount
            else:
                outflow_total += amount

        net_flow = round(inflow_total - outflow_total, 2)
        balance = round(balance + net_flow, 2)
        daily_rows.append(
            (run_id, DEMO_CUSTOMER_ID, day["date"], round(inflow_total, 2), round(outflow_total, 2), net_flow, balance)
        )

    return [
        TableBatch("customer_transaction", TABLE_COLUMNS["customer_transaction"], transaction_rows),
        TableBatch("customer_financial_daily", TABLE_COLUMNS["customer_financial_daily"], daily_rows),
    ]
