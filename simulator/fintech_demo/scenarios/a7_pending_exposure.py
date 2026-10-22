"""A7_PENDING_EXPOSURE: a pending USD 5,000,000 Transportation/California request.

The baseline (``generators/a7_credit.py``) books exactly USD 100,000,000 of
outstanding exposure, USD 20,000,000 of it in ``TARGET_INDUSTRY`` /
``TARGET_GEOGRAPHY``, so the segment's booked concentration share starts at
20.00 percent. This scenario adds one pending (``review_status != 'decided'``)
credit application requesting USD 5,000,000 in that same segment, with two
evidence exceptions. Booked exposure is untouched; the pro forma share
``aa_portfolio_concentration`` (migration 011) computes moves to

    (20,000,000 + 5,000,000) / (100,000,000 + 5,000,000) = 23.809524 percent

the illustrative 23.81 percent spec section 9.4 publishes.
"""

from __future__ import annotations

from datetime import timedelta

from ..generator import World
from ..generators.a7_credit import TARGET_GEOGRAPHY, TARGET_INDUSTRY
from ..generators.shared_dims import PRODUCT_COUNT, product_id
from ..rng import det_int
from ..tables import TABLE_COLUMNS
from .base import ScenarioDefinition, TableBatch

SCENARIO_ID = "A7_PENDING_EXPOSURE"
WINDOW_MINUTES = 5
PENDING_AMOUNT_USD = 5_000_000.00
APPLICATION_ID = "CAPP-A7PE-0001"
EVIDENCE_COUNT = 2
BOOKED_SEGMENT_USD = 20_000_000.00
BOOKED_TOTAL_USD = 100_000_000.00

DEFINITION = ScenarioDefinition(
    scenario_id=SCENARIO_ID,
    anchor_id="a7",
    name="Pending Transportation/California exposure",
    description=(
        "A pending USD 5,000,000 Transportation credit application in "
        "California adds two evidence exceptions. Pending amount rises by USD "
        "5,000,000; illustrative pro forma concentration for the segment moves "
        "from 20.00 percent to 23.81 percent; booked exposure is unchanged."
    ),
    metric_window="T+5m from injection watermark",
    window_minutes=WINDOW_MINUTES,
    expected_deltas={
        "segment": {"industry_code": TARGET_INDUSTRY, "geography_id": TARGET_GEOGRAPHY},
        "rows_inserted": {"credit_application": 1, "credit_evidence": EVIDENCE_COUNT},
        "after": {
            "pending_amount_usd": PENDING_AMOUNT_USD,
            "booked_concentration_share": BOOKED_SEGMENT_USD / BOOKED_TOTAL_USD,
            "pro_forma_concentration_share": (BOOKED_SEGMENT_USD + PENDING_AMOUNT_USD)
            / (BOOKED_TOTAL_USD + PENDING_AMOUNT_USD),
            "booked_outstanding_delta_usd": 0.0,
        },
        "tolerance": {"pro_forma_concentration_share": 0.0005, "booked_concentration_share": 0.0005},
        "narrative": (
            "Pending amount rises by USD 5,000,000; illustrative concentration "
            "moves from 20.00 percent to 23.81 percent, leaving 1.19 points of "
            "headroom against the illustrative 25 percent segment limit; booked "
            "exposure does not change."
        ),
    },
)


def build_rows(world: World, run_id: int, start_minute: int) -> list[TableBatch]:
    window_start = world.minute_start(start_minute)
    customer = world.pick_customer("US", SCENARIO_ID, "customer")

    application_row = (
        run_id,
        APPLICATION_ID,
        customer["customer_id"],
        product_id(det_int(world.seed, SCENARIO_ID, "product", low=1, high=PRODUCT_COUNT)),
        "commercial_banking",
        window_start,
        PENDING_AMOUNT_USD,
        TARGET_INDUSTRY,
        TARGET_GEOGRAPHY,
        "in_review",
        1,
        None,
        SCENARIO_ID,
    )

    evidence_rows = [
        (
            run_id,
            f"CEVD-A7PE-{index:02d}",
            APPLICATION_ID,
            "financial_statement",
            "debt_service_coverage" if index == 0 else "collateral_valuation",
            0.0,
            window_start + timedelta(minutes=index + 1),
            "exception" if index == 0 else "incomplete",
            f"provenance://a7-scenario/{APPLICATION_ID}/{index}",
            SCENARIO_ID,
        )
        for index in range(EVIDENCE_COUNT)
    ]

    return [
        TableBatch("credit_application", TABLE_COLUMNS["credit_application"], [application_row]),
        TableBatch("credit_evidence", TABLE_COLUMNS["credit_evidence"], evidence_rows),
    ]
