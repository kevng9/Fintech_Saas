"""A4 AML Operations baseline: a small open alert backlog.

Alerts link to real background ``payment_event`` rows the same way the A3
baseline does, so ``aa_aml_entity_activity`` has linked-transaction amounts to
aggregate. ``A4_CORRESPONDENT_SPIKE`` adds exactly one more high-priority
alert on top of this backlog.
"""

from __future__ import annotations

from datetime import timedelta

from ..generator import World
from ..rng import det_choice, det_int
from ..rowbatch import TableBatch
from ..tables import TABLE_COLUMNS

RULE_IDS: tuple[str, ...] = ("RULE-STRUCT-01", "RULE-VELOCITY-02", "RULE-GEO-03", "RULE-SHELL-04")
PRIORITIES: tuple[str, ...] = ("low", "medium", "high")
RISK_BANDS: tuple[str, ...] = ("low", "medium", "high")
QUEUES: tuple[str, ...] = ("queue_triage", "queue_investigation", "queue_escalation")
SOURCE_TYPES: tuple[str, ...] = ("transaction_log", "kyc_profile", "sanctions_screen", "device_log")
COMPLETENESS: tuple[str, ...] = ("complete", "incomplete")
ALERTS_PER_DAY = 2
LINKS_PER_ALERT = 4
EVIDENCE_PER_ALERT = 3
PRIOR_CASES = 8


def _alert_id(index: int) -> str:
    return f"AMLA-A4B-{index:06d}"


def _evidence_id(index: int) -> str:
    return f"AMLE-A4B-{index:06d}"


def _prior_case_id(index: int) -> str:
    return f"AMLC-A4B-{index:06d}"


def seed_baseline(world: World, run_id: int) -> list[TableBatch]:
    alert_rows: list[tuple] = []
    link_rows: list[tuple] = []
    evidence_rows: list[tuple] = []
    case_history_rows: list[tuple] = []

    accounts_by_customer = {account["customer_id"]: account for account in world.accounts}
    counter = 0
    baseline_minutes = world.baseline_minutes
    for day in range(max(world.baseline_days, 1)):
        for _ in range(ALERTS_PER_DAY):
            counter += 1
            customer = world.customers[
                det_int(world.seed, "a4b-customer", counter, low=0, high=len(world.customers) - 1)
            ]
            account = accounts_by_customer.get(customer["customer_id"])
            if account is None:
                continue
            alert_id = _alert_id(counter)
            created_at = world.baseline_from + timedelta(
                days=day,
                seconds=det_int(world.seed, "a4b-created-offset", counter, low=0, high=86_399),
            )
            sla_due_at = created_at + timedelta(hours=det_int(world.seed, "a4b-sla", counter, low=12, high=96))
            priority = det_choice(PRIORITIES, world.seed, "a4b-priority", counter)
            status = "open" if det_int(world.seed, "a4b-status", counter, low=0, high=9) < 7 else "closed"
            alert_rows.append(
                (
                    run_id,
                    alert_id,
                    customer["customer_id"],
                    account["account_id"],
                    det_choice(RULE_IDS, world.seed, "a4b-rule", counter),
                    priority,
                    det_choice(RISK_BANDS, world.seed, "a4b-risk", counter),
                    created_at,
                    sla_due_at,
                    status,
                    det_choice(QUEUES, world.seed, "a4b-queue", counter),
                    None,
                )
            )

            minute_index = det_int(
                world.seed,
                "a4b-minute",
                counter,
                low=day * 1440,
                high=min((day + 1) * 1440 - 1, max(baseline_minutes - 1, 0)),
            )
            candidates = world.generate_minute(run_id, minute_index)
            for slot in range(LINKS_PER_ALERT):
                if not candidates:
                    break
                payment = candidates[
                    det_int(world.seed, "a4b-link", counter, slot, low=0, high=len(candidates) - 1)
                ]
                link_rows.append((run_id, alert_id, payment[1], None))

            for slot in range(EVIDENCE_PER_ALERT):
                counter_evidence = counter * EVIDENCE_PER_ALERT + slot
                observed_at = created_at + timedelta(
                    seconds=det_int(world.seed, "a4b-evidence-offset", counter, slot, low=60, high=3_600)
                )
                evidence_rows.append(
                    (
                        run_id,
                        _evidence_id(counter_evidence),
                        alert_id,
                        det_choice(SOURCE_TYPES, world.seed, "a4b-source-type", counter, slot),
                        f"SRC-{det_int(world.seed, 'a4b-source-id', counter, slot, low=1, high=999):04d}",
                        observed_at,
                        f"Observed fact {slot + 1} for {alert_id}.",
                        det_choice(COMPLETENESS, world.seed, "a4b-completeness", counter, slot),
                        None,
                    )
                )

    for index in range(1, PRIOR_CASES + 1):
        customer = world.customers[
            det_int(world.seed, "a4b-prior-customer", index, low=0, high=len(world.customers) - 1)
        ]
        opened_at = world.baseline_from + timedelta(
            days=det_int(world.seed, "a4b-prior-day", index, low=0, high=max(world.baseline_days - 1, 0)),
            hours=det_int(world.seed, "a4b-prior-hour", index, low=0, high=23),
        )
        disposition = "closed_no_action" if index % 3 else "sar_filed"
        case_history_rows.append(
            (run_id, _prior_case_id(index), customer["customer_id"], opened_at, disposition)
        )

    return [
        TableBatch("aml_alert", TABLE_COLUMNS["aml_alert"], alert_rows),
        TableBatch("aml_alert_transaction", TABLE_COLUMNS["aml_alert_transaction"], link_rows),
        TableBatch("aml_evidence", TABLE_COLUMNS["aml_evidence"], evidence_rows),
        TableBatch("aml_case_history", TABLE_COLUMNS["aml_case_history"], case_history_rows),
    ]
