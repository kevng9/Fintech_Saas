"""Thin SingleStore access helpers shared by the seeder and the simulator."""

from __future__ import annotations

import re
import socket
from pathlib import Path
from typing import Any, Iterable, Sequence

import singlestoredb as s2

from .config import Settings

REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = REPO_ROOT / "database" / "migrations"

_COMMENT_LINE = re.compile(r"^\s*--.*$", re.MULTILINE)


class ConnectionUnavailable(RuntimeError):
    """The configured workspace could not be reached."""


def resolve_host(host: str, port: int) -> None:
    """Fail fast with an actionable message when the endpoint cannot be reached.

    A suspended or deleted SingleStore workspace stops publishing DNS, so the
    driver's generic "Can't connect" wrapped in a stack trace is the most common
    thing an operator sees. Distinguishing "no such hostname" from "host refused
    the connection" points straight at the fix.
    """
    try:
        socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as error:
        raise ConnectionUnavailable(
            f"cannot resolve {host}.\n"
            "  The workspace endpoint does not exist in DNS. Usually this means the\n"
            "  workspace is suspended or was deleted, or DEMO_DB_HOST is stale.\n"
            "  Fix: open the SingleStore portal, resume or create the workspace, then\n"
            "  copy its current host into DEMO_DB_HOST in app/.env.local."
        ) from error


def connect(settings: Settings, *, use_database: bool = True):
    resolve_host(settings.host, settings.port)
    try:
        return s2.connect(
            host=settings.host,
            port=settings.port,
            user=settings.user,
            password=settings.password,
            database=settings.database if use_database else None,
            autocommit=True,
            local_infile=False,
        )
    except Exception as error:  # noqa: BLE001 - re-raised with operator guidance
        raise ConnectionUnavailable(
            f"cannot connect to {settings.dsn_label}: {error}\n"
            "  Check DEMO_DB_PORT, DEMO_DB_USER and DEMO_DB_PASSWORD in app/.env.local,\n"
            "  and that this machine's IP is on the workspace firewall allowlist."
        ) from error


def split_statements(sql_text: str) -> list[str]:
    """Split a migration file into statements.

    Migration files in this repository keep every statement free of inline
    semicolons, so splitting on ``;`` after stripping comment lines is safe and
    avoids a SQL parser dependency.
    """
    stripped = _COMMENT_LINE.sub("", sql_text)
    return [part.strip() for part in stripped.split(";") if part.strip()]


def execute_script(cursor, sql_text: str) -> int:
    statements = split_statements(sql_text)
    for statement in statements:
        cursor.execute(statement)
    return len(statements)


def query_all(cursor, sql: str, params: Sequence[Any] | None = None) -> list[dict[str, Any]]:
    cursor.execute(sql, tuple(params) if params else None)
    if cursor.description is None:
        return []
    columns = [column[0] for column in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def query_one(cursor, sql: str, params: Sequence[Any] | None = None) -> dict[str, Any] | None:
    rows = query_all(cursor, sql, params)
    return rows[0] if rows else None


def scalar(cursor, sql: str, params: Sequence[Any] | None = None) -> Any:
    row = query_one(cursor, sql, params)
    if row is None:
        return None
    return next(iter(row.values()))


def insert_many(
    cursor,
    table: str,
    columns: Sequence[str],
    rows: Iterable[Sequence[Any]],
    *,
    batch_size: int = 5000,
) -> int:
    placeholders = ", ".join(["%s"] * len(columns))
    sql = f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders})"
    batch: list[Sequence[Any]] = []
    total = 0
    for row in rows:
        batch.append(row)
        if len(batch) >= batch_size:
            cursor.executemany(sql, batch)
            total += len(batch)
            batch = []
    if batch:
        cursor.executemany(sql, batch)
        total += len(batch)
    return total


def migration_files() -> list[Path]:
    return sorted(MIGRATIONS_DIR.glob("*.sql"))


def existing_tables(cursor) -> set[str]:
    """Every table name in the current database.

    Several tables declared in ``tables.py`` (the shared dimensions and the
    A1/A3-A8 fact tables) arrive with anchor phases that have not landed
    their migrations yet. Callers use this to skip a table that is not part
    of the environment instead of failing on it.
    """
    rows = query_all(
        cursor, "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()"
    )
    return {str(row["table_name"]) for row in rows}


def table_exists(cursor, table: str) -> bool:
    row = query_one(
        cursor,
        "SELECT COUNT(*) AS total FROM information_schema.tables "
        "WHERE table_schema = DATABASE() AND table_name = %s",
        (table,),
    )
    return bool(row and int(row["total"] or 0))
