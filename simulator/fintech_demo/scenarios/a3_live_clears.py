"""A3_LIVE_CLEARS: a high score stops a charge, then the customer approves it.

A card-not-present purchase from an unfamiliar country scores high enough that
the issuer would decline it. The same payment is stepped up. The customer
approves it from the phone already registered to the account, and the retry
is approved. The investigator closes the case legitimate. Nothing is written
off. A rule does not book confirmed loss.
"""

from __future__ import annotations

import json
from datetime import timedelta

from ..generator import PAYMENT_EVENT_COLUMNS, SEQUENCE_STRIDE, World, payment_id_for
from ..generators.a3_fraud import case_note
from ..generators.shared_dims import device_id
from ..model import merchants_for_country_category, to_usd
from ..tables import TABLE_COLUMNS
from .base import ScenarioDefinition, TableBatch

SCENARIO_ID = "A3_LIVE_CLEARS"
WINDOW_MINUTES = 10
SEQUENCE_OFFSET = 61_000
AMOUNT = 186.40
REGISTERED_DEVICE = device_id(12)
CASE_ID = "FCASE-A3CL-000"
ALERT_ID = "FALT-A3CL-000"

DEFINITION = ScenarioDefinition(
    scenario_id=SCENARIO_ID,
    anchor_id="a3",
    name="Step-up clears a false decline",
    description=(
        "A card-not-present charge scores high enough to stop. The customer "
        "approves that same payment from the registered phone, the retry is "
        "approved, and the case closes legitimate with no loss."
    ),
    metric_window="T+10m from injection watermark",
    window_minutes=WINDOW_MINUTES,
    expected_deltas={
        "segment": {"channel": "card_not_present", "fraud_type": "account_takeover"},
        "rows_inserted": {
            "payment_event": 2,
            "fraud_alert": 1,
            "fraud_case": 1,
            "fraud_evidence": 2,
        },
        "after": {
            "cases_total": 1,
            "confirmed_fraud_cases": 0,
            "legitimate_cases": 1,
            "open_cases": 0,
            "confirmed_loss_usd": 0,
            "false_positive_rate": 1.0,
        },
        "tolerance": {"confirmed_loss_usd": 0.005, "false_positive_rate": 0.0005},
        "narrative": (
            "A $186.40 card-not-present charge from an unfamiliar country scores "
            "high enough to stop. The customer approves that same payment from "
            "the phone registered to the account. The retry is approved. The "
            "case closes legitimate, and nothing is written off."
        ),
    },
)


def build_rows(world: World, run_id: int, start_minute: int) -> list[TableBatch]:
    window_start = world.minute_start(start_minute)
    customer = world.pick_customer("US", SCENARIO_ID, "customer")
    merchant = merchants_for_country_category(world.merchants, "US", "Electronics")[0]
    stopped_at = window_start + timedelta(seconds=20)
    approved_at = window_start + timedelta(minutes=2)
    base = start_minute * SEQUENCE_STRIDE + SEQUENCE_OFFSET
    stopped_id = payment_id_for(run_id, base)
    approved_id = payment_id_for(run_id, base + 1)

    def payment(payment_id: str, sequence_no: int, event_time, response_code: str, approved: int) -> tuple:
        return (
            run_id,
            payment_id,
            sequence_no,
            event_time,
            customer["customer_id"],
            merchant["merchant_id"],
            "P1",
            "card_ecommerce",
            "Visa",
            AMOUNT,
            to_usd(AMOUNT, "USD"),
            "USD",
            response_code,
            approved,
            240,
            "US",
            SCENARIO_ID,
        )

    payment_rows = [
        payment(stopped_id, base, stopped_at, "RISK_DECLINE", 0),
        payment(approved_id, base + 1, approved_at, "APPROVED", 1),
    ]
    alert_at = stopped_at + timedelta(seconds=5)
    alert_rows = [
        (
            run_id,
            ALERT_ID,
            stopped_id,
            REGISTERED_DEVICE,
            "card_not_present",
            alert_at,
            0.88,
            "account_takeover",
            json.dumps(["geo_anomaly"]),
            "stepped_up",
            SCENARIO_ID,
        )
    ]
    note = case_note(["geo_anomaly"], "legitimate", world.seed, SCENARIO_ID, 0)
    case_rows = [
        (
            run_id,
            CASE_ID,
            ALERT_ID,
            alert_at,
            approved_at + timedelta(minutes=1),
            "INV-002",
            "legitimate",
            0.0,
            note.text,
            note.embedding_sql,
            SCENARIO_ID,
        )
    ]
    evidence_rows = [
        (
            run_id,
            "FEVD-A3CL-000",
            CASE_ID,
            "risk_score",
            ALERT_ID,
            "Score 0.88. Unfamiliar country on a card-not-present charge. The attempt was stopped, not written off.",
            alert_at,
            SCENARIO_ID,
        ),
        (
            run_id,
            "FEVD-A3CL-001",
            CASE_ID,
            "step_up",
            REGISTERED_DEVICE,
            "Customer approved the same $186.40 payment from the registered phone. The retry was approved.",
            approved_at,
            SCENARIO_ID,
        ),
    ]
    return [
        TableBatch("payment_event", PAYMENT_EVENT_COLUMNS, payment_rows),
        TableBatch("fraud_alert", TABLE_COLUMNS["fraud_alert"], alert_rows),
        TableBatch("fraud_case", TABLE_COLUMNS["fraud_case"], case_rows),
        TableBatch("fraud_evidence", TABLE_COLUMNS["fraud_evidence"], evidence_rows),
    ]
