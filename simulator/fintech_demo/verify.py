"""Database-level verification of the baseline and of scenario deltas.

These checks are the database test suite from spec section 18.2 in executable
form: active-run filtering, baseline row counts and checksum, and the exact
scenario deltas published in the scenario manifest.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Callable, Sequence

from . import fingerprint as fp
from . import scenarios, state
from .config import TEMPLATE_RUN_ID, Settings
from .db import query_all, query_one, scalar
from .seed import baseline_file

AA_VIEWS = (
    "aa_payment_performance_hourly",
    "aa_payment_decline_mix",
    "aa_payment_event_sample",
)


@dataclass
class Check:
    name: str
    passed: bool
    expected: Any = None
    actual: Any = None
    detail: str = ""

    def line(self) -> str:
        mark = "PASS" if self.passed else "FAIL"
        body = f"[{mark}] {self.name}"
        if not self.passed or self.detail:
            body += f"\n       expected={self.expected!r} actual={self.actual!r}"
            if self.detail:
                body += f"\n       {self.detail}"
        return body


def exact_p95(cursor, where: str, params: Sequence[Any]) -> int | None:
    """Nearest-rank p95: the value at ascending rank ceil(0.95 * n)."""
    total = int(scalar(cursor, f"SELECT COUNT(*) FROM payment_event WHERE {where}", params) or 0)
    if total == 0:
        return None
    offset = max(total - math.ceil(total * 0.95), 0)
    row = query_one(
        cursor,
        f"SELECT latency_ms FROM payment_event WHERE {where} "
        f"ORDER BY latency_ms DESC LIMIT 1 OFFSET {offset}",
        params,
    )
    return int(row["latency_ms"]) if row else None


def segment_metrics(cursor, where: str, params: Sequence[Any]) -> dict[str, Any]:
    row = query_one(
        cursor,
        f"""
        SELECT
            COUNT(*) AS attempts,
            SUM(approved) AS approvals,
            SUM(CASE WHEN response_code = 'TIMEOUT' THEN 1 ELSE 0 END) AS timeout_declines
        FROM payment_event WHERE {where}
        """,
        params,
    )
    attempts = int(row["attempts"] or 0)
    approvals = int(row["approvals"] or 0)
    timeouts = int(row["timeout_declines"] or 0)
    return {
        "attempts": attempts,
        "approvals": approvals,
        "timeout_declines": timeouts,
        "approval_rate": (approvals / attempts) if attempts else None,
        "timeout_decline_rate": (timeouts / attempts) if attempts else None,
        "p95_latency_ms": exact_p95(cursor, where, params),
    }


def verify_baseline(settings: Settings, cursor) -> list[Check]:
    checks: list[Check] = []
    active = state.read_active(cursor)
    if active is None:
        return [Check("active run present", False, "one row", "none")]

    run_id = int(active["run_id"])
    checks.append(
        Check(
            "active run is a reset run, not the template",
            run_id != TEMPLATE_RUN_ID,
            f"run_id != {TEMPLATE_RUN_ID}",
            run_id,
        )
    )
    checks.append(
        Check(
            "stream state is a known value",
            active["stream_status"]
            in {
                state.STATUS_PAUSED,
                state.STATUS_RUNNING,
                state.STATUS_PREPARING,
                state.STATUS_RESETTING,
            },
            "PAUSED|RUNNING|PREPARING|RESETTING",
            active["stream_status"],
        )
    )

    tables = fp.table_fingerprint(cursor, run_id)
    document = fp.build_document(
        fixture_version=settings.fixture_version,
        seed=settings.seed,
        epoch=settings.epoch,
        baseline_days=settings.baseline_days,
        tables=tables,
    )
    digest = fp.checksum(document)
    expected_path = baseline_file(settings)
    if expected_path.exists():
        expected = json.loads(expected_path.read_text(encoding="utf-8"))
        problems = fp.diff(expected.get("fingerprint", {}), document)
        checks.append(
            Check(
                f"baseline checksum matches {expected_path.name}",
                expected.get("checksum") == digest,
                expected.get("checksum"),
                digest,
                detail="; ".join(problems[:5]),
            )
        )
    else:
        checks.append(
            Check("versioned baseline file present", False, expected_path.name, "missing")
        )

    run = query_one(cursor, "SELECT * FROM demo_run WHERE run_id = %s", (run_id,))
    checks.append(
        Check(
            "run checksum recorded on demo_run",
            bool(run) and str(run["baseline_checksum"]) == digest,
            digest,
            run["baseline_checksum"] if run else None,
        )
    )

    epoch = run["logical_epoch"] if run else settings.epoch
    definition = scenarios.get_definition("A2_PROCESSOR_TIMEOUT")
    segment = definition.expected_deltas["segment"]
    baseline_expectations = definition.expected_deltas["baseline"]
    where = (
        "run_id = %s AND processor_id = %s AND card_network = %s AND issuer_country = %s "
        "AND scenario_id IS NULL AND event_time < %s"
    )
    params = (
        run_id,
        segment["processor_id"],
        segment["card_network"],
        segment["issuer_country"],
        epoch,
    )
    metrics = segment_metrics(cursor, where, params)
    checks.append(
        Check(
            "A2 affected lane baseline approval rate",
            metrics["approval_rate"] is not None
            and abs(metrics["approval_rate"] - baseline_expectations["approval_rate"]) < 1e-9,
            baseline_expectations["approval_rate"],
            metrics["approval_rate"],
            detail=f"attempts={metrics['attempts']:,}",
        )
    )
    checks.append(
        Check(
            "A2 affected lane baseline timeout share",
            metrics["timeout_decline_rate"] is not None
            and abs(metrics["timeout_decline_rate"] - baseline_expectations["timeout_decline_rate"])
            < 1e-9,
            baseline_expectations["timeout_decline_rate"],
            metrics["timeout_decline_rate"],
        )
    )
    checks.append(
        Check(
            "A2 affected lane baseline p95 latency",
            metrics["p95_latency_ms"] == baseline_expectations["p95_latency_ms"],
            baseline_expectations["p95_latency_ms"],
            metrics["p95_latency_ms"],
        )
    )

    for view in AA_VIEWS:
        rows = int(scalar(cursor, f"SELECT COUNT(*) FROM {view}") or 0)
        checks.append(Check(f"{view} returns rows for the active run", rows > 0, "> 0", rows))

    view_attempts = int(
        scalar(cursor, "SELECT SUM(attempts) FROM aa_payment_performance_hourly") or 0
    )
    table_attempts = int(
        scalar(
            cursor,
            "SELECT COUNT(*) FROM payment_event pe JOIN demo_active_run ar "
            "ON ar.singleton_id = 1 AND ar.run_id = pe.run_id "
            "WHERE pe.event_time <= ar.logical_time",
        )
        or 0
    )
    checks.append(
        Check(
            "hourly view exposes exactly the active run inside the logical clock",
            view_attempts == table_attempts,
            table_attempts,
            view_attempts,
        )
    )

    other_run_rows = int(
        scalar(
            cursor,
            "SELECT COUNT(*) FROM payment_event WHERE run_id NOT IN (%s, %s)",
            (TEMPLATE_RUN_ID, run_id),
        )
        or 0
    )
    checks.append(
        Check("superseded run data removed", other_run_rows == 0, 0, other_run_rows)
    )
    return checks


def _count(cursor, table: str, where: str, params: Sequence[Any]) -> int:
    return int(scalar(cursor, f"SELECT COUNT(*) FROM {table} WHERE {where}", params) or 0)


def _sum(cursor, table: str, column: str, where: str, params: Sequence[Any]) -> float:
    value = scalar(cursor, f"SELECT SUM({column}) FROM {table} WHERE {where}", params)
    return float(value) if value is not None else 0.0


def _rate(numerator: int, denominator: int) -> float | None:
    return (numerator / denominator) if denominator else None


def _close(actual: float | None, expected: float, tolerance: float) -> bool:
    return actual is not None and abs(actual - expected) <= tolerance


def _verify_a2(cursor, run_id: int, definition: "scenarios.ScenarioDefinition", execution: dict) -> list[Check]:
    checks: list[Check] = []
    expected = definition.expected_deltas["after"]
    tolerance = definition.expected_deltas["tolerance"]
    segment = definition.expected_deltas["segment"]
    where = (
        "run_id = %s AND processor_id = %s AND card_network = %s AND issuer_country = %s "
        "AND event_time >= %s AND event_time < %s"
    )
    params = (
        run_id,
        segment["processor_id"],
        segment["card_network"],
        segment["issuer_country"],
        execution["window_start"],
        execution["window_end"],
    )
    metrics = segment_metrics(cursor, where, params)

    checks.append(
        Check("scenario window attempts", metrics["attempts"] == expected["attempts"], expected["attempts"], metrics["attempts"])
    )
    checks.append(
        Check(
            "scenario window approvals",
            metrics["approvals"] == expected["approvals"],
            expected["approvals"],
            metrics["approvals"],
        )
    )
    checks.append(
        Check(
            "scenario window approval rate",
            _close(metrics["approval_rate"], expected["approval_rate"], tolerance["approval_rate"]),
            expected["approval_rate"],
            metrics["approval_rate"],
        )
    )
    checks.append(
        Check(
            "scenario window timeout share",
            _close(
                metrics["timeout_decline_rate"],
                expected["timeout_decline_rate"],
                tolerance["timeout_decline_rate"],
            ),
            expected["timeout_decline_rate"],
            metrics["timeout_decline_rate"],
        )
    )
    checks.append(
        Check(
            "scenario window p95 latency",
            _close(metrics["p95_latency_ms"], expected["p95_latency_ms"], tolerance["p95_latency_ms"]),
            expected["p95_latency_ms"],
            metrics["p95_latency_ms"],
        )
    )

    scenario_rows = _count(cursor, "payment_event", "run_id = %s AND scenario_id = %s", (run_id, definition.scenario_id))
    expected_rows = definition.expected_deltas["rows_inserted"]["payment_event"]
    checks.append(
        Check("scenario rows tagged with scenario_id", scenario_rows == expected_rows, expected_rows, scenario_rows)
    )
    return checks


def _verify_a1(cursor, run_id: int, definition: "scenarios.ScenarioDefinition", execution: dict) -> list[Check]:
    scenario_id = definition.scenario_id
    expected = definition.expected_deltas["after"]
    tolerance = definition.expected_deltas["tolerance"]
    where = "run_id = %s AND scenario_id = %s"
    params = (run_id, scenario_id)

    sessions = _count(cursor, "digital_session", where, params)
    applications = _count(cursor, "application", where, params)
    reviews = _count(cursor, "manual_review", where, params)
    approved = _count(cursor, "application", where + " AND outcome_status = 'approved'", params)
    referral_rate = _rate(reviews, applications)
    submit_to_open = _rate(approved, applications)

    return [
        Check("A1 sessions inserted", sessions == expected["sessions_started"], expected["sessions_started"], sessions),
        Check(
            "A1 applications inserted",
            applications == expected["applications_submitted"],
            expected["applications_submitted"],
            applications,
        ),
        Check(
            "A1 manual reviews inserted",
            reviews == expected["referred_to_review"],
            expected["referred_to_review"],
            reviews,
        ),
        Check(
            "A1 approved openings",
            approved == expected["applications_approved"],
            expected["applications_approved"],
            approved,
        ),
        Check(
            "A1 referral rate",
            _close(referral_rate, expected["referral_rate"], tolerance["referral_rate"]),
            expected["referral_rate"],
            referral_rate,
        ),
        Check(
            "A1 submit-to-open rate",
            _close(submit_to_open, expected["submit_to_open_rate"], tolerance["submit_to_open_rate"]),
            expected["submit_to_open_rate"],
            submit_to_open,
        ),
    ]


def _verify_a3(cursor, run_id: int, definition: "scenarios.ScenarioDefinition", execution: dict) -> list[Check]:
    scenario_id = definition.scenario_id
    expected = definition.expected_deltas["after"]
    tolerance = definition.expected_deltas["tolerance"]
    where = "run_id = %s AND scenario_id = %s"
    params = (run_id, scenario_id)

    payments = _count(cursor, "payment_event", where, params)
    cases = _count(cursor, "fraud_case", where, params)
    alerts = _count(cursor, "fraud_alert", where, params)
    confirmed = _count(cursor, "fraud_case", where + " AND human_disposition = 'confirmed_fraud'", params)
    legitimate = _count(cursor, "fraud_case", where + " AND human_disposition = 'legitimate'", params)
    loss = _sum(cursor, "fraud_case", "confirmed_loss", where + " AND human_disposition = 'confirmed_fraud'", params)
    fp_rate = _rate(legitimate, cases)

    return [
        Check(
            "A3 transactions inserted",
            payments == definition.expected_deltas["rows_inserted"]["payment_event"],
            definition.expected_deltas["rows_inserted"]["payment_event"],
            payments,
        ),
        Check("A3 alerts inserted", alerts == expected["cases_total"], expected["cases_total"], alerts),
        Check("A3 cases inserted", cases == expected["cases_total"], expected["cases_total"], cases),
        Check(
            "A3 confirmed fraud cases",
            confirmed == expected["confirmed_fraud_cases"],
            expected["confirmed_fraud_cases"],
            confirmed,
        ),
        Check(
            "A3 legitimate cases",
            legitimate == expected["legitimate_cases"],
            expected["legitimate_cases"],
            legitimate,
        ),
        Check(
            "A3 confirmed loss total",
            _close(loss, expected["confirmed_loss_usd"], tolerance["confirmed_loss_usd"]),
            expected["confirmed_loss_usd"],
            loss,
        ),
        Check(
            "A3 false-positive rate",
            _close(fp_rate, expected["false_positive_rate"], tolerance["false_positive_rate"]),
            expected["false_positive_rate"],
            fp_rate,
        ),
    ]


def _verify_a4(cursor, run_id: int, definition: "scenarios.ScenarioDefinition", execution: dict) -> list[Check]:
    scenario_id = definition.scenario_id
    where = "run_id = %s AND scenario_id = %s"
    params = (run_id, scenario_id)
    rows_inserted = definition.expected_deltas["rows_inserted"]

    alerts = _count(cursor, "aml_alert", where, params)
    high_priority = _count(cursor, "aml_alert", where + " AND priority = 'high'", params)
    links = _count(cursor, "aml_alert_transaction", where, params)
    evidence = _count(cursor, "aml_evidence", where, params)

    return [
        Check("A4 alerts inserted", alerts == rows_inserted["aml_alert"], rows_inserted["aml_alert"], alerts),
        Check("A4 alert is high priority", high_priority == 1, 1, high_priority),
        Check(
            "A4 linked transactions inserted",
            links == rows_inserted["aml_alert_transaction"],
            rows_inserted["aml_alert_transaction"],
            links,
        ),
        Check(
            "A4 evidence records inserted",
            evidence == rows_inserted["aml_evidence"],
            rows_inserted["aml_evidence"],
            evidence,
        ),
    ]


def _verify_a5(cursor, run_id: int, definition: "scenarios.ScenarioDefinition", execution: dict) -> list[Check]:
    scenario_id = definition.scenario_id
    expected = definition.expected_deltas["after"]
    where = "run_id = %s AND scenario_id = %s"
    params = (run_id, scenario_id)

    disputes = _count(cursor, "dispute_case", where, params)
    sla_deadline = execution["window_start"] + timedelta(hours=24)
    sla_risk = _count(cursor, "dispute_case", where + " AND due_at <= %s", (*params, sla_deadline))

    return [
        Check(
            "A5 disputes inserted",
            disputes == expected["queue_depth_delta"],
            expected["queue_depth_delta"],
            disputes,
        ),
        Check(
            "A5 SLA-risk disputes (due within 24h)",
            sla_risk == expected["sla_risk_delta"],
            expected["sla_risk_delta"],
            sla_risk,
        ),
    ]


def _verify_a6(cursor, run_id: int, definition: "scenarios.ScenarioDefinition", execution: dict) -> list[Check]:
    scenario_id = definition.scenario_id
    expected = definition.expected_deltas["after"]
    tolerance = definition.expected_deltas["tolerance"]
    where = "run_id = %s AND scenario_id = %s"
    params = (run_id, scenario_id)

    rows = _count(cursor, "settlement", where, params)
    amount = _sum(cursor, "settlement", "amount_usd", where, params)
    pending_inbound = _count(
        cursor, "settlement", where + " AND status = 'pending' AND direction = 'inbound'", params
    )

    return [
        Check("A6 settlement row inserted", rows == 1, 1, rows),
        Check("A6 settlement is pending inbound", pending_inbound == 1, 1, pending_inbound),
        Check(
            "A6 settlement offsets the delayed amount",
            _close(amount, -expected["settlement_at_risk_usd"], tolerance["settlement_at_risk_usd"]),
            -expected["settlement_at_risk_usd"],
            amount,
        ),
    ]


def _verify_a7(cursor, run_id: int, definition: "scenarios.ScenarioDefinition", execution: dict) -> list[Check]:
    from .generators.a7_credit import TARGET_GEOGRAPHY, TARGET_INDUSTRY

    scenario_id = definition.scenario_id
    expected = definition.expected_deltas["after"]
    tolerance = definition.expected_deltas["tolerance"]
    where = "run_id = %s AND scenario_id = %s"
    params = (run_id, scenario_id)
    rows_inserted = definition.expected_deltas["rows_inserted"]

    applications = _count(cursor, "credit_application", where, params)
    evidence = _count(cursor, "credit_evidence", where, params)
    pending_amount = _sum(cursor, "credit_application", "requested_amount", where, params)

    latest_as_of = scalar(cursor, "SELECT MAX(as_of_time) FROM portfolio_exposure_snapshot WHERE run_id = %s", (run_id,))
    booked_total = _sum(
        cursor,
        "portfolio_exposure_snapshot",
        "outstanding_amount",
        "run_id = %s AND as_of_time = %s",
        (run_id, latest_as_of),
    )
    booked_segment = _sum(
        cursor,
        "portfolio_exposure_snapshot",
        "outstanding_amount",
        "run_id = %s AND as_of_time = %s AND industry_code = %s AND geography_id = %s",
        (run_id, latest_as_of, TARGET_INDUSTRY, TARGET_GEOGRAPHY),
    )
    booked_share = _rate(booked_segment, booked_total)
    pro_forma_share = _rate(booked_segment + pending_amount, booked_total + pending_amount)

    return [
        Check(
            "A7 pending application inserted",
            applications == rows_inserted["credit_application"],
            rows_inserted["credit_application"],
            applications,
        ),
        Check(
            "A7 evidence exceptions inserted",
            evidence == rows_inserted["credit_evidence"],
            rows_inserted["credit_evidence"],
            evidence,
        ),
        Check(
            "A7 pending amount",
            _close(pending_amount, expected["pending_amount_usd"], 0.005),
            expected["pending_amount_usd"],
            pending_amount,
        ),
        Check(
            "A7 booked concentration share unchanged",
            _close(booked_share, expected["booked_concentration_share"], tolerance["booked_concentration_share"]),
            expected["booked_concentration_share"],
            booked_share,
        ),
        Check(
            "A7 pro forma concentration share",
            _close(
                pro_forma_share,
                expected["pro_forma_concentration_share"],
                tolerance["pro_forma_concentration_share"],
            ),
            expected["pro_forma_concentration_share"],
            pro_forma_share,
        ),
    ]


def _verify_a8(cursor, run_id: int, definition: "scenarios.ScenarioDefinition", execution: dict) -> list[Check]:
    from .generators.a8_customer import DEMO_CUSTOMER_ID

    scenario_id = definition.scenario_id
    expected = definition.expected_deltas["after"]
    tolerance = definition.expected_deltas["tolerance"]
    where = "run_id = %s AND scenario_id = %s"
    params = (run_id, scenario_id)
    rows_inserted = definition.expected_deltas["rows_inserted"]

    transactions = _count(cursor, "customer_transaction", where, params)
    dining_outflow = _sum(
        cursor,
        "customer_transaction",
        "amount_usd",
        where + " AND category = 'Dining' AND direction = 'outflow'",
        params,
    )
    injection_date = execution["window_start"].date()
    daily = query_one(
        cursor,
        "SELECT outflows, net_flow FROM customer_financial_daily "
        "WHERE run_id = %s AND customer_id = %s AND date = %s",
        (run_id, DEMO_CUSTOMER_ID, injection_date),
    )
    net_flow = float(daily["net_flow"]) if daily else None
    outflows = float(daily["outflows"]) if daily else None

    return [
        Check(
            "A8 dining transactions inserted",
            transactions == rows_inserted["customer_transaction"],
            rows_inserted["customer_transaction"],
            transactions,
        ),
        Check(
            "A8 dining spend total",
            _close(dining_outflow, expected["dining_spend_delta_usd"], tolerance["dining_spend_delta_usd"]),
            expected["dining_spend_delta_usd"],
            dining_outflow,
        ),
        Check(
            "A8 daily outflow reflects the spike",
            _close(outflows, expected["outflow_delta_usd"], tolerance["dining_spend_delta_usd"]),
            expected["outflow_delta_usd"],
            outflows,
        ),
        Check(
            "A8 daily net flow reflects the spike",
            _close(net_flow, expected["net_flow_delta_usd"], tolerance["dining_spend_delta_usd"]),
            expected["net_flow_delta_usd"],
            net_flow,
        ),
    ]


_SCENARIO_VERIFIERS: dict[str, Callable[[Any, int, Any, dict], list[Check]]] = {
    "A1_REVIEW_SPIKE": _verify_a1,
    "A2_PROCESSOR_TIMEOUT": _verify_a2,
    "A3_LOSS_CLUSTER": _verify_a3,
    "A4_CORRESPONDENT_SPIKE": _verify_a4,
    "A5_CASE_SURGE": _verify_a5,
    "A6_SETTLEMENT_DELAY": _verify_a6,
    "A7_PENDING_EXPOSURE": _verify_a7,
    "A8_DINING_SPIKE": _verify_a8,
}


def verify_scenario(settings: Settings, cursor, scenario_id: str) -> list[Check]:
    definition = scenarios.get_definition(scenario_id)
    active = state.read_active(cursor)
    if active is None:
        return [Check("active run present", False, "one row", "none")]
    run_id = int(active["run_id"])

    execution = query_one(
        cursor,
        "SELECT * FROM demo_scenario_execution WHERE run_id = %s AND scenario_id = %s "
        "AND status = 'complete' ORDER BY completed_at DESC LIMIT 1",
        (run_id, scenario_id),
    )
    if execution is None:
        return [
            Check(
                f"{scenario_id} has a completed execution on run {run_id}",
                False,
                "one completed execution",
                "none",
            )
        ]

    verifier = _SCENARIO_VERIFIERS.get(scenario_id)
    checks: list[Check] = list(verifier(cursor, run_id, definition, execution)) if verifier else []

    duplicates = query_all(
        cursor,
        "SELECT idempotency_key, COUNT(*) AS executions FROM demo_scenario_execution "
        "WHERE run_id = %s AND scenario_id = %s GROUP BY idempotency_key HAVING COUNT(*) > 1",
        (run_id, scenario_id),
    )
    checks.append(Check("no duplicate executions per idempotency key", not duplicates, [], duplicates))
    return checks


def summarise(checks: list[Check]) -> tuple[int, int]:
    passed = sum(1 for check in checks if check.passed)
    return passed, len(checks)
