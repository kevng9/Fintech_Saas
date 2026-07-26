"""Migration, baseline seeding, and the global reset algorithm.

Reset never edits rows in place. A pristine template run (``run_id = 0``) is
generated once by the seeder, and every reset copies that template into a new
run inside SingleStore, verifies its fingerprint, and only then switches the
active-run pointer in a single transaction (spec section 9.3).
"""

from __future__ import annotations

import json
import time
from datetime import datetime
from pathlib import Path
from typing import Callable, Iterator

from . import fingerprint as fp
from . import scenarios, state
from . import tables as table_registry
from .config import TEMPLATE_RUN_ID, Settings
from .db import (
    REPO_ROOT,
    execute_script,
    existing_tables,
    insert_many,
    migration_files,
    query_all,
    query_one,
    scalar,
)
from . import generators
from .generator import PAYMENT_EVENT_COLUMNS, World
from .generators import shared_dims
from .model import GEOGRAPHIES, PROCESSORS

BASELINE_DIR = REPO_ROOT / "fixtures" / "baseline"

# Every table a run owns, in clone order. Tables here that this environment's
# migrations have not created yet (the shared dimensions and the A1/A3-A8
# fact tables, see tables.py) are skipped wherever this tuple is used: a
# missing table means "that anchor phase has not landed", not an error.
RUN_SCOPED_TABLES: tuple[str, ...] = table_registry.CLONE_ORDER

Progress = Callable[[str], None]


def _noop(_: str) -> None:
    return None


def migrate(settings: Settings, cursor, *, progress: Progress = _noop) -> int:
    cursor.execute(f"CREATE DATABASE IF NOT EXISTS {settings.database}")
    cursor.execute(f"USE {settings.database}")
    total = 0
    for path in migration_files():
        count = execute_script(cursor, path.read_text(encoding="utf-8"))
        total += count
        progress(f"applied {path.name} ({count} statements)")
    return total


def baseline_file(settings: Settings) -> Path:
    return BASELINE_DIR / f"{settings.fixture_version}.json"


