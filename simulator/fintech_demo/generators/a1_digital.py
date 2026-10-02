"""A1 Digital Funnel Performance baseline: account-opening funnel history.

Seeds ``digital_session`` and ``application`` (plus a ``manual_review`` row for
whichever applications land in review) over the run's baseline window, spread
across several intent cohorts, so ``aa_digital_funnel``,
``aa_digital_review_comparison``, and ``aa_digital_intent_cohort`` have a
plausible history before ``A1_REVIEW_SPIKE`` runs. Volumes are modest by
design (spec section 8.4): this is scene-setting, not a load test.
"""

from __future__ import annotations

from datetime import timedelta

from ..generator import World
from ..rng import det_choice, det_float, det_int
from ..rowbatch import TableBatch
from ..tables import TABLE_COLUMNS
from .shared_dims import DEVICE_COUNT, PRODUCT_COUNT, device_id, product_id

INTENT_COHORTS: tuple[str, ...] = ("high_mobile", "medium_mobile", "low_web", "medium_web")
CHANNEL_BY_COHORT = {
    "high_mobile": "mobile_app",
    "medium_mobile": "mobile_app",
    "low_web": "web",
    "medium_web": "web",
}
COHORT_DAILY_STARTS: dict[str, int] = {
    "high_mobile": 18,
    "medium_mobile": 14,
    "low_web": 10,
    "medium_web": 12,
}
CAMPAIGNS: tuple[str, ...] = ("spring_promo", "referral_bonus", "organic", "paid_search")
REVIEW_REASON_CODES: tuple[str, ...] = (
    "income_verification",
    "identity_check",
    "document_upload",
    "risk_review",
)
SUBMIT_RATE = 0.70
REVIEW_RATE = 0.20
APPROVE_RATE_REVIEWED = 0.55
APPROVE_RATE_STRAIGHT = 0.82
_COUNTRIES = ("US", "GB", "DE", "CA")


def _session_id(index: int) -> str:
    return f"SESS-A1B-{index:06d}"


def _application_id(index: int) -> str:
    return f"APP-A1B-{index:06d}"


def _review_id(index: int) -> str:
    return f"REV-A1B-{index:06d}"


def seed_baseline(world: World, run_id: int) -> list[TableBatch]:
    session_rows: list[tuple] = []
    application_rows: list[tuple] = []
    review_rows: list[tuple] = []

    counter = 0
    for day in range(max(world.baseline_days, 1)):
        day_start = world.baseline_from + timedelta(days=day)
        for cohort in INTENT_COHORTS:
            daily_count = COHORT_DAILY_STARTS[cohort]
            channel = CHANNEL_BY_COHORT[cohort]
            for _ in range(daily_count):
                counter += 1
                session_id = _session_id(counter)
                country = det_choice(_COUNTRIES, world.seed, "a1b-country", counter)
                customer = world.pick_customer(country, "a1b-customer", counter)
                device = device_id(det_int(world.seed, "a1b-device", counter, low=1, high=DEVICE_COUNT))
                campaign = det_choice(CAMPAIGNS, world.seed, "a1b-campaign", counter)
                started_at = day_start + timedelta(
                    seconds=det_int(world.seed, "a1b-start-offset", counter, low=0, high=86_399)
                )
                session_rows.append(
                    (
                        run_id,
                        session_id,
                        customer["customer_id"],
                        channel,
                        device,
                        campaign,
                        cohort,
                        started_at,
                        None,
                    )
                )

                if det_float(world.seed, "a1b-submit", counter) >= SUBMIT_RATE:
                    continue
                application_id = _application_id(counter)
                product = product_id(det_int(world.seed, "a1b-product", counter, low=1, high=PRODUCT_COUNT))
                submitted_at = started_at + timedelta(
                    seconds=det_int(world.seed, "a1b-submit-offset", counter, low=30, high=3_000)
                )

                reviewed = det_float(world.seed, "a1b-review", counter) < REVIEW_RATE
                approve_rate = APPROVE_RATE_REVIEWED if reviewed else APPROVE_RATE_STRAIGHT
                approved = det_float(world.seed, "a1b-approve", counter) < approve_rate
                outcome_status = "approved" if approved else "declined"

                if reviewed:
                    referred_at = submitted_at + timedelta(
                        seconds=det_int(world.seed, "a1b-refer-offset", counter, low=60, high=1_800)
                    )
                    resolved_at = referred_at + timedelta(
                        seconds=det_int(world.seed, "a1b-resolve-offset", counter, low=600, high=7_200)
                    )
                    review_rows.append(
                        (
                            run_id,
                            _review_id(counter),
                            application_id,
                            referred_at,
                            det_choice(REVIEW_REASON_CODES, world.seed, "a1b-reason", counter),
                            outcome_status,
                            resolved_at,
                            None,
                        )
                    )
                    decision_at = resolved_at
                else:
                    decision_at = submitted_at + timedelta(
                        seconds=det_int(world.seed, "a1b-decision-offset", counter, low=120, high=3_600)
                    )

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
                        None,
                    )
                )

    return [
        TableBatch("digital_session", TABLE_COLUMNS["digital_session"], session_rows),
        TableBatch("application", TABLE_COLUMNS["application"], application_rows),
        TableBatch("manual_review", TABLE_COLUMNS["manual_review"], review_rows),
    ]
