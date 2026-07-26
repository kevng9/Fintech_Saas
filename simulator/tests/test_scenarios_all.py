"""Every A1/A3-A8 scenario must emit its published deltas exactly, offline.

Each scenario's ``expected_deltas`` publishes a ``rows_inserted`` map (table ->
row count) and an ``after`` map of the exact metric the injection fixes. This
module builds every scenario's rows with no database connection and checks
both, plus determinism and ``scenario_id`` tagging, generically; a handful of
scenario-specific tests below check the headline metric with real arithmetic
instead of re-deriving it from the same constants the scenario module used.
"""

from __future__ import annotations

import json
from datetime import timedelta

import pytest

from fintech_demo import scenarios
from fintech_demo.generator import World
from fintech_demo.tables import TABLE_COLUMNS

EPOCH_SETTINGS = dict(seed=20260725, epoch=__import__("datetime").datetime(2026, 7, 25, 9, 0, 0))
ALL_SCENARIO_IDS = [
    "A1_REVIEW_SPIKE",
    "A2_PROCESSOR_TIMEOUT",
    "A3_LOSS_CLUSTER",
    "A4_CORRESPONDENT_SPIKE",
    "A5_CASE_SURGE",
    "A6_SETTLEMENT_DELAY",
    "A7_PENDING_EXPOSURE",
    "A8_DINING_SPIKE",
]


@pytest.fixture(scope="module")
def world() -> World:
    return World(EPOCH_SETTINGS["seed"], EPOCH_SETTINGS["epoch"], baseline_days=7)


def _column_index(table: str, name: str) -> int:
    return list(TABLE_COLUMNS[table]).index(name)


def _values(batches, table: str, name: str) -> list:
    index = _column_index(table, name)
    return [row[index] for row in scenarios.rows_for_table(batches, table)]


def test_every_scenario_is_registered() -> None:
    assert {definition.scenario_id for definition in scenarios.all_definitions()} == set(ALL_SCENARIO_IDS)


@pytest.mark.parametrize("scenario_id", ALL_SCENARIO_IDS)
def test_rows_inserted_matches_published_counts(world: World, scenario_id: str) -> None:
    definition = scenarios.get_definition(scenario_id)
    batches = scenarios.build_rows(scenario_id, world, run_id=1, start_minute=world.baseline_minutes)
    rows_by_table: dict[str, int] = {}
    for batch in batches:
        rows_by_table[batch.table] = rows_by_table.get(batch.table, 0) + len(batch.rows)
    assert rows_by_table == definition.expected_deltas["rows_inserted"]


@pytest.mark.parametrize("scenario_id", ALL_SCENARIO_IDS)
def test_every_row_is_tagged_with_scenario_id(world: World, scenario_id: str) -> None:
    batches = scenarios.build_rows(scenario_id, world, run_id=1, start_minute=world.baseline_minutes)
    for batch in batches:
        if "scenario_id" not in TABLE_COLUMNS[batch.table]:
            continue  # aggregate tables (e.g. customer_financial_daily) carry no tag column
        index = _column_index(batch.table, "scenario_id")
        assert all(row[index] == scenario_id for row in batch.rows)


@pytest.mark.parametrize("scenario_id", ALL_SCENARIO_IDS)
def test_scenario_is_deterministic(world: World, scenario_id: str) -> None:
    first = scenarios.build_rows(scenario_id, world, run_id=1, start_minute=world.baseline_minutes)
    second = scenarios.build_rows(scenario_id, world, run_id=1, start_minute=world.baseline_minutes)
    for batch_a, batch_b in zip(first, second):
        assert batch_a.table == batch_b.table
        assert list(batch_a.rows) == list(batch_b.rows)


# --- A1_REVIEW_SPIKE -------------------------------------------------------


