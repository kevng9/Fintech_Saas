"""A1_REVIEW_SPIKE: a one-hour surge in one high-intent digital cohort.

The burst owns 100 new ``digital_session`` starts for the ``high_mobile``
intent cohort. Of those, 80 submit an ``application`` (sessions 0-79) and 40
of those 80 are referred to ``manual_review`` (applications 0-39). Exactly 20
of the 80 applications land on ``outcome_status = 'approved'``
(applications 0-19); the rest are declined. That fixes the published rates
exactly:

    referral_rate     = 40 / 80 = 0.50
    submit_to_open    = 20 / 80 = 0.25
"""

from __future__ import annotations

from datetime import timedelta

from ..generator import World
from ..generators.a1_digital import CAMPAIGNS, REVIEW_REASON_CODES
from ..generators.shared_dims import DEVICE_COUNT, PRODUCT_COUNT, device_id, product_id
from ..rng import det_choice, det_int
from ..tables import TABLE_COLUMNS
from .base import ScenarioDefinition, TableBatch

SCENARIO_ID = "A1_REVIEW_SPIKE"
WINDOW_MINUTES = 60
INTENT_COHORT = "high_mobile"
CHANNEL = "mobile_app"
SESSION_COUNT = 100
APPLICATION_COUNT = 80
REVIEW_COUNT = 40
APPROVED_COUNT = 20
DEMO_COUNTRY = "US"

DEFINITION = ScenarioDefinition(
    scenario_id=SCENARIO_ID,
    anchor_id="a1",
    name="Account-opening review spike",
    description=(
        "A one-hour surge of 100 high-intent digital sessions where 80 submit an "
        "application, 40 are referred to manual review, and 20 open an account. "
        "The referral rate and submit-to-open conversion for the injected cohort "
        "are exact."
    ),
    metric_window="T+60m from injection watermark",
    window_minutes=WINDOW_MINUTES,
    expected_deltas={
        "segment": {"intent_cohort": INTENT_COHORT, "channel": CHANNEL},
        "rows_inserted": {
            "digital_session": SESSION_COUNT,
            "application": APPLICATION_COUNT,
            "manual_review": REVIEW_COUNT,
        },
        "after": {
            "sessions_started": SESSION_COUNT,
            "applications_submitted": APPLICATION_COUNT,
            "referred_to_review": REVIEW_COUNT,
            "applications_approved": APPROVED_COUNT,
            "referral_rate": REVIEW_COUNT / APPLICATION_COUNT,
            "submit_to_open_rate": APPROVED_COUNT / APPLICATION_COUNT,
        },
        "tolerance": {"referral_rate": 0.0005, "submit_to_open_rate": 0.0005},
        "narrative": (
            "The high_mobile cohort adds 100 session starts, 80 applications, 40 "
            "manual-review referrals, and 20 approved openings: a 50 percent "
            "referral rate and a 25 percent submit-to-open conversion."
        ),
    },
)


def _session_id(index: int) -> str:
    return f"SESS-A1RS-{index:04d}"


def _application_id(index: int) -> str:
    return f"APP-A1RS-{index:04d}"


def _review_id(index: int) -> str:
    return f"REV-A1RS-{index:04d}"


def build_rows(world: World, run_id: int, start_minute: int) -> list[TableBatch]:
    window_start = world.minute_start(start_minute)
    session_rows: list[tuple] = []
    application_rows: list[tuple] = []
    review_rows: list[tuple] = []

    for index in range(SESSION_COUNT):
        session_id = _session_id(index)
        customer = world.pick_customer(DEMO_COUNTRY, SCENARIO_ID, "customer", index)
        device = device_id(det_int(world.seed, SCENARIO_ID, "device", index, low=1, high=DEVICE_COUNT))
        campaign = det_choice(CAMPAIGNS, world.seed, SCENARIO_ID, "campaign", index)
        minute_offset = (index * WINDOW_MINUTES) // SESSION_COUNT
        started_at = window_start + timedelta(minutes=minute_offset, seconds=(index * 7) % 60)
        session_rows.append(
            (
                run_id,
                session_id,
                customer["customer_id"],
                CHANNEL,
                device,
                campaign,
                INTENT_COHORT,
                started_at,
                SCENARIO_ID,
            )
        )

        if index >= APPLICATION_COUNT:
            continue
        application_id = _application_id(index)
        submitted_at = started_at + timedelta(seconds=90 + (index % 30) * 5)
        outcome_status = "approved" if index < APPROVED_COUNT else "declined"
        product = product_id(det_int(world.seed, SCENARIO_ID, "product", index, low=1, high=PRODUCT_COUNT))

        if index < REVIEW_COUNT:
            referred_at = submitted_at + timedelta(minutes=1 + (index % 3))
            resolved_at = referred_at + timedelta(minutes=2 + (index % 4))
            review_rows.append(
                (
                    run_id,
                    _review_id(index),
                    application_id,
                    referred_at,
                    det_choice(REVIEW_REASON_CODES, world.seed, SCENARIO_ID, "reason", index),
                    outcome_status,
                    resolved_at,
                    SCENARIO_ID,
                )
            )
            decision_at = resolved_at
        else:
            decision_at = submitted_at + timedelta(minutes=1 + (index % 5))

        application_rows.append(
            (
                run_id,
                application_id,
                session_id,
                product,
                submitted_at,
                "decided",
                outcome_status,
                decision_at,
                SCENARIO_ID,
            )
        )

    return [
        TableBatch("digital_session", TABLE_COLUMNS["digital_session"], session_rows),
        TableBatch("application", TABLE_COLUMNS["application"], application_rows),
        TableBatch("manual_review", TABLE_COLUMNS["manual_review"], review_rows),
    ]
