"""A8_DINING_SPIKE: three dining transactions totaling exactly USD 300.

All three land on ``CUST-0001``, the one identity every A8 view (migration
012) is physically filtered to. A matching ``customer_financial_daily`` row
for the injection date continues the running balance
``generators/a8_customer.build_daily_activity`` ends the baseline on, so
outflows and net cash flow for that date reflect the spike (spec section
9.4): outflows and dining spend rise by USD 300, net cash flow falls by
USD 300.
"""

from __future__ import annotations

from datetime import timedelta

from ..generator import World
from ..generators.a8_customer import DEMO_CUSTOMER_ID, demo_account_id, last_ending_balance
from ..tables import TABLE_COLUMNS
from .base import ScenarioDefinition, TableBatch

SCENARIO_ID = "A8_DINING_SPIKE"
WINDOW_MINUTES = 5
CATEGORY = "Dining"
AMOUNTS: tuple[float, ...] = (100.00, 100.00, 100.00)
TOTAL_AMOUNT = sum(AMOUNTS)

DEFINITION = ScenarioDefinition(
    scenario_id=SCENARIO_ID,
    anchor_id="a8",
    name="Dining spend spike",
    description=(
        "Three new dining transactions for the demo customer total exactly USD "
        "300. Dining spend and outflows rise by USD 300, and net cash flow "
        "falls by USD 300 for that day."
    ),
    metric_window="T+5m from injection watermark",
    window_minutes=WINDOW_MINUTES,
    expected_deltas={
        "segment": {"customer_id": DEMO_CUSTOMER_ID, "category": CATEGORY},
        "rows_inserted": {"customer_transaction": len(AMOUNTS), "customer_financial_daily": 1},
        "after": {
            "dining_spend_delta_usd": TOTAL_AMOUNT,
            "outflow_delta_usd": TOTAL_AMOUNT,
            "net_flow_delta_usd": -TOTAL_AMOUNT,
            "transactions_explained": len(AMOUNTS),
        },
        "tolerance": {"dining_spend_delta_usd": 0.005},
        "narrative": (
            "One embedded explanation traces a USD 300 dining change to three "
            "transactions. The proof is a trusted self-service evidence path that "
            "can be reused across digital customers, not the USD 300 itself."
        ),
    },
)


def build_rows(world: World, run_id: int, start_minute: int) -> list[TableBatch]:
    window_start = world.minute_start(start_minute)
    account_id = demo_account_id(world)
    merchant = world.merchants[0]

    transaction_rows = [
        (
            run_id,
            f"TXN-A8DS-{index:02d}",
            DEMO_CUSTOMER_ID,
            account_id,
            window_start + timedelta(minutes=index),
            merchant["merchant_id"],
            CATEGORY,
            amount,
            amount,
            "USD",
            "outflow",
            SCENARIO_ID,
        )
        for index, amount in enumerate(AMOUNTS)
    ]

    ending_balance = round(last_ending_balance(world) - TOTAL_AMOUNT, 2)
    daily_row = (
        run_id,
        DEMO_CUSTOMER_ID,
        window_start.date(),
        0.0,
        TOTAL_AMOUNT,
        -TOTAL_AMOUNT,
        ending_balance,
    )

    return [
        TableBatch("customer_transaction", TABLE_COLUMNS["customer_transaction"], transaction_rows),
        TableBatch("customer_financial_daily", TABLE_COLUMNS["customer_financial_daily"], [daily_row]),
    ]