def seed_template(
    settings: Settings,
    cursor,
    *,
    progress: Progress = _noop,
    update_baseline: bool = False,
) -> dict:
    world = World(settings.seed, settings.epoch, settings.baseline_days)
    started = time.time()
    present = existing_tables(cursor)

    for table in RUN_SCOPED_TABLES:
        if table in present:
            cursor.execute(f"DELETE FROM {table} WHERE run_id = %s", (TEMPLATE_RUN_ID,))
    cursor.execute("DELETE FROM dim_geography")
    cursor.execute("DELETE FROM demo_run WHERE run_id = %s", (TEMPLATE_RUN_ID,))

    insert_many(
        cursor,
        "dim_geography",
        ("geography_id", "country", "country_name", "region", "risk_band"),
        GEOGRAPHIES,
    )
    insert_many(
        cursor,
        "dim_processor",
        ("run_id", "processor_id", "processor_name", "rail", "contracted_sla_ms"),
        [(TEMPLATE_RUN_ID, *processor) for processor in PROCESSORS],
    )
    insert_many(
        cursor,
        "dim_merchant",
        ("run_id", "merchant_id", "merchant_name", "merchant_category", "region"),
        [
            (
                TEMPLATE_RUN_ID,
                m["merchant_id"],
                m["merchant_name"],
                m["merchant_category"],
                m["region"],
            )
            for m in world.merchants
        ],
    )
    insert_many(
        cursor,
        "dim_customer",
        (
            "run_id",
            "customer_id",
            "synthetic_name",
            "segment",
            "region",
            "relationship_start",
            "risk_tier",
            "consent_scope",
        ),
        [
            (
                TEMPLATE_RUN_ID,
                c["customer_id"],
                c["synthetic_name"],
                c["segment"],
                c["region"],
                c["relationship_start"],
                c["risk_tier"],
                c["consent_scope"],
            )
            for c in world.customers
        ],
    )
    insert_many(
        cursor,
        "dim_account",
        ("run_id", "account_id", "customer_id", "account_type", "currency", "opened_at", "status"),
        [
            (
                TEMPLATE_RUN_ID,
                a["account_id"],
                a["customer_id"],
                a["account_type"],
                a["currency"],
                a["opened_at"],
                a["status"],
            )
            for a in world.accounts
        ],
    )
    progress(
        f"dimensions loaded: {len(world.customers)} customers, "
        f"{len(world.merchants)} merchants, {len(PROCESSORS)} processors"
    )
    seed_anchor_baselines(world, cursor, progress, present=present)

    total_minutes = world.baseline_minutes

    def baseline_rows() -> Iterator[tuple]:
        for minute_index in range(total_minutes):
            if minute_index % 1440 == 0:
                progress(f"generating day {minute_index // 1440 + 1} of {settings.baseline_days}")
            yield from world.generate_minute(TEMPLATE_RUN_ID, minute_index)

    inserted = insert_many(cursor, "payment_event", PAYMENT_EVENT_COLUMNS, baseline_rows())
    progress(f"payment_event rows inserted: {inserted:,}")

    tables = fp.table_fingerprint(cursor, TEMPLATE_RUN_ID)
    document = fp.build_document(
        fixture_version=settings.fixture_version,
        seed=settings.seed,
        epoch=settings.epoch,
        baseline_days=settings.baseline_days,
        tables=tables,
    )
    digest = fp.checksum(document)

    expected_path = baseline_file(settings)
    if expected_path.exists() and not update_baseline:
        expected = json.loads(expected_path.read_text(encoding="utf-8"))
        if expected.get("checksum") != digest:
            problems = fp.diff(expected.get("fingerprint", {}), document)
            raise RuntimeError(
                "Seeded baseline does not match the versioned expected baseline "
                f"({expected_path.name}). Differences: {problems[:10]}"
            )
    else:
        expected_path.parent.mkdir(parents=True, exist_ok=True)
        expected_path.write_text(
            json.dumps({"checksum": digest, "fingerprint": document}, indent=2, sort_keys=True)
            + "\n",
            encoding="utf-8",
        )
        progress(f"wrote expected baseline {expected_path.name}")

    cursor.execute(
        """
        INSERT INTO demo_run (
            run_id, seed, fixture_version, status, logical_epoch, baseline_from,
            created_at, baseline_checksum, row_counts, fingerprint, notes
        ) VALUES (%s, %s, %s, 'template', %s, %s, NOW(6), %s, %s, %s, %s)
        """,
        (
            TEMPLATE_RUN_ID,
            settings.seed,
            settings.fixture_version,
            settings.epoch,
            world.baseline_from,
            digest,
            json.dumps(fp.row_counts(tables)),
            fp.canonical_json(document),
            "pristine template run cloned by every reset",
        ),
    )
    sync_scenarios(cursor)
    state.ensure_active_row(
        cursor,
        run_id=TEMPLATE_RUN_ID,
        logical_time=settings.epoch,
        analyst_mode="auto",
    )
    progress(f"template run seeded in {time.time() - started:.1f}s, checksum {digest[:12]}")
    return {"checksum": digest, "fingerprint": document, "rows": inserted}


