"""Simulator leader loop.

One elected leader owns the logical clock, event emission, and every control
transition. The web tier never writes demo state directly: it enqueues commands
in ``demo_command`` and the leader applies them, so pause, speed, injection and
reset are always serialised behind the same writer.

Speed semantics: 1x emits one logical minute of events per wall-clock second.
The event set for a logical minute is a pure function of the run seed and the
minute index, so changing speed changes how fast minutes arrive, never what
they contain.
"""

from __future__ import annotations

import json
import time
import uuid
from datetime import datetime
from typing import Any, Callable

from . import injection, scenarios, seed as seeding, state
from .config import Settings
from .db import connect, insert_many, query_all, query_one
from .generator import PAYMENT_EVENT_COLUMNS, World

MINUTES_PER_SECOND_AT_1X = 1.0
MAX_MINUTES_PER_TICK = 40
COMMAND_BATCH = 10

Log = Callable[[str], None]


class Simulator:
    def __init__(self, settings: Settings, *, leader_id: str | None = None, log: Log = print):
        self.settings = settings
        self.leader_id = leader_id or f"sim-{uuid.uuid4().hex[:8]}"
        self.log = log
        self.connection = connect(settings)
        self.cursor = self.connection.cursor()
        self._world: World | None = None
        self._world_run_id: int | None = None
        self._minute_budget = 0.0
        self._last_tick = time.monotonic()
        self._last_heartbeat = 0.0
        self._is_leader = False

    # -- lifecycle --------------------------------------------------------

    def close(self) -> None:
        try:
            self.cursor.close()
        finally:
            self.connection.close()

    def run_forever(self) -> None:
        self.log(
            f"simulator {self.leader_id} started against {self.settings.dsn_label} "
            f"(1x = {MINUTES_PER_SECOND_AT_1X:g} logical minute per second)"
        )
        try:
            while True:
                self.tick()
                time.sleep(self.settings.tick_seconds)
        except KeyboardInterrupt:
            self.log("simulator stopped by operator")
        finally:
            self.close()

    # -- one iteration ----------------------------------------------------

    def tick(self) -> dict[str, Any]:
        now = time.monotonic()
        elapsed = now - self._last_tick
        self._last_tick = now

        acquired = state.claim_leadership(
            self.cursor, self.leader_id, self.settings.heartbeat_grace_seconds
        )
        if not acquired:
            if self._is_leader:
                self.log("lost leadership: another simulator holds the lease")
            self._is_leader = False
            self._minute_budget = 0.0
            return {"leader": False}
        if not self._is_leader:
            self.log("acquired simulator leadership")
            self._is_leader = True

        processed = self.process_commands()
        emitted = self.emit_due_minutes(elapsed)
        return {"leader": True, "commands": processed, "minutes_emitted": emitted}

    # -- command plane ----------------------------------------------------

    def process_commands(self) -> int:
        queued = query_all(
            self.cursor,
            "SELECT * FROM demo_command WHERE status = 'queued' "
            f"ORDER BY created_at LIMIT {COMMAND_BATCH}",
        )
        handled = 0
        for command in queued:
            self.cursor.execute(
                "UPDATE demo_command SET status = 'claimed', claimed_at = NOW(6) "
                "WHERE command_id = %s AND status = 'queued'",
                (command["command_id"],),
            )
            if self.cursor.rowcount == 0:
                continue
            handled += 1
            try:
                result = self.execute_command(command)
                self.cursor.execute(
                    "UPDATE demo_command SET status = 'complete', completed_at = NOW(6), "
                    "result = %s WHERE command_id = %s",
                    (json.dumps(result, default=_json_default), command["command_id"]),
                )
            except Exception as error:  # noqa: BLE001 - surfaced to the operator
                self.log(f"command {command['command_type']} failed: {error}")
                self.cursor.execute(
                    "UPDATE demo_command SET status = 'failed', completed_at = NOW(6), "
                    "error_text = %s WHERE command_id = %s",
                    (str(error)[:500], command["command_id"]),
                )
        return handled

    def execute_command(self, command: dict[str, Any]) -> dict[str, Any]:
        command_type = str(command["command_type"]).upper()
        payload = _loads(command.get("payload")) or {}
        expected_version = command.get("expected_state_version")
        expected_version = int(expected_version) if expected_version is not None else None
        actor_id = str(command.get("requested_by") or "unknown")
        actor_role = str(command.get("requested_role") or "unknown")
        request_id = str(command["command_id"])

        if command_type == "PAUSE":
            return self._set_status(state.STATUS_PAUSED, expected_version, actor_id, actor_role, request_id)
        if command_type == "RESUME":
            return self._set_status(state.STATUS_RUNNING, expected_version, actor_id, actor_role, request_id)
        if command_type == "SET_SPEED":
            return self._set_speed(float(payload["speed"]), expected_version, actor_id, actor_role, request_id)
        if command_type == "INJECT":
            return self._inject(payload, actor_id, actor_role, request_id)
        if command_type == "RESET":
            return seeding.reset(
                self.settings,
                self.cursor,
                actor_id=actor_id,
                actor_role=actor_role,
                request_id=request_id,
                expected_state_version=expected_version,
                progress=self.log,
            )
        raise ValueError(f"Unsupported command type: {command_type}")

    def _set_status(
        self,
        status: str,
        expected_version: int | None,
        actor_id: str,
        actor_role: str,
        request_id: str,
    ) -> dict[str, Any]:
        active = self._require_active()
        if active["stream_status"] == status:
            return {"stream_status": status, "state_version": int(active["state_version"]), "noop": True}
        version = state.transition(
            self.cursor,
            expected_version=expected_version if expected_version is not None else int(active["state_version"]),
            stream_status=status,
        )
        self._minute_budget = 0.0
        state.audit(
            self.cursor,
            actor_id=actor_id,
            actor_role=actor_role,
            action=f"simulator.{status.lower()}",
            request_id=request_id,
            outcome="complete",
            run_id=int(active["run_id"]),
            state_version=version,
        )
        return {"stream_status": status, "state_version": version}

    def _set_speed(
        self,
        speed: float,
        expected_version: int | None,
        actor_id: str,
        actor_role: str,
        request_id: str,
    ) -> dict[str, Any]:
        if speed not in self.settings.allowed_speeds:
            raise ValueError(
                f"Speed {speed} is not allowed. Allowed speeds: {list(self.settings.allowed_speeds)}"
            )
        active = self._require_active()
        version = state.transition(
            self.cursor,
            expected_version=expected_version if expected_version is not None else int(active["state_version"]),
            speed_multiplier=speed,
        )
        state.audit(
            self.cursor,
            actor_id=actor_id,
            actor_role=actor_role,
            action="simulator.speed",
            request_id=request_id,
            outcome="complete",
            run_id=int(active["run_id"]),
            state_version=version,
            detail=f"speed={speed}",
        )
        return {"speed_multiplier": speed, "state_version": version}

    def _inject(
        self, payload: dict[str, Any], actor_id: str, actor_role: str, request_id: str
    ) -> dict[str, Any]:
        scenario_id = str(payload["scenario_id"])
        idempotency_key = str(payload.get("idempotency_key") or request_id)
        scenarios.get_definition(scenario_id)
        result = injection.inject(
            self.settings,
            self.cursor,
            scenario_id=scenario_id,
            idempotency_key=idempotency_key,
            actor_id=actor_id,
            actor_role=actor_role,
            request_id=request_id,
            world=self._active_world(),
        )
        self._minute_budget = 0.0
        return result

    # -- event emission ---------------------------------------------------

    def emit_due_minutes(self, elapsed_seconds: float) -> int:
        active = self._require_active()
        if active["stream_status"] != state.STATUS_RUNNING:
            self._minute_budget = 0.0
            return 0

        speed = float(active["speed_multiplier"])
        self._minute_budget += elapsed_seconds * speed * MINUTES_PER_SECOND_AT_1X
        if self._minute_budget < 1.0:
            return 0

        world = self._active_world()
        run_id = int(active["run_id"])
        minute_cursor = int(active["minute_cursor"])
        sequence_no = int(active["sequence_no"])
        emitted = 0
        rows: list[tuple] = []

        while self._minute_budget >= 1.0 and emitted < MAX_MINUTES_PER_TICK:
            minute_rows = world.generate_minute(run_id, minute_cursor)
            rows.extend(minute_rows)
            if minute_rows:
                sequence_no = max(sequence_no, max(int(row[2]) for row in minute_rows))
            minute_cursor += 1
            emitted += 1
            self._minute_budget -= 1.0

        if self._minute_budget >= 1.0:
            # Speed outran the tick budget. Drop the backlog rather than
            # compressing logical time so the clock stays truthful.
            self._minute_budget = 0.0

        if rows:
            insert_many(self.cursor, "payment_event", PAYMENT_EVENT_COLUMNS, rows)
        state.advance_clock(
            self.cursor,
            logical_time=world.minute_start(minute_cursor),
            minute_cursor=minute_cursor,
            sequence_no=sequence_no,
        )
        return emitted

    # -- helpers ----------------------------------------------------------

    def _require_active(self) -> dict[str, Any]:
        active = state.read_active(self.cursor)
        if active is None:
            raise RuntimeError("No demo_active_run row. Run migrate and seed first.")
        return active

    def _active_world(self) -> World:
        active = self._require_active()
        run_id = int(active["run_id"])
        if self._world is None or self._world_run_id != run_id:
            run = query_one(self.cursor, "SELECT * FROM demo_run WHERE run_id = %s", (run_id,))
            if run is None:
                raise RuntimeError(f"Active run {run_id} has no demo_run row.")
            epoch: datetime = run["logical_epoch"]
            baseline_days = int(
                (epoch - run["baseline_from"]).total_seconds() // 86400
            )
            self._world = World(int(run["seed"]), epoch, baseline_days)
            self._world_run_id = run_id
        return self._world


def _loads(value: Any) -> Any:
    if value in (None, ""):
        return None
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return None


def _json_default(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat(sep=" ", timespec="microseconds")
    return str(value)
