"""A3 Fraud Strategy baseline: closed fraud cases with human dispositions.

Every ``fraud_alert`` links to a real ``payment_event`` row so
``aa_fraud_segment_evidence`` can join through to a merchant, customer, and
amount. Rows are picked from the background traffic ``World`` already knows
how to regenerate for any logical minute, so no extra payment rows are
inserted for the baseline (only ``A3_LOSS_CLUSTER`` adds new ones, tagged with
its own ``scenario_id``).
"""

from __future__ import annotations

import json
from datetime import timedelta

from ..generator import World
from ..rng import det_choice, det_float, det_int, det_weighted_choice
from ..rowbatch import TableBatch
from ..tables import TABLE_COLUMNS
from .shared_dims import DEVICE_COUNT, device_id

CHANNELS: tuple[str, ...] = ("card_not_present", "card_present", "atm", "online_banking")
FRAUD_TYPES: tuple[str, ...] = ("account_takeover", "card_testing", "synthetic_identity", "first_party")
REASON_CODE_POOL: tuple[str, ...] = (
    "velocity_breach",
    "device_mismatch",
    "geo_anomaly",
    "cvv_retry",
    "known_bad_device",
)
DISPOSITION_WEIGHTS = (("confirmed_fraud", 20), ("legitimate", 65), ("open", 15))
ALERTS_PER_DAY = 3


def _alert_id(index: int) -> str:
    return f"FALT-A3B-{index:06d}"


def _case_id(index: int) -> str:
    return f"FCASE-A3B-{index:06d}"


def _evidence_id(index: int) -> str:
    return f"FEVD-A3B-{index:06d}"


def seed_baseline(world: World, run_id: int) -> list[TableBatch]:
    alert_rows: list[tuple] = []
    case_rows: list[tuple] = []
    evidence_rows: list[tuple] = []

    counter = 0
    baseline_minutes = world.baseline_minutes
    for day in range(max(world.baseline_days, 1)):
        for _ in range(ALERTS_PER_DAY):
            counter += 1
            minute_index = det_int(
                world.seed,
                "a3b-minute",
                counter,
                low=day * 1440,
                high=min((day + 1) * 1440 - 1, max(baseline_minutes - 1, 0)),
            )
            candidates = world.generate_minute(run_id, minute_index)
            if not candidates:
                continue
            payment = candidates[
                det_int(world.seed, "a3b-payment", counter, low=0, high=len(candidates) - 1)
            ]
            payment_id = payment[1]
            event_time = payment[3]
            created_at = event_time + timedelta(seconds=det_int(world.seed, "a3b-delay", counter, low=30, high=900))

            alert_id = _alert_id(counter)
            device = device_id(det_int(world.seed, "a3b-device", counter, low=1, high=DEVICE_COUNT))
            channel = det_choice(CHANNELS, world.seed, "a3b-channel", counter)
            fraud_type = det_choice(FRAUD_TYPES, world.seed, "a3b-fraud-type", counter)
            reason_codes = [
                det_choice(REASON_CODE_POOL, world.seed, "a3b-reason", counter, slot)
                for slot in range(det_int(world.seed, "a3b-reason-count", counter, low=1, high=3))
            ]
            score = round(det_float(world.seed, "a3b-score", counter, low=0.35, high=0.99), 4)
            disposition = det_weighted_choice(DISPOSITION_WEIGHTS, world.seed, "a3b-disposition", counter)
            status = "closed" if disposition != "open" else "open"

            alert_rows.append(
                (
                    run_id,
                    alert_id,
                    payment_id,
                    device,
                    channel,
                    created_at,
                    score,
                    fraud_type,
                    json.dumps(reason_codes),
                    status,
                    None,
                )
            )

            opened_at = created_at + timedelta(seconds=det_int(world.seed, "a3b-open-delay", counter, low=60, high=1800))
            confirmed_loss = 0.0
            closed_at = None
            if disposition != "open":
                closed_at = opened_at + timedelta(
                    hours=det_int(world.seed, "a3b-close-hours", counter, low=2, high=72)
                )
                if disposition == "confirmed_fraud":
                    confirmed_loss = round(
                        det_float(world.seed, "a3b-loss", counter, low=50.0, high=1200.0), 2
                    )
            case_rows.append(
                (
                    run_id,
                    _case_id(counter),
                    alert_id,
                    opened_at,
                    closed_at,
                    f"INV-{det_int(world.seed, 'a3b-investigator', counter, low=1, high=12):03d}",
                    disposition,
                    confirmed_loss,
                    None,
                    None,
                )
            )
            evidence_rows.append(
                (
                    run_id,
                    _evidence_id(counter),
                    _case_id(counter),
                    "device_history",
                    device,
                    f"{det_int(world.seed, 'a3b-evidence-value', counter, low=1, high=9)} prior sightings",
                    opened_at,
                    None,
                )
            )

    return [
        TableBatch("fraud_alert", TABLE_COLUMNS["fraud_alert"], alert_rows),
        TableBatch("fraud_case", TABLE_COLUMNS["fraud_case"], case_rows),
        TableBatch("fraud_evidence", TABLE_COLUMNS["fraud_evidence"], evidence_rows),
    ]
