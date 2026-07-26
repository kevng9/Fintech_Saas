"""A5 Dispute Resolution Lens baseline: a small open dispute queue.

Each dispute links to a real background ``payment_event`` row, the same
pattern the A3 and A4 baselines use, so the amount and customer on the
dispute trace back to a synthetic authorization. ``A5_CASE_SURGE`` adds 20
more disputes tagged ``MERCHANT_OUTAGE`` on top of this baseline.
"""

from __future__ import annotations

from datetime import timedelta

from ..generator import World
from ..rng import det_choice, det_float, det_int
from ..rowbatch import TableBatch
from ..tables import TABLE_COLUMNS

REASON_CODES: tuple[str, ...] = ("DUPLICATE_CHARGE", "GOODS_NOT_RECEIVED", "FRAUD_CLAIM", "BILLING_ERROR")
PRIORITIES: tuple[str, ...] = ("low", "medium", "high")
QUEUES: tuple[str, ...] = ("queue_disputes_1", "queue_disputes_2", "queue_disputes_escalated")
STATUSES: tuple[str, ...] = ("open", "pending_customer", "closed")
CONTACT_CHANNELS: tuple[str, ...] = ("email", "phone", "chat")
DISPUTES_PER_DAY = 3


def _dispute_id(index: int) -> str:
    return f"DISP-A5B-{index:06d}"


def _event_id(index: int) -> str:
    return f"DEVT-A5B-{index:06d}"


def _contact_id(index: int) -> str:
    return f"CONT-A5B-{index:06d}"


def _credit_id(index: int) -> str:
    return f"CRED-A5B-{index:06d}"


def seed_baseline(world: World, run_id: int) -> list[TableBatch]:
    dispute_rows: list[tuple] = []
    event_rows: list[tuple] = []
    contact_rows: list[tuple] = []
    credit_rows: list[tuple] = []

    counter = 0
    baseline_minutes = world.baseline_minutes
    for day in range(max(world.baseline_days, 1)):
        minute_index = det_int(
            world.seed,
            "a5b-minute",
            day,
            low=day * 1440,
            high=min((day + 1) * 1440 - 1, max(baseline_minutes - 1, 0)),
        )
        candidates = world.generate_minute(run_id, minute_index)
        for _ in range(DISPUTES_PER_DAY):
            counter += 1
            if not candidates:
                break
            payment = candidates[
                det_int(world.seed, "a5b-payment", counter, low=0, high=len(candidates) - 1)
            ]
            payment_id, customer_id = payment[1], payment[4]
            opened_at = payment[3] + timedelta(
                days=det_int(world.seed, "a5b-open-delay-days", counter, low=1, high=5)
            )
            due_at = opened_at + timedelta(days=det_int(world.seed, "a5b-due-days", counter, low=3, high=14))
            status = det_choice(STATUSES, world.seed, "a5b-status", counter)
            dispute_id = _dispute_id(counter)
            disputed_amount = round(det_float(world.seed, "a5b-amount", counter, low=15.0, high=650.0), 2)
            dispute_rows.append(
                (
                    run_id,
                    dispute_id,
                    payment_id,
                    customer_id,
                    opened_at,
                    due_at,
                    status,
                    det_choice(REASON_CODES, world.seed, "a5b-reason", counter),
                    det_choice(PRIORITIES, world.seed, "a5b-priority", counter),
                    det_choice(QUEUES, world.seed, "a5b-queue", counter),
                    f"OWN-{det_int(world.seed, 'a5b-owner', counter, low=1, high=8):03d}",
                    disputed_amount,
                    None,
                )
            )
            event_rows.append(
                (
                    run_id,
                    _event_id(counter),
                    dispute_id,
                    "opened",
                    opened_at,
                    "customer",
                    None,
                    None,
                )
            )
            contact_rows.append(
                (
                    run_id,
                    _contact_id(counter),
                    dispute_id,
                    det_choice(CONTACT_CHANNELS, world.seed, "a5b-contact-channel", counter),
                    "inbound",
                    opened_at + timedelta(minutes=5),
                )
            )
            if status == "closed":
                credit_rows.append(
                    (
                        run_id,
                        _credit_id(counter),
                        dispute_id,
                        disputed_amount,
                        "issued",
                        due_at,
                    )
                )

    return [
        TableBatch("dispute_case", TABLE_COLUMNS["dispute_case"], dispute_rows),
        TableBatch("dispute_event", TABLE_COLUMNS["dispute_event"], event_rows),
        TableBatch("customer_contact", TABLE_COLUMNS["customer_contact"], contact_rows),
        TableBatch("provisional_credit", TABLE_COLUMNS["provisional_credit"], credit_rows),
    ]
