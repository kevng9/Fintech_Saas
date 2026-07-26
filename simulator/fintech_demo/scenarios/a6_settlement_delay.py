"""A6_SETTLEMENT_DELAY: a USD 25,000,000 inbound settlement goes missing.

The baseline (``generators/a6_liquidity.py``) seeds a pending inbound
settlement of exactly USD 25,000,000 for ``DELAY_ENTITY_ID`` /
``DELAY_CURRENCY``. This scenario inserts one offsetting settlement for the
same entity and currency: still ``status = 'pending'`` (so it is still summed
by ``aa_liquidity_position``, migration 010) but with amount
-25,000,000. The two rows net to zero, so the entity's projected 24-hour
liquidity falls by exactly USD 25,000,000 relative to the baseline without
any row being updated in place, matching spec section 9.4.
"""

from __future__ import annotations

from datetime import timedelta

from ..generator import World
from ..generators.a6_liquidity import DELAY_COUNTERPARTY_ID, DELAY_CURRENCY, DELAY_ENTITY_ID
from ..tables import TABLE_COLUMNS
from .base import ScenarioDefinition, TableBatch

SCENARIO_ID = "A6_SETTLEMENT_DELAY"
WINDOW_MINUTES = 5
DELAY_AMOUNT_USD = 25_000_000.00
SETTLEMENT_ID = "STL-A6SD-0001"

DEFINITION = ScenarioDefinition(
    scenario_id=SCENARIO_ID,
    anchor_id="a6",
    name="Inbound settlement delay",
    description=(
        "A synthetic USD 25,000,000 inbound settlement the baseline expected soon "
        "is offset by a new pending settlement of the same size and opposite "
        "sign. Projected 24-hour liquidity for the entity falls by USD "
        "25,000,000 and settlement-at-risk rises by the same amount."
    ),
    metric_window="T+5m from injection watermark",
    window_minutes=WINDOW_MINUTES,
    expected_deltas={
        "segment": {"entity_id": DELAY_ENTITY_ID, "currency": DELAY_CURRENCY},
        "rows_inserted": {"settlement": 1},
        "after": {
            "settlement_at_risk_usd": DELAY_AMOUNT_USD,
            "liquidity_delta_usd": -DELAY_AMOUNT_USD,
        },
        "tolerance": {"settlement_at_risk_usd": 0.005},
        "narrative": (
            "A USD 25,000,000 inbound settlement is delayed: projected 24-hour "
            "liquidity for the entity falls by USD 25,000,000."
        ),
    },
)


def build_rows(world: World, run_id: int, start_minute: int) -> list[TableBatch]:
    window_start = world.minute_start(start_minute)
    row = (
        run_id,
        SETTLEMENT_ID,
        DELAY_ENTITY_ID,
        DELAY_COUNTERPARTY_ID,
        DELAY_CURRENCY,
        -DELAY_AMOUNT_USD,
        -DELAY_AMOUNT_USD,
        "inbound",
        window_start,
        window_start + timedelta(days=10),
        "pending",
        SCENARIO_ID,
    )
    return [TableBatch("settlement", TABLE_COLUMNS["settlement"], [row])]
