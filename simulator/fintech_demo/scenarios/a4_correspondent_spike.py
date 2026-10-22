"""A4_CORRESPONDENT_SPIKE: one high-priority alert with 25 linked transactions.

The new alert links to 25 payment_event rows already present in this run's
history (background traffic the shared logical clock already generated), the
same "link to real payments without re-inserting them" pattern the A4
baseline uses. Its SLA due date sits inside the next 24 logical hours, so it
counts as both a new open-backlog member and a new SLA-risk member; its 25
``aml_evidence`` rows are the "evidence count rises by 25" delta.
"""

from __future__ import annotations

from datetime import timedelta

from ..generator import World
from ..generators.a4_aml import COMPLETENESS, SOURCE_TYPES
from ..rng import det_choice, det_int
from ..tables import TABLE_COLUMNS
from .base import ScenarioDefinition, TableBatch

SCENARIO_ID = "A4_CORRESPONDENT_SPIKE"
WINDOW_MINUTES = 5
LINK_COUNT = 25
EVIDENCE_COUNT = 25
ALERT_ID = "AMLA-A4CS-0001"
RULE_ID = "RULE-CORRESPONDENT-05"
PRIORITY = "high"
RISK_BAND = "high"
QUEUE = "queue_escalation"
SLA_HOURS = 6

DEFINITION = ScenarioDefinition(
    scenario_id=SCENARIO_ID,
    anchor_id="a4",
    name="Correspondent banking alert spike",
    description=(
        "One new high-priority AML alert links 25 existing transactions and "
        "carries 25 evidence records. Open backlog, high-priority count, and "
        "SLA-risk count each rise by exactly one; evidence rises by 25."
    ),
    metric_window="T+5m from injection watermark",
    window_minutes=WINDOW_MINUTES,
    expected_deltas={
        "segment": {"rule_id": RULE_ID, "priority": PRIORITY},
        "rows_inserted": {
            "aml_alert": 1,
            "aml_alert_transaction": LINK_COUNT,
            "aml_evidence": EVIDENCE_COUNT,
        },
        "after": {
            "open_backlog_delta": 1,
            "high_priority_delta": 1,
            "sla_risk_delta": 1,
            "evidence_delta": EVIDENCE_COUNT,
            "linked_transaction_count": LINK_COUNT,
        },
        "tolerance": {},
        "narrative": (
            "One high-priority alert lands with 25 linked transactions and 25 "
            "evidence records, all within the next 24-hour SLA window."
        ),
    },
)


def build_rows(world: World, run_id: int, start_minute: int) -> list[TableBatch]:
    window_start = world.minute_start(start_minute)
    created_at = window_start
    sla_due_at = created_at + timedelta(hours=SLA_HOURS)

    customer = world.pick_customer("US", SCENARIO_ID, "customer")
    account = next((a for a in world.accounts if a["customer_id"] == customer["customer_id"]), None)
    account_id = account["account_id"] if account else "ACCT-0001"

    alert_rows = [
        (
            run_id,
            ALERT_ID,
            customer["customer_id"],
            account_id,
            RULE_ID,
            PRIORITY,
            RISK_BAND,
            created_at,
            sla_due_at,
            "open",
            QUEUE,
            SCENARIO_ID,
        )
    ]

    # Link to real historical payment_event rows for this run rather than
    # inserting new ones: the background traffic the shared logical clock
    # already produced for a recent minute is regenerated (not re-inserted)
    # purely to read off its payment_id values.
    history_minute = max(start_minute - 1440, 0)
    candidates = world.generate_minute(run_id, history_minute)
    link_rows: list[tuple] = []
    for index in range(LINK_COUNT):
        if not candidates:
            break
        payment = candidates[det_int(world.seed, SCENARIO_ID, "link", index, low=0, high=len(candidates) - 1)]
        link_rows.append((run_id, ALERT_ID, payment[1], SCENARIO_ID))

    evidence_rows: list[tuple] = []
    for index in range(EVIDENCE_COUNT):
        observed_at = created_at + timedelta(seconds=30 * (index + 1))
        evidence_rows.append(
            (
                run_id,
                f"AMLE-A4CS-{index:03d}",
                ALERT_ID,
                det_choice(SOURCE_TYPES, world.seed, SCENARIO_ID, "source-type", index),
                f"SRC-A4CS-{index:03d}",
                observed_at,
                f"Correspondent activity fact {index + 1} for {ALERT_ID}.",
                det_choice(COMPLETENESS, world.seed, SCENARIO_ID, "completeness", index),
                SCENARIO_ID,
            )
        )

    return [
        TableBatch("aml_alert", TABLE_COLUMNS["aml_alert"], alert_rows),
        TableBatch("aml_alert_transaction", TABLE_COLUMNS["aml_alert_transaction"], link_rows),
        TableBatch("aml_evidence", TABLE_COLUMNS["aml_evidence"], evidence_rows),
    ]
