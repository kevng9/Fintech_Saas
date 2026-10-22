"""A3_LOSS_CLUSTER: a burst of transactions and alerts with human dispositions.

100 new ``payment_event`` rows (tagged ``A3_LOSS_CLUSTER``) stand in for the
"100 transactions" spec section 9.4 calls for. 12 of them each get a
``fraud_alert`` and a ``fraud_case``: human fixtures close 5 as
``confirmed_fraud``, each writing off its flagged purchase (USD 2,500 total),
and 7 as ``legitimate`` with zero loss, so the false-positive rate for this
cohort is exact:

    false_positive_rate = legitimate / (confirmed_fraud + legitimate)
                         = 7 / 12 = 0.583333...

The cluster carries a pattern an investigator can find. All 12 alerts are
card testing on card-not-present. The 5 confirmed-fraud alerts share one
device and carry the ``velocity_breach`` and ``cvv_retry`` reason codes. The 7
legitimate alerts each use a different device and were flagged on
``geo_anomaly`` alone.
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
from ..generators.a3_fraud import case_note
from ..generators.shared_dims import DEVICE_COUNT, device_id
from ..model import merchants_for_country_category, to_usd
from ..rng import det_int
from ..tables import TABLE_COLUMNS
from .base import ScenarioDefinition, TableBatch

SCENARIO_ID = "A3_LOSS_CLUSTER"
WINDOW_MINUTES = 10
TRANSACTION_COUNT = 100
ALERT_COUNT = 12
CONFIRMED_FRAUD_COUNT = 5
LEGITIMATE_COUNT = 7
ALERT_STRIDE = TRANSACTION_COUNT // ALERT_COUNT
# Amounts of the five fraudulent purchases; each is written off in full.
CONFIRMED_LOSSES = (412.37, 538.90, 487.15, 601.22, 460.36)
TOTAL_LOSS = round(sum(CONFIRMED_LOSSES), 2)
DEMO_COUNTRY = "US"
BURST_CATEGORY = "Electronics"
CLUSTER_CHANNEL = "card_not_present"
CLUSTER_FRAUD_TYPE = "card_testing"
CONFIRMED_REASON_CODES = ("velocity_breach", "cvv_retry")
LEGITIMATE_REASON_CODES = ("geo_anomaly",)

DEFINITION = ScenarioDefinition(
    scenario_id=SCENARIO_ID,
    anchor_id="a3",
    name="Fraud loss cluster",
    description=(
        "100 new transactions and 12 fraud alerts land together; human fixtures "
        "close 5 cases as confirmed fraud and 7 as legitimate, so confirmed "
        "loss rises by USD 2,500 and the cohort's false-positive "
        "rate is exact."
    ),
    metric_window="T+10m from injection watermark",
    window_minutes=WINDOW_MINUTES,
    expected_deltas={
        "segment": {"channel": CLUSTER_CHANNEL, "fraud_type": CLUSTER_FRAUD_TYPE},
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
            "12 new card-testing alerts close as 5 confirmed fraud (USD 2,500 total "
            "loss) and 7 legitimate: a 58.33 percent false-positive rate for the "
            "cohort. Every confirmed case shares one device and carries "
            "velocity_breach; every false positive was flagged on geo_anomaly alone."
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
        if position % ALERT_STRIDE == 0 and position // ALERT_STRIDE < CONFIRMED_FRAUD_COUNT:
            amount = CONFIRMED_LOSSES[position // ALERT_STRIDE]
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

    shared_device_number = det_int(world.seed, SCENARIO_ID, "shared-device", low=1, high=DEVICE_COUNT)

    alert_rows: list[tuple] = []
    case_rows: list[tuple] = []
    evidence_rows: list[tuple] = []
    for index in range(ALERT_COUNT):
        payment_id = payment_ids[index * ALERT_STRIDE]
        created_at = window_start + timedelta(minutes=1 + index % 5)
        alert_id = _alert_id(index)
        disposition = "confirmed_fraud" if index < CONFIRMED_FRAUD_COUNT else "legitimate"
        if disposition == "confirmed_fraud":
            device = device_id(shared_device_number)
            reason_codes = list(CONFIRMED_REASON_CODES)
        else:
            # Offsets 1, 6, ..., 31 keep the seven legitimate devices distinct from each
            # other and from the shared device.
            offset = 1 + (index - CONFIRMED_FRAUD_COUNT) * 5
            device = device_id((shared_device_number - 1 + offset) % DEVICE_COUNT + 1)
            reason_codes = list(LEGITIMATE_REASON_CODES)
        channel = CLUSTER_CHANNEL
        fraud_type = CLUSTER_FRAUD_TYPE
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

        confirmed_loss = CONFIRMED_LOSSES[index] if disposition == "confirmed_fraud" else 0.0
        opened_at = created_at + timedelta(minutes=2)
        closed_at = opened_at + timedelta(hours=2 + index % 6)
        note = case_note(reason_codes, disposition, world.seed, SCENARIO_ID, index)
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
                note.text,
                note.embedding_sql,
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
                (
                    f"shared by {CONFIRMED_FRAUD_COUNT} alerts in the burst window"
                    if disposition == "confirmed_fraud"
                    else "no other alerts in the burst window"
                ),
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
