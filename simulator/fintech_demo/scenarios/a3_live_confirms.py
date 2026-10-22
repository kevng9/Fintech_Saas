"""A3_LIVE_CONFIRMS: one small approval, then the same device gives itself away.

The first authorization is $2 and is approved. One attempt is not enough to
block. Within a few minutes the same device sends security-code failures and
then a larger charge. Those later attempts are declined, and one case is
opened for an investigator. Confirmed loss is still zero: a velocity breach
does not decide fraud.
"""

from __future__ import annotations

import json
from datetime import timedelta

from ..generator import PAYMENT_EVENT_COLUMNS, SEQUENCE_STRIDE, World, payment_id_for
from ..generators.a3_fraud import CaseNote
from ..generators.shared_dims import device_id
from ..model import merchants_for_country_category, to_usd
from ..tables import TABLE_COLUMNS
from .base import ScenarioDefinition, TableBatch

SCENARIO_ID = "A3_LIVE_CONFIRMS"
WINDOW_MINUTES = 10
SEQUENCE_OFFSET = 72_000
PROBE_AMOUNT = 2.00
LARGE_AMOUNT = 214.60
SHARED_DEVICE = device_id(18)
CASE_ID = "FCASE-A3CF-000"
# The approved probe is not alerted. The three CVV failures and the blocked
# larger charge are. Order matches the payment list below, skipping index 0.
ALERTED_PAYMENTS = (
    (1, "INVALID_CVV", PROBE_AMOUNT, 0.62),
    (2, "INVALID_CVV", PROBE_AMOUNT, 0.71),
    (3, "INVALID_CVV", PROBE_AMOUNT, 0.8),
    (4, "RISK_DECLINE", LARGE_AMOUNT, 0.93),
)

DEFINITION = ScenarioDefinition(
    scenario_id=SCENARIO_ID,
    anchor_id="a3",
    name="Live velocity confirms card testing",
    description=(
        "A $2 authorization is approved. The same device then fails the "
        "security code three times and attempts a larger charge. The later "
        "attempts are declined and one case is opened for review."
    ),
    metric_window="T+10m from injection watermark",
    window_minutes=WINDOW_MINUTES,
    expected_deltas={
        "segment": {"channel": "card_not_present", "fraud_type": "card_testing"},
        "rows_inserted": {
            "payment_event": 5,
            "fraud_alert": 4,
            "fraud_case": 1,
            "fraud_evidence": 2,
        },
        "after": {
            "cases_total": 1,
            "confirmed_fraud_cases": 0,
            "legitimate_cases": 0,
            "open_cases": 1,
            "confirmed_loss_usd": 0,
        },
        "tolerance": {"confirmed_loss_usd": 0.005},
        "narrative": (
            "A $2 authorization is approved. Within four minutes the same device "
            "fails the security code three times and attempts a $214.60 charge. "
            "Those later attempts are declined, and one case is opened for "
            "review. Confirmed loss stays zero until an investigator decides."
        ),
    },
)


def build_rows(world: World, run_id: int, start_minute: int) -> list[TableBatch]:
    window_start = world.minute_start(start_minute)
    customer = world.pick_customer("US", SCENARIO_ID, "customer")
    merchant = merchants_for_country_category(world.merchants, "US", "Digital Goods")[0]
    base = start_minute * SEQUENCE_STRIDE + SEQUENCE_OFFSET

    attempts = (
        (0, "APPROVED", PROBE_AMOUNT, 1),
        (1, "INVALID_CVV", PROBE_AMOUNT, 0),
        (2, "INVALID_CVV", PROBE_AMOUNT, 0),
        (3, "INVALID_CVV", PROBE_AMOUNT, 0),
        (4, "RISK_DECLINE", LARGE_AMOUNT, 0),
    )
    payment_rows = []
    payment_ids: dict[int, str] = {}
    for index, response_code, amount, approved in attempts:
        sequence_no = base + index
        payment_id = payment_id_for(run_id, sequence_no)
        payment_ids[index] = payment_id
        event_time = window_start + timedelta(minutes=index)
        payment_rows.append(
            (
                run_id,
                payment_id,
                sequence_no,
                event_time,
                customer["customer_id"],
                merchant["merchant_id"],
                "P1",
                "card_ecommerce",
                "Visa",
                amount,
                to_usd(amount, "USD"),
                "USD",
                response_code,
                approved,
                190,
                "US",
                SCENARIO_ID,
            )
        )

    alert_rows = []
    for position, (index, _response, _amount, score) in enumerate(ALERTED_PAYMENTS):
        alert_rows.append(
            (
                run_id,
                f"FALT-A3CF-{position:03d}",
                payment_ids[index],
                SHARED_DEVICE,
                "card_not_present",
                window_start + timedelta(minutes=index, seconds=15),
                score,
                "card_testing",
                json.dumps(["velocity_breach", "cvv_retry"] if index < 4 else ["velocity_breach"]),
                "open",
                SCENARIO_ID,
            )
        )

    note = CaseNote(
        observed=(
            "Rapid repeat card attempts from one device within minutes.",
            "Unusually high number of transactions in a very short time.",
        ),
        outcome="Awaiting customer contact.",
    )
    opened_at = window_start + timedelta(minutes=4, seconds=20)
    case_rows = [
        (
            run_id,
            CASE_ID,
            "FALT-A3CF-003",
            opened_at,
            None,
            "INV-004",
            "open",
            0.0,
            note.text,
            note.embedding_sql,
            SCENARIO_ID,
        )
    ]
    evidence_rows = [
        (
            run_id,
            "FEVD-A3CF-000",
            CASE_ID,
            "first_approval",
            payment_ids[0],
            "First $2 authorization approved. One attempt was not enough to block.",
            window_start + timedelta(seconds=20),
            SCENARIO_ID,
        ),
        (
            run_id,
            "FEVD-A3CF-001",
            CASE_ID,
            "device_velocity",
            SHARED_DEVICE,
            "Same device failed the security code three times, then a $214.60 charge was declined. Case opened for review.",
            opened_at,
            SCENARIO_ID,
        ),
    ]
    return [
        TableBatch("payment_event", PAYMENT_EVENT_COLUMNS, payment_rows),
        TableBatch("fraud_alert", TABLE_COLUMNS["fraud_alert"], alert_rows),
        TableBatch("fraud_case", TABLE_COLUMNS["fraud_case"], case_rows),
        TableBatch("fraud_evidence", TABLE_COLUMNS["fraud_evidence"], evidence_rows),
    ]
