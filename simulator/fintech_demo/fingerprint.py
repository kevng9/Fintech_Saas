"""Baseline fingerprints and checksums.

Spec section 9.3 requires a reset to be rejected unless the new run matches a
versioned expected baseline. The fingerprint is a canonical document of per
table row counts and stable aggregates, and the checksum is SHA-256 over that
document. Audit timestamps, execution logs, heartbeats and run identifiers are
excluded so the value depends only on fixture version, seed, logical epoch and
the generated data itself.

``FINGERPRINT_TABLES`` is every table ``tables.py`` knows about, run-scoped or
not, so this module never has to grow a second per-anchor list. Tables whose
migrations have not landed yet are simply absent from the database and are
skipped: :func:`table_fingerprint` only fingerprints the tables that exist in
the environment it is pointed at, so A2-only environments keep producing the
same document they always have.
"""

from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal
from hashlib import sha256
from typing import Any

from . import tables as table_registry
from .db import existing_tables, query_one

FINGERPRINT_TABLES: tuple[str, ...] = table_registry.CLONE_ORDER


def _plain(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat(sep=" ", timespec="microseconds")
    return value


def canonical_json(document: dict) -> str:
    return json.dumps(document, sort_keys=True, separators=(",", ":"), default=_plain)


def checksum(document: dict) -> str:
    return sha256(canonical_json(document).encode("utf-8")).hexdigest()


def _dimension_fingerprint(cursor, run_id: int, spec: "table_registry.TableSpec") -> dict:
    row = query_one(
        cursor,
        f"SELECT COUNT(*) AS rows_total, MIN({spec.id_column}) AS min_id, MAX({spec.id_column}) AS max_id "
        f"FROM {spec.name} WHERE run_id = %s",
        (run_id,),
    )
    return {
        "rows": int(row["rows_total"] or 0),
        "min_id": row["min_id"],
        "max_id": row["max_id"],
    }


def _generic_fact_fingerprint(cursor, run_id: int, spec: "table_registry.TableSpec") -> dict:
    """COUNT, plus MIN/MAX of the id column and SUM of amount columns if any.

    This is the fallback shape for every A1/A3-A8 table until its anchor phase
    needs something more specific (payment_event keeps its own richer
    fingerprint below because A2 already publishes exact deltas against it).
    """
    select_parts = ["COUNT(*) AS rows_total"]
    if spec.id_column:
        select_parts.append(f"MIN({spec.id_column}) AS min_id")
        select_parts.append(f"MAX({spec.id_column}) AS max_id")
    for column in spec.amount_columns:
        select_parts.append(f"CAST(ROUND(SUM({column}) * 100) AS SIGNED) AS sum_{column}")

    row = query_one(
        cursor,
        f"SELECT {', '.join(select_parts)} FROM {spec.name} WHERE run_id = %s",
        (run_id,),
    )
    result: dict[str, Any] = {"rows": int(row["rows_total"] or 0)}
    if spec.id_column:
        result["min_id"] = row["min_id"]
        result["max_id"] = row["max_id"]
    for column in spec.amount_columns:
        result[f"{column}_cents"] = int(row[f"sum_{column}"] or 0)
    return result


def _payment_event_fingerprint(cursor, run_id: int) -> dict:
    row = query_one(
        cursor,
        """
        SELECT
            COUNT(*) AS rows_total,
            SUM(approved) AS approvals,
            CAST(ROUND(SUM(amount) * 100) AS SIGNED) AS amount_cents,
            CAST(ROUND(SUM(amount_usd) * 100) AS SIGNED) AS amount_usd_cents,
            SUM(latency_ms) AS latency_sum,
            MIN(event_time) AS first_event,
            MAX(event_time) AS last_event,
            MIN(sequence_no) AS min_sequence,
            MAX(sequence_no) AS max_sequence,
            COUNT(DISTINCT processor_id) AS processors,
            SUM(CASE WHEN response_code = 'TIMEOUT' THEN 1 ELSE 0 END) AS timeouts
        FROM payment_event
        WHERE run_id = %s AND scenario_id IS NULL
        """,
        (run_id,),
    )
    return {
        "rows": int(row["rows_total"] or 0),
        "approvals": int(row["approvals"] or 0),
        "amount_cents": int(row["amount_cents"] or 0),
        "amount_usd_cents": int(row["amount_usd_cents"] or 0),
        "latency_sum": int(row["latency_sum"] or 0),
        "first_event": _plain(row["first_event"]),
        "last_event": _plain(row["last_event"]),
        "min_sequence": int(row["min_sequence"] or 0),
        "max_sequence": int(row["max_sequence"] or 0),
        "processors": int(row["processors"] or 0),
        "timeouts": int(row["timeouts"] or 0),
    }


def table_fingerprint(cursor, run_id: int) -> dict:
    tables: dict[str, dict] = {}
    present = existing_tables(cursor)

    for spec in table_registry.PAYMENT_TABLES:
        if spec.name == "payment_event" or spec.name not in present:
            continue
        tables[spec.name] = _dimension_fingerprint(cursor, run_id, spec)

    if "payment_event" in present:
        tables["payment_event"] = _payment_event_fingerprint(cursor, run_id)

    for spec in table_registry.SHARED_DIM_TABLES + table_registry.ANCHOR_FACT_TABLES:
        if spec.name not in present:
            continue
        tables[spec.name] = _generic_fact_fingerprint(cursor, run_id, spec)

    return tables


def build_document(
    *,
    fixture_version: str,
    seed: int,
    epoch: datetime,
    baseline_days: int,
    tables: dict,
) -> dict:
    return {
        "fixture_version": fixture_version,
        "seed": seed,
        "logical_epoch": epoch.isoformat(sep=" ", timespec="seconds"),
        "baseline_days": baseline_days,
        "tables": tables,
    }


def row_counts(tables: dict) -> dict:
    return {name: values["rows"] for name, values in tables.items()}


def diff(expected: dict, actual: dict) -> list[str]:
    problems: list[str] = []
    for key in sorted(set(expected) | set(actual)):
        expected_value = expected.get(key)
        actual_value = actual.get(key)
        if isinstance(expected_value, dict) and isinstance(actual_value, dict):
            problems.extend(f"{key}.{item}" for item in diff(expected_value, actual_value))
        elif _plain(expected_value) != _plain(actual_value):
            problems.append(f"{key}: expected {expected_value!r}, got {actual_value!r}")
    return problems