def seed_anchor_baselines(
    world: World,
    cursor,
    progress: Progress = _noop,
    *,
    present: set[str] | None = None,
) -> dict[str, int]:
    """Seed every table anchors beyond A2 need, skipping any not yet migrated.

    This fills the shared dimensions (``dim_product``, ``dim_device``,
    ``dim_entity``, ``dim_counterparty``) from ``generators.shared_dims``, and
    then every anchor's own fact tables (digital sessions, fraud cases,
    disputes, liquidity positions, credit exposure, and customer money) from
    ``generators.seed_all_baselines``, all deterministically from the run
    seed. A table whose migration has not landed in this environment yet is
    silently skipped rather than treated as an error (module docstring).
    """
    present = existing_tables(cursor) if present is None else present
    counts: dict[str, int] = {}
    for table, columns, rows in shared_dims.build_all(world):
        if table not in present:
            continue
        cursor.execute(f"DELETE FROM {table} WHERE run_id = %s", (TEMPLATE_RUN_ID,))
        counts[table] = insert_many(
            cursor, table, ("run_id", *columns), [(TEMPLATE_RUN_ID, *row) for row in rows]
        )
    if counts:
        progress(f"shared dimensions loaded: {counts}")

    anchor_counts: dict[str, int] = {}
    for batch in generators.seed_all_baselines(world, TEMPLATE_RUN_ID):
        if batch.table not in present:
            continue
        cursor.execute(f"DELETE FROM {batch.table} WHERE run_id = %s", (TEMPLATE_RUN_ID,))
        anchor_counts[batch.table] = anchor_counts.get(batch.table, 0) + insert_many(
            cursor, batch.table, batch.columns, batch.rows
        )
    if anchor_counts:
        progress(f"anchor baselines loaded: {anchor_counts}")
    counts.update(anchor_counts)
    return counts


def sync_scenarios(cursor) -> int:
    cursor.execute("DELETE FROM demo_scenario")
    definitions = scenarios.all_definitions()
    insert_many(
        cursor,
        "demo_scenario",
        (
            "scenario_id",
            "anchor_id",
            "name",
            "description",
            "fixture_version",
            "metric_window",
            "expected_deltas",
            "enabled",
        ),
        [
            (
                definition.scenario_id,
                definition.anchor_id,
                definition.name,
                definition.description,
                "1.0.0",
                definition.metric_window,
                json.dumps(definition.expected_deltas),
                1 if definition.enabled else 0,
            )
            for definition in definitions
        ],
    )
    return len(definitions)


def next_run_id(cursor) -> int:
    highest = scalar(cursor, "SELECT MAX(run_id) FROM demo_run")
    return int(highest or 0) + 1


def _generic_clone(cursor, spec: table_registry.TableSpec, new_run_id: int) -> int:
    """Clone one run-scoped table by copying every column but run_id as-is.

    payment_event overrides this with its own statement below because its id
    embeds the run id (spec section 9.3's ``PAY-<run>-<sequence>`` shape); the
    shared dimensions and the A1/A3-A8 fact tables have no such requirement
    yet, so a straight copy is the right default until an anchor's generator
    needs something more specific.
    """
    select_columns = ", ".join(["%s", *spec.columns[1:]])
    cursor.execute(
        f"INSERT INTO {spec.name} ({', '.join(spec.columns)}) "
        f"SELECT {select_columns} FROM {spec.name} WHERE run_id = %s",
        (new_run_id, TEMPLATE_RUN_ID),
    )
    return cursor.rowcount


_EXPLICITLY_CLONED_TABLES = frozenset(
    {"dim_processor", "dim_merchant", "dim_customer", "dim_account", "payment_event"}
)


