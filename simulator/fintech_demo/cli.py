"""Command line entry point for the demo data platform.

    python -m fintech_demo preflight     validate migrations and data with no workspace
    python -m fintech_demo doctor        check the workspace supports the required SQL
    python -m fintech_demo bootstrap     migrate, seed the template, activate a run
    python -m fintech_demo run           start the simulator leader
    python -m fintech_demo resume        resume a paused stream through the leader
    python -m fintech_demo inject A2_PROCESSOR_TIMEOUT
    python -m fintech_demo verify --scenario A2_PROCESSOR_TIMEOUT --inject
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from typing import Any

from . import injection, scenarios, seed as seeding, state, verify
from .config import Settings, settings_from_env
from .db import ConnectionUnavailable, connect, migration_files, query_one, split_statements
from .generator import PAYMENT_EVENT_COLUMNS, World
from .runner import Simulator


def log(message: str) -> None:
    print(message, flush=True)


def _settings(args: argparse.Namespace) -> Settings:
    return settings_from_env(
        args.env_file,
        database=args.database,
        seed=args.seed,
        epoch=args.epoch,
        baseline_days=args.days,
    )


def _leader_alive(cursor, settings: Settings) -> bool:
    row = query_one(
        cursor,
        "SELECT leader_id, leader_heartbeat_at, "
        f"TIMESTAMPDIFF(SECOND, leader_heartbeat_at, NOW(6)) AS age_seconds "
        "FROM demo_active_run WHERE singleton_id = 1",
    )
    if not row or row["leader_id"] is None or row["leader_heartbeat_at"] is None:
        return False
    return float(row["age_seconds"] or 0) < settings.heartbeat_grace_seconds


def _enqueue(cursor, command_type: str, payload: dict[str, Any] | None, *, actor: str) -> str:
    active = state.read_active(cursor)
    command_id = uuid.uuid4().hex
    cursor.execute(
        """
        INSERT INTO demo_command (
            command_id, run_id, command_type, payload, status,
            expected_state_version, requested_by, requested_role, created_at
        ) VALUES (%s, %s, %s, %s, 'queued', %s, %s, 'demo_administrator', NOW(6))
        """,
        (
            command_id,
            int(active["run_id"]) if active else 0,
            command_type,
            json.dumps(payload or {}),
            int(active["state_version"]) if active else None,
            actor,
        ),
    )
    return command_id


def _wait_for_command(cursor, command_id: str, timeout: float = 60.0) -> dict[str, Any] | None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        row = query_one(cursor, "SELECT * FROM demo_command WHERE command_id = %s", (command_id,))
        if row and row["status"] in {"complete", "failed"}:
            return row
        time.sleep(0.4)
    return None


def cmd_migrate(args: argparse.Namespace) -> int:
    settings = _settings(args)
    connection = connect(settings, use_database=False)
    with connection.cursor() as cursor:
        count = seeding.migrate(settings, cursor, progress=log)
    connection.close()
    log(f"migrations applied: {count} statements on {settings.dsn_label}")
    return 0


def cmd_seed(args: argparse.Namespace) -> int:
    settings = _settings(args)
    connection = connect(settings)
    with connection.cursor() as cursor:
        result = seeding.seed_template(
            settings, cursor, progress=log, update_baseline=args.update_baseline
        )
    connection.close()
    log(f"template checksum: {result['checksum']}")
    return 0


def cmd_reset(args: argparse.Namespace) -> int:
    settings = _settings(args)
    connection = connect(settings)
    with connection.cursor() as cursor:
        if _leader_alive(cursor, settings):
            command_id = _enqueue(cursor, "RESET", {}, actor="cli")
            log("simulator leader is live: reset queued")
            row = _wait_for_command(cursor, command_id)
            connection.close()
            if row is None:
                log("timed out waiting for the simulator to complete the reset")
                return 1
            log(f"{row['status']}: {row['result'] or row['error_text']}")
            return 0 if row["status"] == "complete" else 1
        result = seeding.reset(settings, cursor, progress=log)
    connection.close()
    log(json.dumps(result, default=str, indent=2))
    return 0


def cmd_inject(args: argparse.Namespace) -> int:
    settings = _settings(args)
    idempotency_key = args.key or uuid.uuid4().hex
    connection = connect(settings)
    with connection.cursor() as cursor:
        if _leader_alive(cursor, settings):
            command_id = _enqueue(
                cursor,
                "INJECT",
                {"scenario_id": args.scenario, "idempotency_key": idempotency_key},
                actor="cli",
            )
            log("simulator leader is live: injection queued")
            row = _wait_for_command(cursor, command_id, timeout=30)
            connection.close()
            if row is None:
                log("timed out waiting for the simulator to complete the injection")
                return 1
            log(f"{row['status']}: {row['result'] or row['error_text']}")
            return 0 if row["status"] == "complete" else 1
        result = injection.inject(
            settings, cursor, scenario_id=args.scenario, idempotency_key=idempotency_key
        )
    connection.close()
    log(json.dumps(result, default=str, indent=2))
    return 0


def cmd_resume(args: argparse.Namespace) -> int:
    """Ask the live simulator to run the stream.

    Reset leaves the stream paused at the verified baseline. Resume goes through
    the leader, the same way the control strip does, so startup does not write
    demo state beside the process that owns the clock.
    """
    settings = _settings(args)
    connection = connect(settings)
    with connection.cursor() as cursor:
        if not _leader_alive(cursor, settings):
            connection.close()
            log(
                "error: no simulator leader is running.\n"
                "  Start it with: python -m fintech_demo run"
            )
            return 1
        command_id = _enqueue(cursor, "RESUME", {}, actor="cli")
        log("simulator leader is live: resume queued")
        row = _wait_for_command(cursor, command_id, timeout=30)
    connection.close()
    if row is None:
        log("timed out waiting for the simulator to resume the stream")
        return 1
    log(f"{row['status']}: {row['result'] or row['error_text']}")
    return 0 if row["status"] == "complete" else 1


def cmd_status(args: argparse.Namespace) -> int:
    settings = _settings(args)
    connection = connect(settings)
    with connection.cursor() as cursor:
        summary = seeding.active_summary(cursor)
        summary["leader_alive"] = _leader_alive(cursor, settings)
    connection.close()
    log(json.dumps(summary, default=str, indent=2))
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    settings = _settings(args)
    Simulator(settings, log=log).run_forever()
    return 0


def _has_execution(cursor, run_id: int, scenario_id: str) -> bool:
    row = query_one(
        cursor,
        "SELECT COUNT(*) AS executions FROM demo_scenario_execution "
        "WHERE run_id = %s AND scenario_id = %s AND status = 'complete'",
        (run_id, scenario_id),
    )
    return bool(row and int(row["executions"]))


def cmd_verify(args: argparse.Namespace) -> int:
    """Assert the data matches its published contract.

    Scenario checks compare the injected window against the deltas the scenario
    publishes, so they need an injection to have happened. ``--inject`` makes the
    command self-contained for pre-flight use: inject if needed, check, then
    return the run to its verified baseline.
    """
    settings = _settings(args)
    connection = connect(settings)
    failures = 0
    injected_here = False

    with connection.cursor() as cursor:
        active = state.read_active(cursor)
        if active is None:
            log("error: no active run. Run: python -m fintech_demo reset")
            connection.close()
            return 1
        run_id = int(active["run_id"])

        # The recorded fingerprint describes a pristine run, so the baseline
        # checks have to happen before anything is injected into it.
        if args.scenario and _has_execution(cursor, run_id, args.scenario):
            log(
                f"note: {args.scenario} has already run on run {run_id}, so the baseline\n"
                "  checksum describes data that no longer exists. Reset first to check it."
            )
        checks = verify.verify_baseline(settings, cursor)

        if args.scenario and args.inject and not _has_execution(cursor, run_id, args.scenario):
            if _leader_alive(cursor, settings):
                log(
                    "error: the simulator leader is running, so --inject would race it.\n"
                    "  Stop the simulator, or inject from the app and re-run without --inject."
                )
                connection.close()
                return 1
            log(f"injecting {args.scenario} for verification")
            injection.inject(
                settings,
                cursor,
                scenario_id=args.scenario,
                idempotency_key=f"verify-{uuid.uuid4().hex}",
            )
            injected_here = True

        if args.scenario:
            checks += verify.verify_scenario(settings, cursor, args.scenario)

        for check in checks:
            log(check.line())
            failures += 0 if check.passed else 1
        passed, total = verify.summarize(checks)

        if injected_here:
            log("\nreturning the run to its verified baseline")
            seeding.reset(settings, cursor, progress=log)

    connection.close()
    log(f"\n{passed}/{total} checks passed")
    return 1 if failures else 0


SQL_FEATURE_PROBES = (
    (
        "server version",
        "SELECT @@memsql_version AS value",
        None,
    ),
    (
        "DATE_TRUNC hour bucketing",
        "SELECT DATE_TRUNC('hour', CAST('2026-07-25 09:35:00' AS DATETIME)) AS value",
        "Replace DATE_TRUNC('hour', x) with CAST(DATE_FORMAT(x, '%Y-%m-%d %H:00:00') AS DATETIME) "
        "in database/migrations/004_a2_views.sql.",
    ),
    (
        "APPROX_PERCENTILE aggregation",
        "SELECT APPROX_PERCENTILE(n, 0.95) AS value FROM "
        "(SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3) probe",
        "Replace APPROX_PERCENTILE with the ranked fallback documented in "
        "docs/troubleshooting.md. Baseline data is designed so both return the same value.",
    ),
    (
        "window functions over aggregates",
        "SELECT SUM(n) OVER (PARTITION BY n) AS value FROM "
        "(SELECT 1 AS n UNION ALL SELECT 2) probe LIMIT 1",
        "aa_payment_decline_mix needs window functions. Upgrade the workspace engine version.",
    ),
)


def cmd_doctor(args: argparse.Namespace) -> int:
    """Check that the target workspace supports every SQL construct the views use."""
    settings = _settings(args)
    connection = connect(settings, use_database=False)
    failures = 0
    with connection.cursor() as cursor:
        log(f"connected to {settings.dsn_label}")
        for name, sql, remedy in SQL_FEATURE_PROBES:
            try:
                row = query_one(cursor, sql)
                log(f"[PASS] {name}: {list(row.values())[0] if row else 'ok'}")
            except Exception as error:  # noqa: BLE001 - reported to the operator
                failures += 1
                log(f"[FAIL] {name}: {error}")
                if remedy:
                    log(f"       remedy: {remedy}")
    connection.close()
    log("\nall probes passed" if not failures else f"\n{failures} probe(s) failed")
    return 1 if failures else 0


def cmd_preflight(args: argparse.Namespace) -> int:
    """Validate everything that can be checked without a workspace.

    Run this before ``bootstrap`` so a failure points at the demo definition
    rather than at the database.
    """
    settings = _settings(args)
    checks: list[tuple[bool, str]] = []

    files = migration_files()
    statements = [
        statement for path in files for statement in split_statements(path.read_text("utf-8"))
    ]
    checks.append((bool(files), f"migration files found: {len(files)}"))
    checks.append((bool(statements), f"migration statements parsed: {len(statements)}"))
    unterminated = [s for s in statements if s.endswith(";")]
    checks.append((not unterminated, f"statements split cleanly ({len(unterminated)} malformed)"))

    views = [s for s in statements if s.upper().startswith("CREATE VIEW")]
    unscoped = [s for s in views if "demo_active_run" not in s]
    checks.append((not unscoped, f"every curated view is run-scoped ({len(views)} views)"))

    world = World(settings.seed, settings.epoch, baseline_days=settings.baseline_days)
    minute = world.generate_minute(1, 615)
    checks.append((world.generate_minute(1, 615) == minute, "generator is deterministic"))
    checks.append(
        (
            all(len(row) == len(PAYMENT_EVENT_COLUMNS) for row in minute),
            f"row width matches the column list ({len(PAYMENT_EVENT_COLUMNS)} columns)",
        )
    )
    expected_rows = world.baseline_minutes and sum(
        len(world.generate_minute(1, m)) for m in range(0, world.baseline_minutes, 240)
    )
    checks.append((expected_rows > 0, "baseline generation produces events"))

    for scenario in scenarios.all_definitions():
        batches = scenarios.build_rows(
            scenario.scenario_id, world, run_id=1, start_minute=world.baseline_minutes
        )
        rows_by_table: dict[str, int] = {}
        for batch in batches:
            rows_by_table[batch.table] = rows_by_table.get(batch.table, 0) + len(batch.rows)
        expected_rows = scenario.expected_deltas["rows_inserted"]
        checks.append(
            (
                rows_by_table == expected_rows,
                f"{scenario.scenario_id} emits its published rows_inserted {expected_rows}",
            )
        )

    failures = 0
    for passed, message in checks:
        failures += 0 if passed else 1
        log(f"[{'PASS' if passed else 'FAIL'}] {message}")
    log(f"\n{len(checks) - failures}/{len(checks)} offline checks passed")
    log(f"target workspace (not contacted): {settings.dsn_label}")
    return 1 if failures else 0


def cmd_scenarios(args: argparse.Namespace) -> int:
    for definition in scenarios.all_definitions():
        log(f"{definition.scenario_id} [{definition.anchor_id}] {definition.name}")
        log(f"  window: {definition.metric_window}")
        log(f"  {definition.expected_deltas['narrative']}")
    return 0


def cmd_bootstrap(args: argparse.Namespace) -> int:
    if cmd_migrate(args) != 0:
        return 1
    if cmd_seed(args) != 0:
        return 1
    return cmd_reset(args)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="fintech_demo", description=__doc__)
    parser.add_argument("--env-file", default=None, help="path to a .env file (default app/.env.local)")
    parser.add_argument("--database", default=None)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--epoch", default=None, help="logical epoch, ISO-8601 or 'now'")
    parser.add_argument("--days", type=int, default=None, help="days of seeded history")
    # Composite commands such as bootstrap call other command functions with the
    # namespace they were given, so every optional flag any command reads must
    # exist on every namespace. Declaring the defaults here rather than only on
    # the owning subparser is what keeps that true.
    parser.set_defaults(update_baseline=False, scenario=None, key=None, inject=False)
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("migrate", help="create the database and apply migrations").set_defaults(
        func=cmd_migrate
    )

    seed_parser = subparsers.add_parser("seed", help="generate the pristine template run")
    seed_parser.add_argument("--update-baseline", action="store_true")
    seed_parser.set_defaults(func=cmd_seed)

    subparsers.add_parser("reset", help="clone the template into a new active run").set_defaults(
        func=cmd_reset
    )

    inject_parser = subparsers.add_parser("inject", help="inject a scenario")
    inject_parser.add_argument("scenario")
    inject_parser.add_argument("--key", default=None, help="idempotency key")
    inject_parser.set_defaults(func=cmd_inject)

    subparsers.add_parser("status", help="print active run and stream state").set_defaults(
        func=cmd_status
    )
    subparsers.add_parser("run", help="run the simulator leader loop").set_defaults(func=cmd_run)
    subparsers.add_parser(
        "resume", help="resume the stream when a simulator leader is running"
    ).set_defaults(func=cmd_resume)

    verify_parser = subparsers.add_parser("verify", help="verify baseline and scenario deltas")
    verify_parser.add_argument("--scenario", default=None)
    verify_parser.add_argument(
        "--inject",
        action="store_true",
        help="inject the scenario first if it has not run, then reset back to baseline",
    )
    verify_parser.set_defaults(func=cmd_verify)

    subparsers.add_parser("scenarios", help="list registered scenarios").set_defaults(
        func=cmd_scenarios
    )
    subparsers.add_parser(
        "doctor", help="probe the workspace for the SQL features the views require"
    ).set_defaults(func=cmd_doctor)
    subparsers.add_parser(
        "preflight", help="validate migrations and generated data without a workspace"
    ).set_defaults(func=cmd_preflight)
    bootstrap_parser = subparsers.add_parser(
        "bootstrap", help="migrate, seed, and reset in one step"
    )
    bootstrap_parser.add_argument(
        "--update-baseline",
        action="store_true",
        help="record a new baseline fingerprint instead of verifying against the stored one",
    )
    bootstrap_parser.set_defaults(func=cmd_bootstrap)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.func(args) or 0)
    except ConnectionUnavailable as error:
        log(f"error: {error}")
        return 2
    except KeyboardInterrupt:
        log("interrupted")
        return 130


if __name__ == "__main__":
    sys.exit(main())