def test_a1_referral_and_submit_to_open_rates(world: World) -> None:
    definition = scenarios.get_definition("A1_REVIEW_SPIKE")
    batches = scenarios.build_rows("A1_REVIEW_SPIKE", world, run_id=1, start_minute=world.baseline_minutes)
    applications = scenarios.rows_for_table(batches, "application")
    reviews = scenarios.rows_for_table(batches, "manual_review")
    sessions = scenarios.rows_for_table(batches, "digital_session")

    status_index = _column_index("application", "outcome_status")
    approved = sum(1 for row in applications if row[status_index] == "approved")

    expected = definition.expected_deltas["after"]
    assert len(sessions) == expected["sessions_started"]
    assert len(applications) == expected["applications_submitted"]
    assert len(reviews) == expected["referred_to_review"]
    assert approved == expected["applications_approved"]
    assert len(reviews) / len(applications) == pytest.approx(expected["referral_rate"])
    assert approved / len(applications) == pytest.approx(expected["submit_to_open_rate"])


# --- A3_LOSS_CLUSTER --------------------------------------------------------


def test_a3_confirmed_loss_and_false_positive_rate(world: World) -> None:
    definition = scenarios.get_definition("A3_LOSS_CLUSTER")
    batches = scenarios.build_rows("A3_LOSS_CLUSTER", world, run_id=1, start_minute=world.baseline_minutes)
    cases = scenarios.rows_for_table(batches, "fraud_case")
    alerts = scenarios.rows_for_table(batches, "fraud_alert")
    payments = scenarios.rows_for_table(batches, "payment_event")

    disposition_index = _column_index("fraud_case", "human_disposition")
    loss_index = _column_index("fraud_case", "confirmed_loss")
    confirmed = [row for row in cases if row[disposition_index] == "confirmed_fraud"]
    legitimate = [row for row in cases if row[disposition_index] == "legitimate"]

    expected = definition.expected_deltas["after"]
    assert len(alerts) == expected["cases_total"]
    assert len(confirmed) == expected["confirmed_fraud_cases"]
    assert len(legitimate) == expected["legitimate_cases"]
    assert sum(row[loss_index] for row in confirmed) == pytest.approx(expected["confirmed_loss_usd"])
    assert all(row[loss_index] == 0 for row in legitimate)
    assert len(legitimate) / len(cases) == pytest.approx(expected["false_positive_rate"])
    assert len(payments) == definition.expected_deltas["rows_inserted"]["payment_event"]

    reason_codes_index = _column_index("fraud_alert", "reason_codes")
    for row in alerts:
        assert json.loads(row[reason_codes_index])  # valid JSON string, not a raw list/dict


# --- A4_CORRESPONDENT_SPIKE --------------------------------------------------


def test_a4_alert_priority_and_linked_evidence(world: World) -> None:
    definition = scenarios.get_definition("A4_CORRESPONDENT_SPIKE")
    batches = scenarios.build_rows(
        "A4_CORRESPONDENT_SPIKE", world, run_id=1, start_minute=world.baseline_minutes
    )
    alerts = scenarios.rows_for_table(batches, "aml_alert")
    links = scenarios.rows_for_table(batches, "aml_alert_transaction")
    evidence = scenarios.rows_for_table(batches, "aml_evidence")

    priority_index = _column_index("aml_alert", "priority")
    status_index = _column_index("aml_alert", "status")
    due_index = _column_index("aml_alert", "sla_due_at")
    created_index = _column_index("aml_alert", "created_at")

    expected = definition.expected_deltas["after"]
    assert len(alerts) == 1
    assert alerts[0][priority_index] == "high"
    assert alerts[0][status_index] == "open"
    assert alerts[0][due_index] - alerts[0][created_index] <= timedelta(hours=24)
    assert len(links) == expected["linked_transaction_count"]
    assert len(evidence) == expected["evidence_delta"]


# --- A5_CASE_SURGE -----------------------------------------------------------


def test_a5_queue_depth_and_sla_risk(world: World) -> None:
    definition = scenarios.get_definition("A5_CASE_SURGE")
    batches = scenarios.build_rows("A5_CASE_SURGE", world, run_id=1, start_minute=world.baseline_minutes)
    disputes = scenarios.rows_for_table(batches, "dispute_case")

    reason_index = _column_index("dispute_case", "reason_code")
    due_index = _column_index("dispute_case", "due_at")
    opened_index = _column_index("dispute_case", "opened_at")

    expected = definition.expected_deltas["after"]
    assert len(disputes) == expected["queue_depth_delta"]
    assert all(row[reason_index] == "MERCHANT_OUTAGE" for row in disputes)

    within_hour = sum(
        1 for row in disputes if row[due_index] - row[opened_index] <= timedelta(minutes=60)
    )
    assert within_hour == expected["sla_risk_delta"]