def clone_template_into(cursor, new_run_id: int) -> dict[str, int]:
    counts: dict[str, int] = {}
    present = existing_tables(cursor)
    for table in RUN_SCOPED_TABLES:
        if table in present:
            cursor.execute(f"DELETE FROM {table} WHERE run_id = %s", (new_run_id,))

    cursor.execute(
        """
        INSERT INTO dim_processor (run_id, processor_id, processor_name, rail, contracted_sla_ms)
        SELECT %s, processor_id, processor_name, rail, contracted_sla_ms
        FROM dim_processor WHERE run_id = %s
        """,
        (new_run_id, TEMPLATE_RUN_ID),
    )
    counts["dim_processor"] = cursor.rowcount
    cursor.execute(
        """
        INSERT INTO dim_merchant (run_id, merchant_id, merchant_name, merchant_category, region)
        SELECT %s, merchant_id, merchant_name, merchant_category, region
        FROM dim_merchant WHERE run_id = %s
        """,
        (new_run_id, TEMPLATE_RUN_ID),
    )
    counts["dim_merchant"] = cursor.rowcount
    cursor.execute(
        """
        INSERT INTO dim_customer (
            run_id, customer_id, synthetic_name, segment, region,
            relationship_start, risk_tier, consent_scope
        )
        SELECT %s, customer_id, synthetic_name, segment, region,
               relationship_start, risk_tier, consent_scope
        FROM dim_customer WHERE run_id = %s
        """,
        (new_run_id, TEMPLATE_RUN_ID),
    )
    counts["dim_customer"] = cursor.rowcount
    cursor.execute(
        """
        INSERT INTO dim_account (
            run_id, account_id, customer_id, account_type, currency, opened_at, status
        )
        SELECT %s, account_id, customer_id, account_type, currency, opened_at, status
        FROM dim_account WHERE run_id = %s
        """,
        (new_run_id, TEMPLATE_RUN_ID),
    )
    counts["dim_account"] = cursor.rowcount
    cursor.execute(
        """
        INSERT INTO payment_event (
            run_id, payment_id, sequence_no, event_time, customer_id, merchant_id,
            processor_id, rail, card_network, amount, amount_usd, currency, response_code,
            approved, latency_ms, issuer_country, scenario_id
        )
        SELECT %s, CONCAT('PAY-', %s, '-', sequence_no), sequence_no, event_time,
               customer_id, merchant_id, processor_id, rail, card_network, amount,
               amount_usd, currency, response_code, approved, latency_ms, issuer_country,
               scenario_id
        FROM payment_event WHERE run_id = %s
        """,
        (new_run_id, new_run_id, TEMPLATE_RUN_ID),
    )
    counts["payment_event"] = cursor.rowcount

    for spec in table_registry.SHARED_DIM_TABLES + table_registry.ANCHOR_FACT_TABLES:
        if spec.name in _EXPLICITLY_CLONED_TABLES or spec.name not in present:
            continue
        counts[spec.name] = _generic_clone(cursor, spec, new_run_id)
    return counts


