"""Checksum stability and migration/Domain-boundary guards.

The Domain-boundary test is the executable form of the rule that an Aura Domain
may only ever see curated ``aa_*`` views, never a control table.
"""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

import pytest

from fintech_demo import fingerprint as fp
from fintech_demo.db import MIGRATIONS_DIR, split_statements
from fintech_demo.generator import PAYMENT_EVENT_COLUMNS

REPO_ROOT = Path(__file__).resolve().parents[2]
CONTROL_TABLES = (
    "demo_run",
    "demo_scenario",
    "demo_scenario_execution",
    "demo_event_log",
    "demo_command",
    "demo_audit",
)
EXPECTED_A2_VIEWS = {
    "aa_payment_performance_hourly",
    "aa_payment_decline_mix",
    "aa_payment_event_sample",
}
EXPECTED_VIEWS_BY_DOMAIN = {
    "a1-digital-journey": {
        "aa_digital_funnel",
        "aa_digital_intent_cohort",
        "aa_digital_review_comparison",
    },
    "a2-payment-pulse": EXPECTED_A2_VIEWS,
    "a3-fraud-strategy": {
        "aa_fraud_loss_summary",
        "aa_fraud_case_review",
        "aa_fraud_segment_evidence",
    },
    "a4-aml-operations": {
        "aa_aml_backlog",
        "aa_aml_entity_activity",
        "aa_aml_alert_evidence",
    },
    "a5-disputes-operations": {
        "aa_dispute_sla_risk",
        "aa_dispute_queue_driver",
        "aa_dispute_timeline",
    },
    "a6-liquidity": {
        "aa_liquidity_position",
        "aa_liquidity_variance",
        "aa_funding_window",
    },
    "a7-credit-risk": {
        "aa_credit_operations",
        "aa_credit_application_evidence",
        "aa_portfolio_concentration",
    },
    "a8-customer-money": {
        "aa_customer_money_summary",
        "aa_customer_spend_change",
        "aa_customer_transaction_evidence",
    },
}
ALL_EXPECTED_VIEWS: set[str] = set().union(*EXPECTED_VIEWS_BY_DOMAIN.values())


def read_migrations() -> str:
    return "\n".join(path.read_text(encoding="utf-8") for path in sorted(MIGRATIONS_DIR.glob("*.sql")))


def view_bodies() -> dict[str, str]:
    sql = read_migrations()
    bodies: dict[str, str] = {}
    for statement in split_statements(sql):
        match = re.match(r"CREATE VIEW (\w+) AS", statement.strip(), re.IGNORECASE)
        if match:
            bodies[match.group(1)] = statement
    return bodies


def test_migrations_split_into_executable_statements() -> None:
    statements = split_statements(read_migrations())
    assert statements
    assert all(not statement.endswith(";") for statement in statements)
    assert any(statement.upper().startswith("CREATE ROWSTORE TABLE") for statement in statements)


def ddl_columns(table: str) -> list[str]:
    for statement in split_statements(read_migrations()):
        if not re.match(rf"CREATE (?:ROWSTORE )?TABLE {table}\b", statement.strip(), re.IGNORECASE):
            continue
        body = statement[statement.index("(") + 1 : statement.rindex(")")]
        columns = []
        for line in body.splitlines():
            match = re.match(r"\s*(\w+)\s+[A-Za-z]", line)
            if match and match.group(1).upper() not in {"PRIMARY", "SHARD", "SORT", "KEY", "UNIQUE"}:
                columns.append(match.group(1))
        return columns
    raise AssertionError(f"no CREATE TABLE found for {table}")


def test_generator_tuple_order_matches_the_payment_event_ddl() -> None:
    """Rows are inserted positionally, so a column added to one side must land in both."""
    assert list(PAYMENT_EVENT_COLUMNS) == ddl_columns("payment_event")


