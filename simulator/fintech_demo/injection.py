"""Atomic, idempotent scenario injection (spec sections 9.1 and 9.5).

Injection pauses emission, takes the next unemitted logical minute as the
watermark, writes the complete scenario window in one transaction, and only
then advances the clock past the window. Baseline generation for the lanes the
scenario owns is suppressed inside the window, so no background event can drift
into the window the dashboard and the tests measure.
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from . import scenarios, state
from .config import TEMPLATE_RUN_ID, Settings
from .db import insert_many, query_one
from .generator import PAYMENT_EVENT_COLUMNS, World


class InjectionError(RuntimeError):
    pass


def existing_execution(cursor, run_id: int, scenario_id: str, idempotency_key: str):
    return query_one(
        cursor,
        "SELECT * FROM demo_scenario_execution "
        "WHERE run_id = %s AND scenario_id = %s AND idempotency_key = %s",
        (run_id, scenario_id, idempotency_key),
    )


def inject(
    settings: Settings,
    cursor,
    *,
    scenario_id: str,
    idempotency_key: str,
    actor_id: str = "cli",
    actor_role: str = "demo_administrator",
    request_id: str = "cli",
    world: World | None = None,
    freeze_after: bool = False,
) -> dict[str, Any]:
    started = time.time()
    definition = scenarios.get_definition(scenario_id)
    active = state.read_active(cursor)
    if active is None:
        raise InjectionError("No active run. Run reset first.")
    run_id = int(active["run_id"])
    if run_id == TEMPLATE_RUN_ID:
        raise InjectionError(
            "The template run is not injectable. Reset the demo to create an active run."
        )

    previous = existing_execution(cursor, run_id, scenario_id, idempotency_key)
    if previous is not None:
        return {
            "status": previous["status"],
            "idempotent_replay": True,
            "execution_id": previous["execution_id"],
            "window_start": previous["window_start"],
            "window_end": previous["window_end"],
            "rows_inserted": _loads(previous["rows_inserted"]),
        }

    execution_id = uuid.uuid4().hex
    cursor.execute(
        """
        INSERT INTO demo_scenario_execution (
            run_id, scenario_id, idempotency_key, execution_id, status, requested_at
        ) VALUES (%s, %s, %s, %s, 'running', NOW(6))
        """,
        (run_id, scenario_id, idempotency_key, execution_id),
    )

    world = world or World(settings.seed, settings.epoch, settings.baseline_days)
    was_running = active["stream_status"] == state.STATUS_RUNNING
    version = int(active["state_version"])
    if was_running:
        version = state.transition(
            cursor, expected_version=version, stream_status=state.STATUS_PAUSED
        )

    start_minute = int(active["minute_cursor"])
    end_minute = start_minute + definition.window_minutes
    window_start = world.minute_start(start_minute)
    window_end = world.minute_start(end_minute)

    # Every scenario writes its own tables via TableBatch, whether that is
    # only payment_event (A2) or several fact tables at once (A1, A3-A8).
    scenario_batches = scenarios.build_rows(scenario_id, world, run_id, start_minute)

    # The logical clock is shared across every anchor, so payment background
    # generation keeps running under a non-payment scenario's window unless
    # that scenario explicitly opts out. A2 keeps its historical behavior by
    # excluding only its own affected lane via excluded_segment_keys.
    background_rows: list[tuple] = []
    if not definition.suppress_payment_background:
        for minute_index in range(start_minute, end_minute):
            background_rows.extend(
                world.generate_minute(
                    run_id, minute_index, excluded_segment_keys=definition.excluded_segment_keys
                )
            )

    payment_scenario_rows = scenarios.rows_for_table(scenario_batches, "payment_event")
    max_sequence = max(
        [int(active["sequence_no"])]
        + [int(row[2]) for row in payment_scenario_rows]
        + [int(row[2]) for row in background_rows]
    )

    cursor.execute("BEGIN")
    try:
        rows_inserted: dict[str, int] = {}
        if background_rows:
            insert_many(cursor, "payment_event", PAYMENT_EVENT_COLUMNS, background_rows)
            rows_inserted["payment_event_background"] = len(background_rows)
        for batch in scenario_batches:
            insert_many(cursor, batch.table, batch.columns, batch.rows)
            key = "payment_event_scenario" if batch.table == "payment_event" else batch.table
            rows_inserted[key] = rows_inserted.get(key, 0) + len(batch.rows)
        state.advance_clock(
            cursor,
            logical_time=window_end,
            minute_cursor=end_minute,
            sequence_no=max_sequence,
        )
        cursor.execute(
            """
            UPDATE demo_scenario_execution
            SET status = 'complete', completed_at = NOW(6), logical_injection_time = %s,
                injection_sequence_no = %s, window_start = %s, window_end = %s,
                rows_inserted = %s
            WHERE run_id = %s AND scenario_id = %s AND idempotency_key = %s
            """,
            (
                window_start,
                max_sequence,
                window_start,
                window_end,
                json.dumps(rows_inserted),
                run_id,
                scenario_id,
                idempotency_key,
            ),
        )
        cursor.execute("COMMIT")
    except Exception as error:  # noqa: BLE001 - recorded and re-raised
        cursor.execute("ROLLBACK")
        cursor.execute(
            "UPDATE demo_scenario_execution SET status = 'failed', completed_at = NOW(6), "
            "error_text = %s WHERE run_id = %s AND scenario_id = %s AND idempotency_key = %s",
            (str(error)[:500], run_id, scenario_id, idempotency_key),
        )
        raise

    if was_running and not freeze_after:
        version = state.transition(
            cursor, expected_version=version, stream_status=state.STATUS_RUNNING
        )

    state.log_event(
        cursor,
        run_id=run_id,
        sequence_no=max_sequence,
        event_type="scenario.injected",
        logical_event_time=window_start,
        anchor_id=definition.anchor_id,
        payload=json.dumps(
            {
                "scenario_id": scenario_id,
                "window_start": window_start.isoformat(sep=" "),
                "window_end": window_end.isoformat(sep=" "),
                "rows": rows_inserted,
            }
        ),
        source_scenario=scenario_id,
    )
    state.audit(
        cursor,
        actor_id=actor_id,
        actor_role=actor_role,
        action="scenario.inject",
        request_id=request_id,
        outcome="complete",
        run_id=run_id,
        anchor_id=definition.anchor_id,
        state_version=version,
        detail=f"{scenario_id} window {window_start} to {window_end}",
    )
    return {
        "status": "complete",
        "idempotent_replay": False,
        "execution_id": execution_id,
        "scenario_id": scenario_id,
        "anchor_id": definition.anchor_id,
        "window_start": window_start,
        "window_end": window_end,
        "rows_inserted": rows_inserted,
        "state_version": version,
        "duration_seconds": round(time.time() - started, 2),
    }


def _loads(value: Any) -> Any:
    if value in (None, ""):
        return None
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return value