def reset(
    settings: Settings,
    cursor,
    *,
    actor_id: str = "cli",
    actor_role: str = "demo_administrator",
    request_id: str = "cli",
    expected_state_version: int | None = None,
    progress: Progress = _noop,
) -> dict:
    started = time.time()
    template = query_one(
        cursor, "SELECT * FROM demo_run WHERE run_id = %s", (TEMPLATE_RUN_ID,)
    )
    if template is None:
        raise RuntimeError("No template run found. Run the seed command first.")

    active = state.read_active(cursor)
    if active is None:
        raise RuntimeError("No active-run row found. Run the migrate and seed commands first.")
    if expected_state_version is not None and int(active["state_version"]) != expected_state_version:
        raise state.StaleStateError(
            f"Expected state version {expected_state_version}, found {active['state_version']}."
        )

    previous_run_id = int(active["run_id"])
    version = state.transition(
        cursor,
        expected_version=int(active["state_version"]),
        stream_status=state.STATUS_RESETTING,
    )

    new_run_id = next_run_id(cursor)
    world = World(settings.seed, settings.epoch, settings.baseline_days)
    counts = clone_template_into(cursor, new_run_id)
    progress(f"cloned template into run {new_run_id}: {counts}")

    tables = fp.table_fingerprint(cursor, new_run_id)
    document = fp.build_document(
        fixture_version=settings.fixture_version,
        seed=settings.seed,
        epoch=settings.epoch,
        baseline_days=settings.baseline_days,
        tables=tables,
    )
    digest = fp.checksum(document)
    expected_digest = str(template["baseline_checksum"])

    if digest != expected_digest:
        problems = fp.diff(json.loads(str(template["fingerprint"])), document)
        present = existing_tables(cursor)
        for table in RUN_SCOPED_TABLES:
            if table in present:
                cursor.execute(f"DELETE FROM {table} WHERE run_id = %s", (new_run_id,))
        state.transition(
            cursor, expected_version=version, stream_status=state.STATUS_PAUSED
        )
        state.audit(
            cursor,
            actor_id=actor_id,
            actor_role=actor_role,
            action="demo.reset",
            request_id=request_id,
            outcome="rejected",
            run_id=previous_run_id,
            state_version=version,
            detail=f"checksum mismatch: {problems[:5]}",
        )
        raise RuntimeError(
            "Reset rejected: new run checksum does not match the template baseline. "
            f"Differences: {problems[:5]}"
        )

    baseline_sequence = int(tables["payment_event"]["max_sequence"])
    cursor.execute("BEGIN")
    try:
        cursor.execute(
            """
            INSERT INTO demo_run (
                run_id, seed, fixture_version, status, logical_epoch, baseline_from,
                created_at, baseline_checksum, row_counts, fingerprint, notes
            ) VALUES (%s, %s, %s, 'active', %s, %s, NOW(6), %s, %s, %s, %s)
            """,
            (
                new_run_id,
                settings.seed,
                settings.fixture_version,
                settings.epoch,
                world.baseline_from,
                digest,
                json.dumps(fp.row_counts(tables)),
                fp.canonical_json(document),
                f"reset from template by {actor_role}",
            ),
        )
        cursor.execute(
            "UPDATE demo_run SET status = 'superseded' WHERE run_id NOT IN (%s, %s) "
            "AND status = 'active'",
            (TEMPLATE_RUN_ID, new_run_id),
        )
        version = state.transition(
            cursor,
            expected_version=version,
            run_id=new_run_id,
            logical_time=settings.epoch,
            stream_status=state.STATUS_PAUSED,
            speed_multiplier=1.0,
            sequence_no=baseline_sequence,
            minute_cursor=world.baseline_minutes,
        )
        cursor.execute("COMMIT")
    except Exception:
        cursor.execute("ROLLBACK")
        raise

    present = existing_tables(cursor)
    for table in RUN_SCOPED_TABLES:
        if table in present:
            cursor.execute(
                f"DELETE FROM {table} WHERE run_id NOT IN (%s, %s)",
                (TEMPLATE_RUN_ID, new_run_id),
            )

    state.log_event(
        cursor,
        run_id=new_run_id,
        sequence_no=0,
        event_type="demo.reset.complete",
        logical_event_time=settings.epoch,
        payload=json.dumps({"checksum": digest, "row_counts": fp.row_counts(tables)}),
    )
    state.audit(
        cursor,
        actor_id=actor_id,
        actor_role=actor_role,
        action="demo.reset",
        request_id=request_id,
        outcome="complete",
        run_id=new_run_id,
        state_version=version,
        detail=f"reset to run {new_run_id} in {time.time() - started:.1f}s",
    )
    duration = time.time() - started
    progress(f"reset complete: run {new_run_id}, checksum {digest[:12]}, {duration:.1f}s")
    return {
        "run_id": new_run_id,
        "previous_run_id": previous_run_id,
        "checksum": digest,
        "row_counts": fp.row_counts(tables),
        "state_version": version,
        "duration_seconds": round(duration, 2),
    }


def active_summary(cursor) -> dict:
    active = state.read_active(cursor)
    if not active:
        return {"status": "uninitialised"}
    run = query_one(cursor, "SELECT * FROM demo_run WHERE run_id = %s", (active["run_id"],))
    executions = query_all(
        cursor,
        "SELECT scenario_id, status, window_start, window_end, completed_at "
        "FROM demo_scenario_execution WHERE run_id = %s ORDER BY requested_at",
        (active["run_id"],),
    )
    return {
        "active": active,
        "run": run,
        "scenario_executions": executions,
    }


def epoch_of_run(cursor, run_id: int) -> datetime | None:
    row = query_one(cursor, "SELECT logical_epoch FROM demo_run WHERE run_id = %s", (run_id,))
    return row["logical_epoch"] if row else None