# --- A6_SETTLEMENT_DELAY ------------------------------------------------------


def test_a6_offsetting_settlement_amount(world: World) -> None:
    definition = scenarios.get_definition("A6_SETTLEMENT_DELAY")
    batches = scenarios.build_rows(
        "A6_SETTLEMENT_DELAY", world, run_id=1, start_minute=world.baseline_minutes
    )
    settlements = scenarios.rows_for_table(batches, "settlement")
    assert len(settlements) == 1

    amount_index = _column_index("settlement", "amount")
    direction_index = _column_index("settlement", "direction")
    status_index = _column_index("settlement", "status")

    expected = definition.expected_deltas["after"]
    row = settlements[0]
    assert row[direction_index] == "inbound"
    assert row[status_index] == "pending"
    assert row[amount_index] == pytest.approx(-expected["settlement_at_risk_usd"])
    assert -row[amount_index] == pytest.approx(expected["settlement_at_risk_usd"])
    assert row[amount_index] == pytest.approx(expected["liquidity_delta_usd"])


# --- A7_PENDING_EXPOSURE -------------------------------------------------------


def test_a7_pending_amount_and_concentration_math(world: World) -> None:
    definition = scenarios.get_definition("A7_PENDING_EXPOSURE")
    batches = scenarios.build_rows(
        "A7_PENDING_EXPOSURE", world, run_id=1, start_minute=world.baseline_minutes
    )
    applications = scenarios.rows_for_table(batches, "credit_application")
    evidence = scenarios.rows_for_table(batches, "credit_evidence")

    amount_index = _column_index("credit_application", "requested_amount")
    status_index = _column_index("credit_application", "review_status")
    verification_index = _column_index("credit_evidence", "verification_status")

    expected = definition.expected_deltas["after"]
    assert len(applications) == 1
    assert applications[0][amount_index] == pytest.approx(expected["pending_amount_usd"])
    assert applications[0][status_index] != "decided"
    assert len(evidence) == 2
    assert all(row[verification_index] in {"exception", "incomplete"} for row in evidence)

    booked_segment, booked_total = 20_000_000.00, 100_000_000.00
    pending = expected["pending_amount_usd"]
    assert booked_segment / booked_total == pytest.approx(expected["booked_concentration_share"])
    assert (booked_segment + pending) / (booked_total + pending) == pytest.approx(
        expected["pro_forma_concentration_share"], abs=0.0005
    )
    assert (booked_segment + pending) / (booked_total + pending) == pytest.approx(0.238095, abs=0.0005)


# --- A8_DINING_SPIKE -----------------------------------------------------------


def test_a8_dining_total_and_daily_delta(world: World) -> None:
    definition = scenarios.get_definition("A8_DINING_SPIKE")
    batches = scenarios.build_rows("A8_DINING_SPIKE", world, run_id=1, start_minute=world.baseline_minutes)
    transactions = scenarios.rows_for_table(batches, "customer_transaction")
    daily = scenarios.rows_for_table(batches, "customer_financial_daily")

    amount_index = _column_index("customer_transaction", "amount")
    category_index = _column_index("customer_transaction", "category")
    customer_index = _column_index("customer_transaction", "customer_id")
    outflow_index = _column_index("customer_financial_daily", "outflows")
    netflow_index = _column_index("customer_financial_daily", "net_flow")

    expected = definition.expected_deltas["after"]
    assert len(transactions) == 3
    assert sum(row[amount_index] for row in transactions) == pytest.approx(expected["dining_spend_delta_usd"])
    assert all(row[category_index] == "Dining" for row in transactions)
    assert all(row[customer_index] == "CUST-0001" for row in transactions)
    assert len(daily) == 1
    assert daily[0][outflow_index] == pytest.approx(expected["outflow_delta_usd"])
    assert daily[0][netflow_index] == pytest.approx(expected["net_flow_delta_usd"])
