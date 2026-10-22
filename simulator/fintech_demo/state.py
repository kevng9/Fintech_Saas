"""Active-run state machine helpers.

``demo_active_run`` is the authoritative state (spec section 9.2). Only the
elected simulator leader transitions it, every transition carries an expected
``state_version``, and a stale transition simply fails instead of overwriting a
newer state.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from .db import query_one

STATUS_PREPARING = "PREPARING"
STATUS_PAUSED = "PAUSED"
STATUS_RUNNING = "RUNNING"
STATUS_RESETTING = "RESETTING"
STATUS_FAILED = "FAILED"

MUTABLE_COLUMNS = {
    "run_id",
    "logical_time",
    "stream_status",
    "speed_multiplier",
    "sequence_no",
    "minute_cursor",
    "analyst_mode",
    "leader_id",
    "leader_heartbeat_at",
}


class StaleStateError(RuntimeError):
    """Raised when a transition loses a race against a newer state version."""


def read_active(cursor) -> dict[str, Any] | None:
    return query_one(cursor, "SELECT * FROM demo_active_run WHERE singleton_id = 1")


def ensure_active_row(cursor, *, run_id: int, logical_time: datetime, analyst_mode: str) -> None:
    existing = read_active(cursor)
    if existing:
        return
    cursor.execute(
        """
        INSERT INTO demo_active_run (
            singleton_id, run_id, logical_time, stream_status, speed_multiplier,
            sequence_no, minute_cursor, analyst_mode, state_version, updated_at
        ) VALUES (1, %s, %s, %s, 1.0, 0, 0, %s, 1, NOW(6))
        """,
        (run_id, logical_time, STATUS_PAUSED, analyst_mode),
    )


def transition(cursor, *, expected_version: int | None, **fields: Any) -> int:
    """Apply a state transition and return the new state version."""
    unknown = set(fields) - MUTABLE_COLUMNS
    if unknown:
        raise ValueError(f"Unsupported state columns: {sorted(unknown)}")
    assignments = ", ".join(f"{column} = %s" for column in fields)
    params: list[Any] = list(fields.values())
    sql = (
        "UPDATE demo_active_run SET "
        + (assignments + ", " if assignments else "")
        + "state_version = state_version + 1, updated_at = NOW(6) "
        + "WHERE singleton_id = 1"
    )
    if expected_version is not None:
        sql += " AND state_version = %s"
        params.append(expected_version)
    cursor.execute(sql, tuple(params))
    if cursor.rowcount == 0:
        raise StaleStateError(
            "State version mismatch: another actor changed the demo state first."
        )
    row = read_active(cursor)
    return int(row["state_version"]) if row else 0


def advance_clock(
    cursor, *, logical_time: datetime, minute_cursor: int, sequence_no: int
) -> None:
    """Move the logical clock forward.

    Clock movement deliberately does not bump ``state_version``: the version
    guards control transitions (pause, resume, speed, reset) so an operator's
    If-Match request is not invalidated by ordinary event emission.
    """
    cursor.execute(
        "UPDATE demo_active_run SET logical_time = %s, minute_cursor = %s, "
        "sequence_no = %s, updated_at = NOW(6) WHERE singleton_id = 1",
        (logical_time, minute_cursor, sequence_no),
    )


def claim_leadership(cursor, leader_id: str, grace_seconds: float) -> bool:
    cursor.execute(
        "UPDATE demo_active_run "
        "SET leader_id = %s, leader_heartbeat_at = NOW(6), updated_at = NOW(6) "
        "WHERE singleton_id = 1 AND ("
        "  leader_id IS NULL OR leader_id = %s "
        f"  OR leader_heartbeat_at < DATE_SUB(NOW(6), INTERVAL {int(grace_seconds)} SECOND)"
        ")",
        (leader_id, leader_id),
    )
    return cursor.rowcount > 0


def log_event(
    cursor,
    *,
    run_id: int,
    sequence_no: int,
    event_type: str,
    logical_event_time: datetime,
    anchor_id: str | None = None,
    payload: str | None = None,
    source_scenario: str | None = None,
) -> None:
    cursor.execute(
        """
        INSERT INTO demo_event_log (
            run_id, sequence_no, anchor_id, event_type, logical_event_time,
            payload, source_scenario, ingested_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(6))
        """,
        (run_id, sequence_no, anchor_id, event_type, logical_event_time, payload, source_scenario),
    )


def audit(
    cursor,
    *,
    actor_id: str,
    actor_role: str,
    action: str,
    request_id: str,
    outcome: str,
    run_id: int | None = None,
    anchor_id: str | None = None,
    state_version: int | None = None,
    detail: str | None = None,
) -> None:
    cursor.execute(
        """
        INSERT INTO demo_audit (
            audit_id, occurred_at, actor_id, actor_role, action, anchor_id,
            request_id, run_id, state_version, outcome, detail
        ) VALUES (%s, NOW(6), %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            uuid.uuid4().hex,
            actor_id,
            actor_role,
            action,
            anchor_id,
            request_id,
            run_id,
            state_version,
            outcome,
            detail[:512] if detail else None,
        ),
    )