def test_template_clone_copies_every_payment_event_column() -> None:
    """Reset clones run 0 with an explicit column list; a missed column loses data."""
    seed_source = (REPO_ROOT / "simulator" / "fintech_demo" / "seed.py").read_text(encoding="utf-8")
    clone = re.search(
        r"INSERT INTO payment_event \((.*?)\)\s*SELECT", seed_source, re.DOTALL
    )
    assert clone, "template clone statement not found"
    listed = [name.strip() for name in clone.group(1).replace("\n", " ").split(",")]
    assert set(listed) == set(PAYMENT_EVENT_COLUMNS)


def test_expected_views_exist() -> None:
    assert set(view_bodies()) == ALL_EXPECTED_VIEWS


def test_every_view_is_scoped_to_the_active_run() -> None:
    for name, body in view_bodies().items():
        assert "demo_active_run" in body, f"{name} must join demo_active_run"
        assert "ar.logical_time" in body, f"{name} must filter on the logical clock"


def test_no_view_exposes_a_control_table() -> None:
    for name, body in view_bodies().items():
        for table in CONTROL_TABLES:
            assert not re.search(rf"\b{table}\b", body), f"{name} must not read {table}"


@pytest.mark.parametrize("domain_dir,expected_views", sorted(EXPECTED_VIEWS_BY_DOMAIN.items()))
def test_domain_manifest_only_lists_curated_views(domain_dir: str, expected_views: set[str]) -> None:
    manifest = (REPO_ROOT / "domains" / domain_dir / "manifest.yaml").read_text(encoding="utf-8")
    listed = set(re.findall(r"^\s*-\s*name:\s*(\w+)\s*$", manifest, re.MULTILINE))
    assert listed == expected_views
    for table in CONTROL_TABLES + ("payment_event", "dim_customer"):
        assert not re.search(rf"^\s*-\s*name:\s*{table}\s*$", manifest, re.MULTILINE)


def test_checksum_is_stable_and_order_independent() -> None:
    tables = {
        "payment_event": {"rows": 10, "approvals": 9},
        "dim_customer": {"rows": 500, "min_id": "CUST-0001"},
    }
    document_a = fp.build_document(
        fixture_version="1.0.0",
        seed=1,
        epoch=datetime(2026, 7, 25, 9, 0, 0),
        baseline_days=7,
        tables=tables,
    )
    document_b = fp.build_document(
        fixture_version="1.0.0",
        seed=1,
        epoch=datetime(2026, 7, 25, 9, 0, 0),
        baseline_days=7,
        tables={key: dict(reversed(list(value.items()))) for key, value in reversed(list(tables.items()))},
    )
    assert fp.checksum(document_a) == fp.checksum(document_b)


def test_checksum_changes_when_data_changes() -> None:
    base = fp.build_document(
        fixture_version="1.0.0",
        seed=1,
        epoch=datetime(2026, 7, 25, 9, 0, 0),
        baseline_days=7,
        tables={"payment_event": {"rows": 10}},
    )
    changed = fp.build_document(
        fixture_version="1.0.0",
        seed=1,
        epoch=datetime(2026, 7, 25, 9, 0, 0),
        baseline_days=7,
        tables={"payment_event": {"rows": 11}},
    )
    assert fp.checksum(base) != fp.checksum(changed)
    assert fp.diff(base, changed)


@pytest.mark.parametrize("seed,expected", [(1, True), (2, False)])
def test_checksum_depends_on_seed(seed: int, expected: bool) -> None:
    reference = fp.checksum(
        fp.build_document(
            fixture_version="1.0.0",
            seed=1,
            epoch=datetime(2026, 7, 25, 9, 0, 0),
            baseline_days=7,
            tables={"payment_event": {"rows": 10}},
        )
    )
    candidate = fp.checksum(
        fp.build_document(
            fixture_version="1.0.0",
            seed=seed,
            epoch=datetime(2026, 7, 25, 9, 0, 0),
            baseline_days=7,
            tables={"payment_event": {"rows": 10}},
        )
    )
    assert (reference == candidate) is expected
