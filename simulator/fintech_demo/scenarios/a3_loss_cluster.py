"""A3_LOSS_CLUSTER: a burst of transactions and alerts with human dispositions.

100 new ``payment_event`` rows (tagged ``A3_LOSS_CLUSTER``) stand in for the
"100 transactions" spec section 9.4 calls for. 12 of them each get a
``fraud_alert`` and a ``fraud_case``: human fixtures close 5 as
``confirmed_fraud`` at USD 500 of loss each (USD 2,500 total) and 7 as
``legitimate`` with zero loss, so the false-positive rate for this cohort is
exact:

    false_positive_rate = legitimate / (confirmed_fraud + legitimate)
                         = 7 / 12 = 0.583333...
"""

from __future__ import annotations

import json
from datetime import timedelta

from ..generator import (
    PAYMENT_EVENT_COLUMNS,
    SCENARIO_SEQUENCE_OFFSET,
    SEQUENCE_STRIDE,
    World,
    payment_id_for,
)
from ..generators.a3_fraud import CHANNELS, FRAUD_TYPES, REASON_CODE_POOL
from ..generators.shared_dims import DEVICE_COUNT, device_id
from ..model import merchants_for_country_category, to_usd
from ..rng import det_choice, det_int
from ..tables import TABLE_COLUMNS
from .base import ScenarioDefinition, TableBatch

SCENARIO_ID = "A3_LOSS_CLUSTER"
WINDOW_MINUTES = 10
TRANSACTION_COUNT = 100
ALERT_COUNT = 12
CONFIRMED_FRAUD_COUNT = 5
LEGITIMATE_COUNT = 7
LOSS_PER_CASE = 500.00
TOTAL_LOSS = LOSS_PER_CASE * CONFIRMED_FRAUD_COUNT
DEMO_COUNTRY = "US"
BURST_CATEGORY = "Electronics"

DEFINITION = ScenarioDefinition(
    scenario_id=SCENARIO_ID,
    anchor_id="a3",
    name="Fraud loss cluster",
    description=(
        "100 new transactions and 12 fraud alerts land together; human fixtures "
        "close 5 cases as confirmed fraud at USD 500 each and 7 as legitimate, "
        "so confirmed loss rises by USD 2,500 and the cohort's false-positive "
        "rate is exact."
    ),
    metric_window="T+10m from injection watermark",
    window_minutes=WINDOW_MINUTES,
    expected_deltas={
        "segment": {"channel": CHANNELS[0]},
        "rows_inserted": {
            "payment_event": TRANSACTION_COUNT,
            "fraud_alert": ALERT_COUNT,
            "fraud_case": ALERT_COUNT,
            "fraud_evidence": ALERT_COUNT,
        },
        "after": {
            "cases_total": ALERT_COUNT,
            "confirmed_fraud_cases": CONFIRMED_FRAUD_COUNT,
            "legitimate_cases": LEGITIMATE_COUNT,
            "confirmed_loss_usd": TOTAL_LOSS,
            "false_positive_rate": LEGITIMATE_COUNT / ALERT_COUNT,
        },
        "tolerance": {"confirmed_loss_usd": 0.005, "false_positive_rate": 0.0005},
        "narrative": (
            "12 new alerts close as 5 confirmed fraud (USD 2,500 total loss) and 7 "
            "legitimate: a 58.33 percent false-positive rate for the cohort."
        ),
    },
)


def _payment_id(run_id: int, sequence_no: int) -> str:
    return payment_id_for(run_id, sequence_no)


def _alert_id(index: int) -> str:
    return f"FALT-A3LC-{index:03d}"


def _case_id(index: int) -> str:
    return f"FCASE-A3LC-{index:03d}"


def _evidence_id(index: int) -> str:
    return f"FEVD-A3LC-{index:03d}"


def build_rows(world: World, run_id: int, start_minute: int) -> list[TableBatch]:
    window_start = world.minute_start(start_minute)
    merchants = merchants_for_country_category(world.merchants, DEMO_COUNTRY, BURST_CATEGORY)

    payment_rows: list[tuple] = []
    payment_ids: list[str] = []
    for position in range(TRANSACTION_COUNT):
        minute_index = start_minute + (position * WINDOW_MINUTES) // TRANSACTION_COUNT
        sequence_no = minute_index * SEQUENCE_STRIDE + SCENARIO_SEQUENCE_OFFSET + position
        payment_id = _payment_id(run_id, sequence_no)
        payment_ids.append(payment_id)
        merchant = merchants[det_int(world.seed, SCENARIO_ID, "merchant", position, low=0, high=len(merchants) - 1)]
        customer = world.pick_customer(DEMO_COUNTRY, SCENARIO_ID, "customer", position)
        amount = world.amount_for(merchant["merchant_category"], SCENARIO_ID, "amount", position)
        event_time = window_start + timedelta(seconds=(position * 60.0 * WINDOW_MINUTES / TRANSACTION_COUNT))
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
                "APPROVED",
                1,
                310,
                DEMO_COUNTRY,
                SCENARIO_ID,
            )
        )

    alert_rows: list[tuple] = []
    case_rows: list[tuple] = []
    evidence_rows: list[tuple] = []
    for index in range(ALERT_COUNT):
        payment_id = payment_ids[index * (TRANSACTION_COUNT // ALERT_COUNT)]
        created_at = window_start + timedelta(minutes=1 + index % 5)
        alert_id = _alert_id(index)
        device = device_id(det_int(world.seed, SCENARIO_ID, "device", index, low=1, high=DEVICE_COUNT))
        channel = det_choice(CHANNELS, world.seed, SCENARIO_ID, "channel", index)
        fraud_type = det_choice(FRAUD_TYPES, world.seed, SCENARIO_ID, "fraud-type", index)
        reason_codes = [det_choice(REASON_CODE_POOL, world.seed, SCENARIO_ID, "reason", index)]
        score = round(0.55 + (index % 5) * 0.08, 4)
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
                "closed",
                SCENARIO_ID,
            )
        )

        disposition = "confirmed_fraud" if index < CONFIRMED_FRAUD_COUNT else "legitimate"
        confirmed_loss = LOSS_PER_CASE if disposition == "confirmed_fraud" else 0.0
        opened_at = created_at + timedelta(minutes=2)
        closed_at = opened_at + timedelta(hours=2 + index % 6)
        case_rows.append(
            (
                run_id,
                _case_id(index),
                alert_id,
                opened_at,
                closed_at,
                f"INV-{1 + index % 6:03d}",
                disposition,
                confirmed_loss,
                f"Human review closed as {disposition}.",
                SCENARIO_ID,
            )
        )
        evidence_rows.append(
            (
                run_id,
                _evidence_id(index),
                _case_id(index),
                "device_history",
                device,
                "linked to prior alerts in the burst window",
                opened_at,
                SCENARIO_ID,
            )
        )

    return [
        TableBatch("payment_event", PAYMENT_EVENT_COLUMNS, payment_rows),
        TableBatch("fraud_alert", TABLE_COLUMNS["fraud_alert"], alert_rows),
        TableBatch("fraud_case", TABLE_COLUMNS["fraud_case"], case_rows),
        TableBatch("fraud_evidence", TABLE_COLUMNS["fraud_evidence"], evidence_rows),
    ]
