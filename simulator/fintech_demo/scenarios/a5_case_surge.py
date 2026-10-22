"""A5_CASE_SURGE: dispute wave from one merchant's terminal outage a week ago.

During the outage, card payments appeared to fail, customers paid again by
other means, and both charges later posted. Disputes arrive in two waves with
reason code ``PAID_BY_OTHER_MEANS`` (the card-network category for this
pattern):

* 12 disputes (indices 0-11) were filed shortly after the outage. Each one
  reaches the issuer's five-business-day provisional-credit target (seven
  calendar days, stricter than the Regulation E ten-business-day limit)
  within the next 24 logical hours, so it counts toward SLA risk
  (``aa_dispute_sla_risk`` flags anything due inside the next 24 logical
  hours).
* 8 disputes (indices 12-19) arrive in the injection window as statements
  reach customers. They are due a week out and stay outside the risk window.

Every dispute links to a real approved ``payment_event`` row at the outage
merchant during the outage window a week before injection (same "regenerate
a past minute, don't re-insert it" pattern ``A4_CORRESPONDENT_SPIKE`` uses),
and disputes that payment's USD amount. The merchant is a North American
in-store merchant, so the outage concentrates on one ``merchant_id`` that
``aa_dispute_sla_risk`` and ``aa_dispute_queue_driver`` expose.
"""

from __future__ import annotations

import json
from datetime import timedelta

from ..generator import World
from ..generators.a5_disputes import PRIORITIES
from ..rng import det_choice
from ..tables import TABLE_COLUMNS
from .base import ScenarioDefinition, TableBatch

SCENARIO_ID = "A5_CASE_SURGE"
WINDOW_MINUTES = 15
DISPUTE_COUNT = 20
SLA_RISK_COUNT = 12
REASON_CODE = "PAID_BY_OTHER_MEANS"
QUEUE = "queue_disputes_escalated"
PROVISIONAL_CREDIT_TARGET = timedelta(days=7)
OUTAGE_REGION = "North America"
OUTAGE_CATEGORIES = ("Grocery", "Electronics", "Apparel")
OUTAGE_SEARCH_MINUTES = 240


DEFINITION = ScenarioDefinition(
    scenario_id=SCENARIO_ID,
    anchor_id="a5",
    name="Merchant outage dispute wave",
    description=(
        "20 PAID_BY_OTHER_MEANS disputes from one merchant's terminal outage a week "
        "ago. 12 filed right after the outage reach the five-business-day "
        "provisional-credit target within 24 logical hours; 8 more arrive now. "
        "Queue depth rises by 20 and SLA-risk count rises by exactly 12."
    ),
    metric_window="T+15m from injection watermark",
    window_minutes=WINDOW_MINUTES,
    expected_deltas={
        "segment": {"reason_code": REASON_CODE, "queue_id": QUEUE},
        "rows_inserted": {
            "dispute_case": DISPUTE_COUNT,
            "dispute_event": DISPUTE_COUNT + SLA_RISK_COUNT,
        },
        "after": {
            "queue_depth_delta": DISPUTE_COUNT,
            "sla_risk_delta": SLA_RISK_COUNT,
        },
        "tolerance": {},
        "narrative": (
            "Queue depth rises by 20 PAID_BY_OTHER_MEANS disputes from one merchant "
            "outage; 12 filed a week ago reach their provisional-credit target within "
            "24 logical hours and raise the SLA-risk count."
        ),
    },
)


def _dispute_id(index: int) -> str:
    return f"DISP-A5CS-{index:03d}"


def _event_id(index: int, suffix: str) -> str:
    return f"DEVT-A5CS-{index:03d}-{suffix}"


OPENED_NOTE = json.dumps(
    {"note": "Customer reports a card charge and a second payment for the same purchase during a terminal outage."}
)
EVIDENCE_NOTE = json.dumps({"note": "Requested proof of the second payment from the customer."})


def outage_merchant(world: World) -> dict:
    candidates = [
        m
        for m in world.merchants
        if m["region"] == OUTAGE_REGION and m["merchant_category"] in OUTAGE_CATEGORIES
    ]
    return world.pick_merchants(candidates, SCENARIO_ID, "merchant")


def outage_payments(world: World, run_id: int, start_minute: int, merchant_id: str) -> list[tuple]:
    """The first approved payments at the outage merchant from a week before injection."""
    outage_start = max(start_minute - 7 * 1440, 0)
    found: list[tuple] = []
    for minute in range(outage_start, outage_start + OUTAGE_SEARCH_MINUTES):
        for row in world.generate_minute(run_id, minute):
            if row[5] == merchant_id and row[13] == 1:
                found.append(row)
                if len(found) == DISPUTE_COUNT:
                    return found
    raise RuntimeError(
        f"{SCENARIO_ID}: only {len(found)} approved payments at {merchant_id} "
        f"within {OUTAGE_SEARCH_MINUTES} minutes of the outage start"
    )


def build_rows(world: World, run_id: int, start_minute: int) -> list[TableBatch]:
    window_start = world.minute_start(start_minute)
    merchant = outage_merchant(world)
    payments = outage_payments(world, run_id, start_minute, merchant["merchant_id"])

    dispute_rows: list[tuple] = []
    event_rows: list[tuple] = []
    for index, payment in enumerate(payments):
        first_wave = index < SLA_RISK_COUNT
        payment_id = payment[1]
        customer_id = payment[4]

        if first_wave:
            due_at = window_start + timedelta(hours=2, minutes=90 * index)
            opened_at = due_at - PROVISIONAL_CREDIT_TARGET
        else:
            opened_at = window_start + timedelta(minutes=(index - SLA_RISK_COUNT) % WINDOW_MINUTES)
            due_at = opened_at + PROVISIONAL_CREDIT_TARGET

        disputed_amount = float(payment[10])
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
        event_rows.append(
            (run_id, _event_id(index, "OPEN"), _dispute_id(index), "opened", opened_at, "customer", OPENED_NOTE, SCENARIO_ID)
        )
        if first_wave:
            event_rows.append(
                (
                    run_id,
                    _event_id(index, "EVID"),
                    _dispute_id(index),
                    "evidence_requested",
                    opened_at + timedelta(days=1),
                    "agent",
                    EVIDENCE_NOTE,
                    SCENARIO_ID,
                )
            )

    return [
        TableBatch("dispute_case", TABLE_COLUMNS["dispute_case"], dispute_rows),
        TableBatch("dispute_event", TABLE_COLUMNS["dispute_event"], event_rows),
    ]
