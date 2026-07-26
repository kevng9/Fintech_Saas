"""A5_CASE_SURGE: 20 disputes tagged MERCHANT_OUTAGE, 12 due within the hour.

Each dispute links to a real historical ``payment_event`` row for this run
(same "regenerate a past minute, don't re-insert it" pattern
``A4_CORRESPONDENT_SPIKE`` uses). 12 of the 20 disputes (indices 0-11) get a
``due_at`` inside 60 minutes of the injection watermark, so they count toward
SLA risk (``aa_dispute_sla_risk`` flags anything due inside the next 24
logical hours, and 60 minutes is comfortably inside that window); the other 8
are due days out and stay outside it.
"""

from __future__ import annotations

from datetime import timedelta

from ..generator import World
from ..generators.a5_disputes import PRIORITIES, QUEUES
from ..rng import det_choice, det_float, det_int
from ..tables import TABLE_COLUMNS
from .base import ScenarioDefinition, TableBatch

SCENARIO_ID = "A5_CASE_SURGE"
WINDOW_MINUTES = 15
DISPUTE_COUNT = 20
SLA_RISK_COUNT = 12
REASON_CODE = "MERCHANT_OUTAGE"
QUEUE = "queue_disputes_escalated"


DEFINITION = ScenarioDefinition(
    scenario_id=SCENARIO_ID,
    anchor_id="a5",
    name="Merchant outage dispute surge",
    description=(
        "20 new disputes land tagged MERCHANT_OUTAGE, 12 of them due within 60 "
        "minutes of the injection watermark. Queue depth rises by 20 and "
        "SLA-risk count rises by exactly 12."
    ),
    metric_window="T+15m from injection watermark",
    window_minutes=WINDOW_MINUTES,
    expected_deltas={
        "segment": {"reason_code": REASON_CODE, "queue_id": QUEUE},
        "rows_inserted": {"dispute_case": DISPUTE_COUNT},
        "after": {
            "queue_depth_delta": DISPUTE_COUNT,
            "sla_risk_delta": SLA_RISK_COUNT,
        },
        "tolerance": {},
        "narrative": (
            "Queue depth rises by 20 MERCHANT_OUTAGE disputes; 12 of them are due "
            "within the hour and rise the SLA-risk count."
        ),
    },
)


def _dispute_id(index: int) -> str:
    return f"DISP-A5CS-{index:03d}"


def build_rows(world: World, run_id: int, start_minute: int) -> list[TableBatch]:
    window_start = world.minute_start(start_minute)

    history_minute = max(start_minute - 1440, 0)
    candidates = world.generate_minute(run_id, history_minute)

    dispute_rows: list[tuple] = []
    for index in range(DISPUTE_COUNT):
        payment = candidates[det_int(world.seed, SCENARIO_ID, "payment", index, low=0, high=max(len(candidates) - 1, 0))] if candidates else None
        payment_id = payment[1] if payment else f"PAY-{run_id}-SYNTH-{index}"
        customer_id = payment[4] if payment else world.pick_customer("US", SCENARIO_ID, "customer", index)["customer_id"]

        opened_at = window_start + timedelta(minutes=index % WINDOW_MINUTES)
        if index < SLA_RISK_COUNT:
            due_at = window_start + timedelta(minutes=5 + index * 4)  # inside 60 minutes
        else:
            due_at = window_start + timedelta(days=3 + (index - SLA_RISK_COUNT))  # safely outside 24h

        disputed_amount = round(det_float(world.seed, SCENARIO_ID, "amount", index, low=25.0, high=800.0), 2)
        dispute_rows.append(
            (
                run_id,
                _dispute_id(index),
                payment_id,
                customer_id,
                opened_at,
                due_at,
                "open",
                REASON_CODE,
                det_choice(PRIORITIES, world.seed, SCENARIO_ID, "priority", index),
                QUEUE,
                f"OWN-{1 + index % 5:03d}",
                disputed_amount,
                SCENARIO_ID,
            )
        )

    return [TableBatch("dispute_case", TABLE_COLUMNS["dispute_case"], dispute_rows)]
