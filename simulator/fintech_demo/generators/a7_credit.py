"""A7 Credit and Exposure Management baseline: booked exposure and application history.

``TARGET_INDUSTRY`` / ``TARGET_GEOGRAPHY`` name the segment
``A7_PENDING_EXPOSURE`` targets. The baseline books exactly USD 100,000,000
of outstanding exposure across six facilities, USD 20,000,000 of it in that
segment, so ``aa_portfolio_concentration`` starts at a 20.00 percent share;
adding the scenario's USD 5,000,000 pending application moves the pro forma
share to (20 + 5) / (100 + 5) = 23.81 percent, the published delta, without
changing booked exposure at all (spec section 9.4).
"""

from __future__ import annotations

from datetime import timedelta

from ..generator import World
from ..rng import det_choice, det_float, det_int
from ..rowbatch import TableBatch
from ..tables import TABLE_COLUMNS
from .shared_dims import ENTITY_COUNT, PRODUCT_COUNT, entity_id, product_id

TARGET_INDUSTRY = "TRANSPORTATION"
TARGET_GEOGRAPHY = "GEO-USCA"
TARGET_OUTSTANDING_USD = 20_000_000.00
OTHER_SEGMENTS: tuple[tuple[str, str], ...] = (
    ("RETAIL", "GEO-USTX"),
    ("MANUFACTURING", "GEO-USNY"),
    ("HEALTHCARE", "GEO-GB"),
    ("TECHNOLOGY", "GEO-DE"),
    ("ENERGY", "GEO-USFL"),
)
OTHER_SEGMENT_OUTSTANDING_USD = 16_000_000.00
RISK_GRADES: tuple[str, ...] = ("A", "B", "C")
CHANNELS: tuple[str, ...] = ("commercial_banking", "digital", "relationship_manager")
APPLICATIONS_PER_DAY = 4
EVIDENCE_PER_APPLICATION = 2
EVIDENCE_SOURCE_TYPES: tuple[str, ...] = ("financial_statement", "bureau_report", "bank_statement")


def _facility_id(index: int) -> str:
    return f"FAC-A7B-{index:03d}"


def _application_id(index: int) -> str:
    return f"CAPP-A7B-{index:06d}"


def _evidence_id(index: int) -> str:
    return f"CEVD-A7B-{index:06d}"


def seed_baseline(world: World, run_id: int) -> list[TableBatch]:
    snapshot_rows: list[tuple] = []
    application_rows: list[tuple] = []
    evidence_rows: list[tuple] = []

    as_of_time = world.baseline_from + timedelta(days=max(world.baseline_days - 1, 0), hours=6)

    facility_index = 1
    snapshot_rows.append(
        (
            run_id,
            as_of_time,
            _facility_id(facility_index),
            entity_id(1 + (facility_index - 1) % ENTITY_COUNT),
            TARGET_INDUSTRY,
            TARGET_GEOGRAPHY,
            det_choice(RISK_GRADES, world.seed, "a7b-grade", facility_index),
            TARGET_OUTSTANDING_USD,
            round(TARGET_OUTSTANDING_USD * 1.15, 2),
        )
    )
    for industry, geography in OTHER_SEGMENTS:
        facility_index += 1
        snapshot_rows.append(
            (
                run_id,
                as_of_time,
                _facility_id(facility_index),
                entity_id(1 + (facility_index - 1) % ENTITY_COUNT),
                industry,
                geography,
                det_choice(RISK_GRADES, world.seed, "a7b-grade", facility_index),
                OTHER_SEGMENT_OUTSTANDING_USD,
                round(OTHER_SEGMENT_OUTSTANDING_USD * 1.15, 2),
            )
        )

    all_segments = ((TARGET_INDUSTRY, TARGET_GEOGRAPHY),) + OTHER_SEGMENTS
    counter = 0
    for day in range(max(world.baseline_days, 1)):
        for _ in range(APPLICATIONS_PER_DAY):
            counter += 1
            customer = world.customers[
                det_int(world.seed, "a7b-customer", counter, low=0, high=len(world.customers) - 1)
            ]
            industry, geography = all_segments[
                det_int(world.seed, "a7b-segment", counter, low=0, high=len(all_segments) - 1)
            ]
            submitted_at = world.baseline_from + timedelta(
                days=day, seconds=det_int(world.seed, "a7b-submit-offset", counter, low=0, high=86_399)
            )
            approved = det_int(world.seed, "a7b-decision", counter, low=0, high=9) < 7
            decision_time = submitted_at + timedelta(
                hours=det_int(world.seed, "a7b-decision-hours", counter, low=2, high=48)
            )
            application_id = _application_id(counter)
            application_rows.append(
                (
                    run_id,
                    application_id,
                    customer["customer_id"],
                    product_id(det_int(world.seed, "a7b-product", counter, low=1, high=PRODUCT_COUNT)),
                    det_choice(CHANNELS, world.seed, "a7b-channel", counter),
                    submitted_at,
                    round(det_float(world.seed, "a7b-amount", counter, low=50_000.0, high=2_000_000.0), 2),
                    industry,
                    geography,
                    "decided",
                    1 if det_int(world.seed, "a7b-manual", counter, low=0, high=9) < 3 else 0,
                    decision_time,
                    None,
                )
            )
            for slot in range(EVIDENCE_PER_APPLICATION):
                evidence_counter = counter * EVIDENCE_PER_APPLICATION + slot
                evidence_rows.append(
                    (
                        run_id,
                        _evidence_id(evidence_counter),
                        application_id,
                        det_choice(EVIDENCE_SOURCE_TYPES, world.seed, "a7b-source", counter, slot),
                        "debt_service_coverage" if slot == 0 else "annual_revenue",
                        round(det_float(world.seed, "a7b-metric", counter, slot, low=0.8, high=4.5), 4),
                        submitted_at + timedelta(hours=slot + 1),
                        "verified",
                        f"provenance://a7-baseline/{application_id}/{slot}",
                        None,
                    )
                )

    return [
        TableBatch("portfolio_exposure_snapshot", TABLE_COLUMNS["portfolio_exposure_snapshot"], snapshot_rows),
        TableBatch("credit_application", TABLE_COLUMNS["credit_application"], application_rows),
        TableBatch("credit_evidence", TABLE_COLUMNS["credit_evidence"], evidence_rows),
    ]
