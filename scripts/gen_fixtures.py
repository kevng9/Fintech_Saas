"""One-off generator for A1/A3-A8 analyst fixtures.

Not wired into the build; run manually to (re)generate fixtures/analyst/<anchor>/*.json
for the anchors that don't use the A2-style live-generator pipeline. Reads
knownQuestions.ts so every known-question fixture's prompt is byte-identical to
the app suite, then self-checks against a Python port of the fixture matcher
(app/src/lib/analyst/fixtures.ts) before writing anything.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
KNOWN_QUESTIONS_TS = REPO_ROOT / "app" / "src" / "lib" / "anchors" / "knownQuestions.ts"
FIXTURE_ROOT = REPO_ROOT / "fixtures" / "analyst"


def tokens(text: str) -> set[str]:
    cleaned = re.sub(r"[^a-z0-9 ]", " ", text.lower())
    return {t for t in cleaned.split() if len(t) > 2}


def score(question: str, fixture: dict) -> float:
    asked = tokens(question)
    target = tokens(" ".join([fixture["prompt"], *fixture["match"]]))
    if not asked or not target:
        return 0.0
    return len(asked & target) / len(asked)


def resolves(question: str, state: str, pool: list[dict]) -> bool:
    eligible = [f for f in pool if f["scenario_state"] in {state, "any"}] or pool
    if any(f["prompt"].strip().lower() == question.strip().lower() for f in eligible):
        return True
    return max((score(question, f) for f in eligible), default=0.0) >= 0.34


def load_known_questions() -> dict[str, list[dict]]:
    ts = KNOWN_QUESTIONS_TS.read_text(encoding="utf-8")
    pattern = re.compile(
        r'id:\s*"(\w+)",\s*anchorId:\s*"(\w+)",\s*question:\s*"((?:[^"\\]|\\.)*)",',
        re.MULTILINE,
    )
    by_anchor: dict[str, list[dict]] = {}
    for qid, anchor_id, question in pattern.findall(ts):
        by_anchor.setdefault(anchor_id, []).append({"id": qid, "question": question})
    return by_anchor


KNOWN = load_known_questions()

FIXTURE_VERSION = "1.0.0"
RECORDED_AT = "2026-07-25T00:00:00Z"


def result(
    text: str,
    *,
    sql: str | None = None,
    tables_used: list[str] | None = None,
    columns: list[str] | None = None,
    rows: list[list] | None = None,
    error: str | None = None,
) -> dict:
    return {
        "text": text,
        "sql": (
            {"command": sql, "confidence_score": 0.9, "tables_used": tables_used or []}
            if sql
            else None
        ),
        "table": (
            {"columns": columns, "rows": rows or [], "row_count": len(rows or []), "truncated": False}
            if columns
            else None
        ),
        "chart": None,
        "error": error,
    }


def fixture(
    anchor: str,
    fixture_id: str,
    prompt: str,
    match: list[str],
    scenario_state: str,
    results: list[dict],
    latency_ms: int = 1800,
) -> dict:
    return {
        "anchor": anchor,
        "fixture_version": FIXTURE_VERSION,
        "id": fixture_id,
        "latency_ms": latency_ms,
        "match": match,
        "prompt": prompt,
        "recorded_at": RECORDED_AT,
        "results": results,
        "scenario_state": scenario_state,
    }


def known_question_fixtures(anchor: str, extra_match: dict[str, list[str]], answers: dict[str, dict]) -> list[dict]:
    """One fixture per known_question id, prompt identical to the app suite."""
    out = []
    for q in KNOWN.get(anchor, []):
        qid = q["id"]
        answer = answers[qid]
        out.append(
            fixture(
                anchor,
                qid,
                q["question"],
                extra_match.get(qid, []),
                "any",
                [result(**answer)],
            )
        )
    return out


ANCHORS: dict[str, list[dict]] = {}


def register(anchor: str, fixtures: list[dict]) -> None:
    ANCHORS[anchor] = fixtures


# ---------------------------------------------------------------------------
# A1 Digital Journey Intelligence
# ---------------------------------------------------------------------------
a1_starters = [
    fixture(
        "a1",
        "starter_funnel_baseline",
        "Show the account-opening funnel by step and channel for the last 30 logical days.",
        ["funnel by channel", "sessions applications referrals", "account opening funnel"],
        "baseline",
        [
            result(
                "Across the last 30 logical days, digital channels started 8,400 sessions, 5,460 "
                "applications were submitted (65.0% completion), 819 were referred to manual review "
                "(15.0% referral rate), and 4,368 were approved. Organic and paid_search behave "
                "similarly; branch_referral has a smaller volume but a slightly higher completion rate.",
                sql=(
                    "SELECT channel, SUM(sessions_started) AS sessions_started, "
                    "SUM(applications_submitted) AS applications_submitted, "
                    "SUM(referred_to_review) AS referred_to_review, "
                    "SUM(applications_approved) AS applications_approved\n"
                    "FROM aa_digital_funnel\n"
                    "WHERE session_date > DATE_SUB((SELECT logical_time FROM demo_active_run WHERE singleton_id = 1), INTERVAL 30 DAY)\n"
                    "GROUP BY channel"
                ),
                tables_used=["aa_digital_funnel"],
                columns=["channel", "sessions_started", "applications_submitted", "referred_to_review", "applications_approved"],
                rows=[
                    ["organic", 3600, 2340, 351, 1872],
                    ["paid_search", 3200, 2080, 312, 1664],
                    ["branch_referral", 1600, 1040, 156, 832],
                ],
            )
        ],
    ),
    fixture(
        "a1",
        "starter_funnel_after",
        "Show the account-opening funnel by step and channel for the last 30 logical days.",
        ["funnel by channel", "sessions applications referrals", "account opening funnel"],
        "after_injection",
        [
            result(
                "The same 30-day funnel now includes the injected high_intent_promo cohort: 100 "
                "additional sessions, 80 additional applications, and 40 additional manual-review "
                "referrals landed in the digital channel, which is why digital's referral rate is "
                "visibly above its usual band this period. Approvals are unaffected because those "
                "referrals have not yet reached a human disposition.",
                sql=(
                    "SELECT channel, SUM(sessions_started) AS sessions_started, "
                    "SUM(applications_submitted) AS applications_submitted, "
                    "SUM(referred_to_review) AS referred_to_review, "
                    "SUM(applications_approved) AS applications_approved\n"
                    "FROM aa_digital_funnel\n"
                    "WHERE session_date > DATE_SUB((SELECT logical_time FROM demo_active_run WHERE singleton_id = 1), INTERVAL 30 DAY)\n"
                    "GROUP BY channel"
                ),
                tables_used=["aa_digital_funnel"],
                columns=["channel", "sessions_started", "applications_submitted", "referred_to_review", "applications_approved"],
                rows=[
                    ["organic", 3600, 2340, 351, 1872],
                    ["paid_search", 3300, 2160, 392, 1664],
                    ["branch_referral", 1600, 1040, 156, 832],
                ],
            )
        ],
    ),
    fixture(
        "a1",
        "starter_review_comparison",
        "Compare manual review with straight-through applications.",
        ["manual review vs straight through", "review path comparison"],
        "any",
        [
            result(
                "Straight-through applications approve at 88.0% with an average 4 minutes to decision. "
                "Manual review approves at 61.0% with an average 214 minutes to decision, which is the "
                "expected trade-off: review exists to catch the harder cases, at the cost of speed.",
                sql=(
                    "SELECT review_path, product_id, applications, approval_rate, avg_minutes_to_decision\n"
                    "FROM aa_digital_review_comparison\nORDER BY applications DESC"
                ),
                tables_used=["aa_digital_review_comparison"],
                columns=["review_path", "product_id", "applications", "approval_rate", "avg_minutes_to_decision"],
                rows=[
                    ["straight_through", "CHECKING", 4200, 0.88, 4],
                    ["manual_review", "CHECKING", 620, 0.61, 214],
                ],
            )
        ],
    ),
    fixture(
        "a1",
        "starter_cohort_driver",
        "Which high-intent cohort explains the largest conversion change?",
        ["cohort driving manual review", "highest referral cohort", "intent cohort ranking"],
        "any",
        [
            result(
                "high_intent_promo has the highest manual-review referral rate today at 50.0%, well "
                "above the other tracked cohorts, which sit between 10% and 18%. It is also the only "
                "cohort with scenario activity flagged in the current run.",
                sql=(
                    "SELECT intent_cohort, channel, sessions_started, submit_rate, referral_rate\n"
                    "FROM aa_digital_intent_cohort\nORDER BY referral_rate DESC LIMIT 5"
                ),
                tables_used=["aa_digital_intent_cohort"],
                columns=["intent_cohort", "channel", "sessions_started", "submit_rate", "referral_rate"],
                rows=[
                    ["high_intent_promo", "paid_search", 100, 0.80, 0.50],
                    ["price_sensitive", "organic", 340, 0.62, 0.18],
                    ["returning_visitor", "organic", 510, 0.71, 0.10],
                ],
            )
        ],
    ),
]
a1_answers = {
    "baseline_kpi": dict(
        text=(
            "Session-to-application completion is 65.0% over the last 30 logical days: 8,400 sessions "
            "started and 5,460 applications were submitted."
        ),
        sql="SELECT SUM(sessions_started) AS sessions_started, SUM(applications_submitted) AS applications_submitted FROM aa_digital_funnel",
        tables_used=["aa_digital_funnel"],
        columns=["sessions_started", "applications_submitted", "completion_rate"],
        rows=[[8400, 5460, 0.65]],
    ),
    "comparison": dict(
        text=(
            "Manual review approves at 61.0% versus 88.0% for straight-through applications, a 27-point "
            "gap that is consistent with review existing to catch the harder cases."
        ),
        sql="SELECT review_path, approval_rate FROM aa_digital_review_comparison",
        tables_used=["aa_digital_review_comparison"],
        columns=["review_path", "approval_rate"],
        rows=[["manual_review", 0.61], ["straight_through", 0.88]],
    ),
    "multi_table_drilldown": dict(
        text=(
            "high_intent_promo drives the largest share of manual-review referrals: 40 of its 80 "
            "submitted applications were referred, a 50.0% referral rate."
        ),
        sql="SELECT intent_cohort, referred_to_review, referral_rate FROM aa_digital_intent_cohort ORDER BY referral_rate DESC LIMIT 1",
        tables_used=["aa_digital_intent_cohort"],
        columns=["intent_cohort", "referred_to_review", "referral_rate"],
        rows=[["high_intent_promo", 40, 0.50]],
    ),
    "session_followup": dict(
        text=(
            "For high_intent_promo, the paid_search channel accounts for essentially all of the cohort's "
            "activity this period: 100 sessions, 80 applications, 40 referrals."
        ),
        sql="SELECT channel, sessions_started, applications_submitted, referred_to_review FROM aa_digital_intent_cohort WHERE intent_cohort = 'high_intent_promo'",
        tables_used=["aa_digital_intent_cohort"],
        columns=["channel", "sessions_started", "applications_submitted", "referred_to_review"],
        rows=[["paid_search", 100, 80, 40]],
    ),
    "ambiguous_term": dict(
        text=(
            "\"Best\" can mean the highest completion rate, the highest approval rate, or the lowest "
            "referral rate, and channels do not rank the same way on all three. Tell me which measure "
            "you mean and I will rank channels on it."
        ),
        sql="SELECT channel, SUM(applications_submitted)/SUM(sessions_started) AS completion_rate FROM aa_digital_funnel GROUP BY channel",
        tables_used=["aa_digital_funnel"],
        columns=["channel", "completion_rate"],
        rows=[["organic", 0.65], ["paid_search", 0.65], ["branch_referral", 0.65]],
    ),
    "unsupported_action": dict(
        text=(
            "I cannot approve applications. I have read-only access to account-opening activity and no "
            "ability to change a review outcome; approval and decline decisions stay with underwriting "
            "and manual review staff.\n\nI can show you the evidence instead: current backlog size, "
            "referral rate by cohort, and average minutes to decision. Ask for any of those."
        ),
    ),
    "no_data": dict(
        text=(
            "There is no digital-channel data for channel = 'branch' in this dataset: this anchor tracks "
            "organic, paid_search, and branch_referral. The filter returns no rows rather than a low "
            "value, and I have not substituted a nearby channel."
        ),
        sql="SELECT * FROM aa_digital_funnel WHERE channel = 'branch'",
        tables_used=["aa_digital_funnel"],
        columns=["channel", "sessions_started"],
        rows=[],
    ),
    "invalid_filter": dict(
        text=(
            "'not-a-date' is not a date, so I cannot filter session_date on it and I will not guess a "
            "period. session_date values are logical calendar days such as 2026-07-25. Give me a date or "
            "a relative period like the last 30 logical days."
        ),
        error="invalid_filter_value",
        columns=["session_date", "sessions_started"],
        rows=[],
    ),
}
register("a1", a1_starters + known_question_fixtures("a1", {}, a1_answers))


# ---------------------------------------------------------------------------
# A3 Trace the Loss (Fraud Strategy)
# ---------------------------------------------------------------------------
a3_starters = [
    fixture(
        "a3",
        "starter_loss_by_type_baseline",
        "Show confirmed fraud loss and false-positive rate by channel and fraud type.",
        ["confirmed loss by fraud type", "loss and false positive rate"],
        "baseline",
        [
            result(
                "Confirmed fraud loss over the run totals $184,200 across five fraud types. account_takeover "
                "on card_not_present carries the most loss at $61,400, with a false-positive rate of 22.0%.",
                sql=(
                    "SELECT channel, fraud_type, cases_total, confirmed_fraud_cases, confirmed_loss_usd, "
                    "false_positive_rate\nFROM aa_fraud_loss_summary\nORDER BY confirmed_loss_usd DESC"
                ),
                tables_used=["aa_fraud_loss_summary"],
                columns=["channel", "fraud_type", "cases_total", "confirmed_fraud_cases", "confirmed_loss_usd", "false_positive_rate"],
                rows=[
                    ["card_not_present", "account_takeover", 58, 22, 61400, 0.22],
                    ["ach", "synthetic_identity", 41, 15, 48900, 0.19],
                    ["card_not_present", "card_testing", 63, 18, 39800, 0.31],
                    ["wire", "authorized_push_payment", 24, 9, 34100, 0.12],
                ],
            )
        ],
    ),
    fixture(
        "a3",
        "starter_loss_by_type_after",
        "Show confirmed fraud loss and false-positive rate by channel and fraud type.",
        ["confirmed loss by fraud type", "loss and false positive rate"],
        "after_injection",
        [
            result(
                "Confirmed fraud loss now totals $186,700: the injected loss cluster added $2,500 in "
                "confirmed loss to account_takeover on card_not_present, which now leads the ranking by a "
                "wider margin, with a false-positive rate of 58.33% for the injected cohort specifically.",
                sql=(
                    "SELECT channel, fraud_type, cases_total, confirmed_fraud_cases, confirmed_loss_usd, "
                    "false_positive_rate\nFROM aa_fraud_loss_summary\nORDER BY confirmed_loss_usd DESC"
                ),
                tables_used=["aa_fraud_loss_summary"],
                columns=["channel", "fraud_type", "cases_total", "confirmed_fraud_cases", "confirmed_loss_usd", "false_positive_rate"],
                rows=[
                    ["card_not_present", "account_takeover", 70, 27, 63900, 0.24],
                    ["ach", "synthetic_identity", 41, 15, 48900, 0.19],
                    ["card_not_present", "card_testing", 63, 18, 39800, 0.31],
                    ["wire", "authorized_push_payment", 24, 9, 34100, 0.12],
                ],
            )
        ],
    ),
    fixture(
        "a3",
        "starter_segment_evidence",
        "For the highest-loss segment, compare device reuse, account age, merchant, and velocity.",
        ["device reuse account age merchant velocity", "segment evidence"],
        "any",
        [
            result(
                "The highest-loss segment (account_takeover / card_not_present) shows heavy device reuse: "
                "the median device has 4 prior alerts and the median account is 11 days old, both well "
                "below the book average, alongside repeat merchants in digital goods.",
                sql=(
                    "SELECT merchant_category, customer_risk_tier, account_age_days, device_risk_band, "
                    "device_alert_count\nFROM aa_fraud_segment_evidence\nWHERE case_id IN (SELECT case_id FROM aa_fraud_case_review "
                    "WHERE fraud_type = 'account_takeover' ORDER BY confirmed_loss_usd DESC LIMIT 20)"
                ),
                tables_used=["aa_fraud_segment_evidence", "aa_fraud_case_review"],
                columns=["merchant_category", "account_age_days", "device_risk_band", "device_alert_count"],
                rows=[
                    ["Digital Goods", 9, "high", 5],
                    ["Digital Goods", 14, "high", 3],
                    ["Electronics", 6, "medium", 4],
                ],
            )
        ],
    ),
    fixture(
        "a3",
        "starter_review_list",
        "List supporting cases for human investigator review.",
        ["cases for investigator review", "highest loss cases"],
        "any",
        [
            result(
                "Twelve open or recently-dispositioned cases are ranked below by confirmed loss, then "
                "alert score, for investigator review.",
                sql=(
                    "SELECT case_id, fraud_type, channel, score, human_disposition, confirmed_loss_usd\n"
                    "FROM aa_fraud_case_review\nORDER BY confirmed_loss_usd DESC, score DESC LIMIT 12"
                ),
                tables_used=["aa_fraud_case_review"],
                columns=["case_id", "fraud_type", "channel", "score", "human_disposition", "confirmed_loss_usd"],
                rows=[
                    ["CASE-00042", "account_takeover", "card_not_present", 0.91, "confirmed_fraud", 4200],
                    ["CASE-00058", "account_takeover", "card_not_present", 0.88, "open", 0],
                    ["CASE-00071", "synthetic_identity", "ach", 0.83, "legitimate", 0],
                ],
            )
        ],
    ),
]
a3_answers = {
    "baseline_kpi": dict(
        text="Confirmed fraud loss is $6,100 and the false-positive rate is 21.0% over the last 24 logical hours.",
        sql="SELECT SUM(confirmed_loss_usd) AS confirmed_loss, AVG(false_positive_rate) AS false_positive_rate FROM aa_fraud_loss_summary",
        tables_used=["aa_fraud_loss_summary"],
        columns=["confirmed_loss", "false_positive_rate"],
        rows=[[6100, 0.21]],
    ),
    "comparison": dict(
        text="account_takeover on card_not_present leads confirmed loss at $61,400 (33% of total), ahead of synthetic_identity on ach at $48,900 (27%).",
        sql="SELECT channel, fraud_type, confirmed_loss_usd FROM aa_fraud_loss_summary ORDER BY confirmed_loss_usd DESC",
        tables_used=["aa_fraud_loss_summary"],
        columns=["channel", "fraud_type", "confirmed_loss_usd"],
        rows=[["card_not_present", "account_takeover", 61400], ["ach", "synthetic_identity", 48900]],
    ),
    "multi_table_drilldown": dict(
        text="The highest-loss fraud type is account_takeover. Its top three cases by loss are CASE-00042 ($4,200, device reused on 5 prior alerts), CASE-00058 ($3,900, device reused on 4 prior alerts), and CASE-00061 ($3,600, new device).",
        sql="SELECT r.case_id, r.confirmed_loss_usd, e.device_alert_count FROM aa_fraud_case_review r JOIN aa_fraud_segment_evidence e ON e.case_id = r.case_id WHERE r.fraud_type = 'account_takeover' ORDER BY r.confirmed_loss_usd DESC LIMIT 3",
        tables_used=["aa_fraud_case_review", "aa_fraud_segment_evidence"],
        columns=["case_id", "confirmed_loss_usd", "device_alert_count"],
        rows=[["CASE-00042", 4200, 5], ["CASE-00058", 3900, 4], ["CASE-00061", 3600, 0]],
    ),
    "session_followup": dict(
        text="Of those, CASE-00058 is still open awaiting investigator disposition; CASE-00042 and CASE-00061 have already been dispositioned.",
        sql="SELECT case_id, human_disposition FROM aa_fraud_case_review WHERE case_id IN ('CASE-00042','CASE-00058','CASE-00061')",
        tables_used=["aa_fraud_case_review"],
        columns=["case_id", "human_disposition"],
        rows=[["CASE-00042", "confirmed_fraud"], ["CASE-00058", "open"], ["CASE-00061", "confirmed_fraud"]],
    ),
    "ambiguous_term": dict(
        text=(
            "\"Worst\" could mean the most confirmed loss, the most cases, or the highest false-positive "
            "rate, and fraud types do not rank the same way on each. Tell me which measure you mean, or "
            "here is loss by fraud type so you can compare."
        ),
        sql="SELECT fraud_type, confirmed_loss_usd, false_positive_rate FROM aa_fraud_loss_summary ORDER BY confirmed_loss_usd DESC",
        tables_used=["aa_fraud_loss_summary"],
        columns=["fraud_type", "confirmed_loss_usd", "false_positive_rate"],
        rows=[["account_takeover", 61400, 0.22], ["synthetic_identity", 48900, 0.19]],
    ),
    "unsupported_action": dict(
        text=(
            "I cannot close cases or determine that fraud occurred. I have read-only access to case and "
            "alert data, and case disposition stays with fraud investigators.\n\nI can show you the "
            "evidence instead: device reuse, account age, and velocity for these cases. Ask and I will "
            "pull it."
        ),
    ),
    "no_data": dict(
        text=(
            "There is no data for fraud_type = 'INSURANCE_CLAIM' in this dataset. The fraud types present "
            "are account_takeover, synthetic_identity, card_testing, and authorized_push_payment, so the "
            "filter returns no rows rather than a low value."
        ),
        sql="SELECT * FROM aa_fraud_loss_summary WHERE fraud_type = 'INSURANCE_CLAIM'",
        tables_used=["aa_fraud_loss_summary"],
        columns=["fraud_type", "confirmed_loss_usd"],
        rows=[],
    ),
    "invalid_filter": dict(
        text=(
            "'not-a-date' is not a date, so I cannot filter opened_date on it and I will not guess a "
            "period. opened_date values are logical calendar days such as 2026-07-25."
        ),
        error="invalid_filter_value",
        columns=["opened_date", "confirmed_loss_usd"],
        rows=[],
    ),
}
register("a3", a3_starters + known_question_fixtures("a3", {}, a3_answers))


# ---------------------------------------------------------------------------
# A4 Alert-to-Evidence (AML Operations)
# ---------------------------------------------------------------------------
a4_starters = [
    fixture(
        "a4",
        "starter_backlog_baseline",
        "Show open AML alerts by age, rule, risk band, and queue.",
        ["open alerts by age rule risk band queue", "aml backlog"],
        "baseline",
        [
            result(
                "There are 214 open AML alerts, 38 high-priority, and 26 at risk of an SLA breach in "
                "the next 24 hours. The correspondent_banking queue carries the largest backlog at 61 "
                "open alerts, averaging 34 hours old.",
                sql=(
                    "SELECT rule_id, risk_band, assigned_queue, priority, open_alert_count, "
                    "high_priority_count, sla_risk_count, avg_age_hours\nFROM aa_aml_backlog\n"
                    "ORDER BY sla_risk_count DESC, open_alert_count DESC"
                ),
                tables_used=["aa_aml_backlog"],
                columns=["rule_id", "risk_band", "assigned_queue", "open_alert_count", "sla_risk_count", "avg_age_hours"],
                rows=[
                    ["CORRESPONDENT_EXPOSURE", "high", "correspondent_banking", 61, 9, 34],
                    ["STRUCTURING_PATTERN", "medium", "retail_review", 88, 11, 22],
                    ["VELOCITY_SPIKE", "medium", "retail_review", 65, 6, 18],
                ],
            )
        ],
    ),
    fixture(
        "a4",
        "starter_backlog_after",
        "Show open AML alerts by age, rule, risk band, and queue.",
        ["open alerts by age rule risk band queue", "aml backlog"],
        "after_injection",
        [
            result(
                "Open alerts are now 215, with 39 high-priority and 27 at risk of an SLA breach: the "
                "injected correspondent-banking alert added one open, high-priority, SLA-risk alert to "
                "that queue, and 25 new evidence items were attached to it.",
                sql=(
                    "SELECT rule_id, risk_band, assigned_queue, priority, open_alert_count, "
                    "high_priority_count, sla_risk_count, avg_age_hours\nFROM aa_aml_backlog\n"
                    "ORDER BY sla_risk_count DESC, open_alert_count DESC"
                ),
                tables_used=["aa_aml_backlog"],
                columns=["rule_id", "risk_band", "assigned_queue", "open_alert_count", "sla_risk_count", "avg_age_hours"],
                rows=[
                    ["CORRESPONDENT_EXPOSURE", "high", "correspondent_banking", 62, 10, 33],
                    ["STRUCTURING_PATTERN", "medium", "retail_review", 88, 11, 22],
                    ["VELOCITY_SPIKE", "medium", "retail_review", 65, 6, 18],
                ],
            )
        ],
    ),
    fixture(
        "a4",
        "starter_entity_activity",
        "For the selected cohort, summarize transaction value, counterparties, geographies, and prior alerts.",
        ["transaction value counterparties geographies prior alerts", "entity activity summary"],
        "any",
        [
            result(
                "Account ACCT-88213 has $412,000 in linked transactions across 9 distinct counterparties "
                "and 4 geographies in the evidence window, with 2 prior AML cases. That combination of "
                "counterparty and geography spread is why the alert is in the correspondent_banking queue.",
                sql=(
                    "SELECT account_id, linked_transaction_amount_usd, distinct_counterparties, "
                    "distinct_geographies, prior_case_count\nFROM aa_aml_entity_activity\n"
                    "WHERE account_id = 'ACCT-88213'"
                ),
                tables_used=["aa_aml_entity_activity"],
                columns=["account_id", "linked_transaction_amount_usd", "distinct_counterparties", "distinct_geographies", "prior_case_count"],
                rows=[["ACCT-88213", 412000, 9, 4, 2]],
            )
        ],
    ),
    fixture(
        "a4",
        "starter_missing_evidence",
        "Identify missing evidence without recommending a disposition.",
        ["missing evidence", "incomplete evidence items"],
        "any",
        [
            result(
                "For alert ALERT-19042, 2 of 7 evidence items are marked incomplete: the counterparty KYC "
                "profile and one prior-case cross-reference. No disposition is implied by this list.",
                sql=(
                    "SELECT source_type, fact_text, completeness_status\nFROM aa_aml_alert_evidence\n"
                    "WHERE alert_id = 'ALERT-19042' AND completeness_status <> 'complete'"
                ),
                tables_used=["aa_aml_alert_evidence"],
                columns=["source_type", "fact_text", "completeness_status"],
                rows=[
                    ["kyc_profile", "Counterparty KYC profile not on file", "incomplete"],
                    ["prior_case", "Prior-case cross-reference pending", "incomplete"],
                ],
            )
        ],
    ),
]
a4_answers = {
    "baseline_kpi": dict(
        text="214 AML alerts are open, and 26 are at risk of an SLA breach in the next 24 hours.",
        sql="SELECT COUNT(*) AS open_alert_count, SUM(CASE WHEN sla_due_at <= DATE_ADD(logical_time, INTERVAL 24 HOUR) THEN 1 ELSE 0 END) AS sla_risk_count FROM aml_alert",
        tables_used=["aa_aml_backlog"],
        columns=["open_alert_count", "sla_risk_count"],
        rows=[[214, 26]],
    ),
    "comparison": dict(
        text="retail_review carries the largest backlog by rule/risk-band split: STRUCTURING_PATTERN (medium risk) has 88 open alerts, VELOCITY_SPIKE (medium risk) has 65, and CORRESPONDENT_EXPOSURE (high risk) has 61.",
        sql="SELECT rule_id, risk_band, open_alert_count FROM aa_aml_backlog ORDER BY open_alert_count DESC",
        tables_used=["aa_aml_backlog"],
        columns=["rule_id", "risk_band", "open_alert_count"],
        rows=[["STRUCTURING_PATTERN", "medium", 88], ["VELOCITY_SPIKE", "medium", 65], ["CORRESPONDENT_EXPOSURE", "high", 61]],
    ),
    "multi_table_drilldown": dict(
        text="Account ACCT-88213 has the highest linked transaction value at $412,000, spanning 9 counterparties and 4 geographies, with 2 prior cases.",
        sql="SELECT account_id, linked_transaction_amount_usd, distinct_counterparties, distinct_geographies FROM aa_aml_entity_activity ORDER BY linked_transaction_amount_usd DESC LIMIT 1",
        tables_used=["aa_aml_entity_activity"],
        columns=["account_id", "linked_transaction_amount_usd", "distinct_counterparties", "distinct_geographies"],
        rows=[["ACCT-88213", 412000, 9, 4]],
    ),
    "session_followup": dict(
        text="Restricting to the correspondent_banking queue: 62 open alerts, 10 at SLA risk, averaging 33 hours old.",
        sql="SELECT open_alert_count, sla_risk_count, avg_age_hours FROM aa_aml_backlog WHERE assigned_queue = 'correspondent_banking'",
        tables_used=["aa_aml_backlog"],
        columns=["open_alert_count", "sla_risk_count", "avg_age_hours"],
        rows=[[62, 10, 33]],
    ),
    "ambiguous_term": dict(
        text=(
            "\"Worst\" could mean the largest backlog, the oldest average age, or the most SLA risk, and "
            "queues do not rank the same way on each. Here is all three so you can choose, or tell me "
            "which one matters."
        ),
        sql="SELECT assigned_queue, open_alert_count, avg_age_hours, sla_risk_count FROM aa_aml_backlog",
        tables_used=["aa_aml_backlog"],
        columns=["assigned_queue", "open_alert_count", "avg_age_hours", "sla_risk_count"],
        rows=[["correspondent_banking", 62, 33, 10], ["retail_review", 153, 20, 17]],
    ),
    "unsupported_action": dict(
        text=(
            "I cannot close alerts or file a SAR. I have read-only access to alert and evidence data, and "
            "disposition and regulatory filing stay with AML investigators.\n\nI can show you the backlog "
            "and evidence completeness for that queue instead."
        ),
    ),
    "no_data": dict(
        text=(
            "There is no data for rule = 'CRYPTO_MIXER_EXPOSURE' in this dataset. The rules present are "
            "CORRESPONDENT_EXPOSURE, STRUCTURING_PATTERN, and VELOCITY_SPIKE, so the filter returns no "
            "rows rather than a low value."
        ),
        sql="SELECT * FROM aa_aml_backlog WHERE rule_id = 'CRYPTO_MIXER_EXPOSURE'",
        tables_used=["aa_aml_backlog"],
        columns=["rule_id", "open_alert_count"],
        rows=[],
    ),
    "invalid_filter": dict(
        text=(
            "'not-a-date' is not a timestamp, so I cannot filter created_at on it and I will not guess a "
            "period. created_at values are logical timestamps such as 2026-07-25 08:00:00."
        ),
        error="invalid_filter_value",
        columns=["created_at", "open_alert_count"],
        rows=[],
    ),
}
register("a4", a4_starters + known_question_fixtures("a4", {}, a4_answers))


# ---------------------------------------------------------------------------
# A5 Dispute Resolution Lens (Disputes Operations)
# ---------------------------------------------------------------------------
a5_starters = [
    fixture(
        "a5",
        "starter_sla_risk_baseline",
        "Show disputes at risk of SLA breach in the next 24 logical hours.",
        ["disputes at risk of sla breach", "sla risk queue"],
        "baseline",
        [
            result(
                "312 disputes are open and 41 are at risk of an SLA breach in the next 24 hours, "
                "totalling $186,400 of disputed value at risk. The DUPLICATE_CHARGE reason code in the "
                "core_ops queue carries the most risk at 14 disputes.",
                sql=(
                    "SELECT queue_id, reason_code, priority, open_dispute_count, sla_risk_count, "
                    "sla_risk_amount_total\nFROM aa_dispute_sla_risk\n"
                    "ORDER BY sla_risk_count DESC, sla_risk_amount_total DESC"
                ),
                tables_used=["aa_dispute_sla_risk"],
                columns=["queue_id", "reason_code", "open_dispute_count", "sla_risk_count", "sla_risk_amount_total"],
                rows=[
                    ["core_ops", "DUPLICATE_CHARGE", 58, 14, 41200],
                    ["core_ops", "SERVICE_NOT_RECEIVED", 44, 9, 28600],
                    ["escalations", "FRIENDLY_FRAUD", 22, 6, 19800],
                ],
            )
        ],
    ),
    fixture(
        "a5",
        "starter_sla_risk_after",
        "Show disputes at risk of SLA breach in the next 24 logical hours.",
        ["disputes at risk of sla breach", "sla risk queue"],
        "after_injection",
        [
            result(
                "Open disputes jumped to 332 and SLA-risk count to 53 after the injected merchant-outage "
                "surge: 20 new disputes landed with reason code MERCHANT_OUTAGE, of which 12 are already "
                "at SLA risk, which is now the leading reason code in the ranking.",
                sql=(
                    "SELECT queue_id, reason_code, priority, open_dispute_count, sla_risk_count, "
                    "sla_risk_amount_total\nFROM aa_dispute_sla_risk\n"
                    "ORDER BY sla_risk_count DESC, sla_risk_amount_total DESC"
                ),
                tables_used=["aa_dispute_sla_risk"],
                columns=["queue_id", "reason_code", "open_dispute_count", "sla_risk_count", "sla_risk_amount_total"],
                rows=[
                    ["core_ops", "MERCHANT_OUTAGE", 20, 12, 15800],
                    ["core_ops", "DUPLICATE_CHARGE", 58, 14, 41200],
                    ["core_ops", "SERVICE_NOT_RECEIVED", 44, 9, 28600],
                ],
            )
        ],
    ),
    fixture(
        "a5",
        "starter_queue_baseline_compare",
        "What explains the largest at-risk queue compared with the prior 30 days?",
        ["largest at risk queue prior 30 days", "queue driver trend"],
        "any",
        [
            result(
                "core_ops is the largest at-risk queue and its daily dispute volume has been flat at "
                "roughly 12-15 disputes per day over the prior 30 days, so today's SLA risk is driven "
                "by the MERCHANT_OUTAGE reason code rather than a change in overall queue volume.",
                sql=(
                    "SELECT opened_date, reason_code, dispute_count\nFROM aa_dispute_queue_driver\n"
                    "WHERE queue_id = 'core_ops'\nORDER BY opened_date DESC LIMIT 10"
                ),
                tables_used=["aa_dispute_queue_driver"],
                columns=["opened_date", "reason_code", "dispute_count"],
                rows=[
                    ["2026-07-25", "MERCHANT_OUTAGE", 20],
                    ["2026-07-24", "DUPLICATE_CHARGE", 13],
                    ["2026-07-23", "DUPLICATE_CHARGE", 12],
                ],
            )
        ],
    ),
    fixture(
        "a5",
        "starter_dispute_timeline",
        "Show the timeline for the selected dispute.",
        ["dispute timeline", "case events customer contact provisional credit"],
        "any",
        [
            result(
                "Dispute DSP-04471 was opened, the customer was contacted once for supporting evidence, "
                "and a provisional credit of $86.40 was issued while the case remains open.",
                sql=(
                    "SELECT event_time, timeline_type, event_type, actor_type, amount\n"
                    "FROM aa_dispute_timeline\nWHERE dispute_id = 'DSP-04471'\nORDER BY event_time"
                ),
                tables_used=["aa_dispute_timeline"],
                columns=["event_time", "timeline_type", "event_type", "amount"],
                rows=[
                    ["2026-07-24 09:10:00", "case_event", "opened", None],
                    ["2026-07-24 11:00:00", "customer_contact", "evidence_requested", None],
                    ["2026-07-24 14:20:00", "provisional_credit", "credited", 86.4],
                ],
            )
        ],
    ),
]
a5_answers = {
    "baseline_kpi": dict(
        text="312 disputes are open, and 41 are at risk of an SLA breach in the next 24 logical hours.",
        sql="SELECT SUM(open_dispute_count) AS open_dispute_count, SUM(sla_risk_count) AS sla_risk_count FROM aa_dispute_sla_risk",
        tables_used=["aa_dispute_sla_risk"],
        columns=["open_dispute_count", "sla_risk_count"],
        rows=[[312, 41]],
    ),
    "comparison": dict(
        text="The at-risk queue depth today (53 disputes) is 12 above the 30-day average of 41, driven by the injected merchant-outage surge.",
        sql="SELECT SUM(sla_risk_count) AS sla_risk_count FROM aa_dispute_sla_risk",
        tables_used=["aa_dispute_sla_risk"],
        columns=["current_sla_risk_count", "baseline_avg_sla_risk_count", "delta"],
        rows=[[53, 41, 12]],
    ),
    "multi_table_drilldown": dict(
        text="core_ops has the most SLA risk. Its at-risk disputes break down as MERCHANT_OUTAGE (12), DUPLICATE_CHARGE (14), and SERVICE_NOT_RECEIVED (9).",
        sql="SELECT reason_code, sla_risk_count FROM aa_dispute_sla_risk WHERE queue_id = 'core_ops' ORDER BY sla_risk_count DESC",
        tables_used=["aa_dispute_sla_risk"],
        columns=["reason_code", "sla_risk_count"],
        rows=[["DUPLICATE_CHARGE", 14], ["MERCHANT_OUTAGE", 12], ["SERVICE_NOT_RECEIVED", 9]],
    ),
    "session_followup": dict(
        text="The largest MERCHANT_OUTAGE dispute is DSP-04471 at $612.00, opened 2026-07-24 09:10, currently in core_ops with a provisional credit already issued.",
        sql="SELECT dispute_id, disputed_amount FROM dispute_case WHERE reason_code = 'MERCHANT_OUTAGE' ORDER BY disputed_amount DESC LIMIT 1",
        tables_used=["aa_dispute_timeline"],
        columns=["dispute_id", "disputed_amount"],
        rows=[["DSP-04471", 612.0]],
    ),
    "ambiguous_term": dict(
        text=(
            "\"Falling behind\" could mean the most disputes at SLA risk, or the most disputed value at "
            "risk, and queues rank differently on each. core_ops leads on count; escalations leads on "
            "average value per dispute. Tell me which you mean."
        ),
        sql="SELECT queue_id, sla_risk_count, sla_risk_amount_total FROM aa_dispute_sla_risk",
        tables_used=["aa_dispute_sla_risk"],
        columns=["queue_id", "sla_risk_count", "sla_risk_amount_total"],
        rows=[["core_ops", 35, 85600], ["escalations", 6, 19800]],
    ),
    "unsupported_action": dict(
        text=(
            "I cannot issue provisional credit or adjudicate a dispute. I have read-only access to case "
            "and timeline data, and adjudication and credit decisions stay with authorised agents.\n\n"
            "I can show you the at-risk list and each case's timeline instead."
        ),
    ),
    "no_data": dict(
        text=(
            "There is no data for reason_code = 'COUNTERFEIT_GOODS' in this dataset. Reason codes present "
            "include DUPLICATE_CHARGE, SERVICE_NOT_RECEIVED, FRIENDLY_FRAUD, and MERCHANT_OUTAGE, so the "
            "filter returns no rows rather than a low value."
        ),
        sql="SELECT * FROM aa_dispute_sla_risk WHERE reason_code = 'COUNTERFEIT_GOODS'",
        tables_used=["aa_dispute_sla_risk"],
        columns=["reason_code", "open_dispute_count"],
        rows=[],
    ),
    "invalid_filter": dict(
        text=(
            "'not-a-date' is not a timestamp, so I cannot filter opened_at on it and I will not guess a "
            "period. opened_at values are logical timestamps such as 2026-07-25 08:00:00."
        ),
        error="invalid_filter_value",
        columns=["opened_at", "open_dispute_count"],
        rows=[],
    ),
}
register("a5", a5_starters + known_question_fixtures("a5", {}, a5_answers))


# ---------------------------------------------------------------------------
# A6 Liquidity Command Center
# ---------------------------------------------------------------------------
a6_starters = [
    fixture(
        "a6",
        "starter_positions_baseline",
        "Show current cash position, expected settlements, queued payments, and available liquidity by entity and currency.",
        ["cash position expected settlements queued payments available liquidity"],
        "baseline",
        [
            result(
                "Across every entity and currency, available 24-hour liquidity totals USD 412 million, "
                "against USD 58 million of queued outbound payments. NorthAm Treasury Co. in USD holds "
                "the largest single position at USD 210 million.",
                sql=(
                    "SELECT entity_name, currency, available_balance_usd, expected_inbound_settlements_usd, "
                    "expected_outbound_settlements_usd, queued_payments_usd, available_liquidity_24h_usd\n"
                    "FROM aa_liquidity_position\nORDER BY available_liquidity_24h_usd ASC"
                ),
                tables_used=["aa_liquidity_position"],
                columns=["entity_name", "currency", "available_balance_usd", "queued_payments_usd", "available_liquidity_24h_usd"],
                rows=[
                    ["EMEA Funding Ltd.", "EUR", 96000000, 21000000, 88000000],
                    ["APAC Settlement Pte.", "SGD", 61000000, 9000000, 62000000],
                    ["NorthAm Treasury Co.", "USD", 210000000, 28000000, 262000000],
                ],
            )
        ],
    ),
    fixture(
        "a6",
        "starter_positions_after",
        "Show current cash position, expected settlements, queued payments, and available liquidity by entity and currency.",
        ["cash position expected settlements queued payments available liquidity"],
        "after_injection",
        [
            result(
                "Available 24-hour liquidity falls to USD 387 million after the injected settlement "
                "delay: EMEA Funding Ltd.'s expected inbound settlement was delayed by USD 25 million, "
                "which now shows as settlement-at-risk in the next funding window rather than as "
                "available liquidity.",
                sql=(
                    "SELECT entity_name, currency, available_balance_usd, expected_inbound_settlements_usd, "
                    "expected_outbound_settlements_usd, queued_payments_usd, available_liquidity_24h_usd\n"
                    "FROM aa_liquidity_position\nORDER BY available_liquidity_24h_usd ASC"
                ),
                tables_used=["aa_liquidity_position"],
                columns=["entity_name", "currency", "available_balance_usd", "queued_payments_usd", "available_liquidity_24h_usd"],
                rows=[
                    ["EMEA Funding Ltd.", "EUR", 96000000, 21000000, 63000000],
                    ["APAC Settlement Pte.", "SGD", 61000000, 9000000, 62000000],
                    ["NorthAm Treasury Co.", "USD", 210000000, 28000000, 262000000],
                ],
            )
        ],
    ),
    fixture(
        "a6",
        "starter_variance_drivers",
        "Rank the drivers of the largest forecast variance.",
        ["forecast variance drivers", "largest variance"],
        "any",
        [
            result(
                "EMEA Funding Ltd. in EUR shows the largest forecast variance this period at "
                "USD -25.4 million (actual below forecast), driven almost entirely by the delayed "
                "inbound settlement. Every other entity is within USD 1.5 million of forecast.",
                sql=(
                    "SELECT entity_id, currency, forecast_net_flow_usd, actual_net_flow_usd, "
                    "forecast_variance_usd\nFROM aa_liquidity_variance\nORDER BY ABS(forecast_variance_usd) DESC LIMIT 5"
                ),
                tables_used=["aa_liquidity_variance"],
                columns=["entity_id", "currency", "forecast_variance_usd"],
                rows=[["ENT-EMEA", "EUR", -25400000], ["ENT-NA", "USD", 900000], ["ENT-APAC", "SGD", -400000]],
            )
        ],
    ),
    fixture(
        "a6",
        "starter_funding_window",
        "Which queued payments fall inside the next funding window?",
        ["queued payments next funding window", "due in 24 hours"],
        "any",
        [
            result(
                "18 queued payments totalling USD 41.2 million are due in the next 24-hour funding "
                "window, the soonest due in 45 minutes.",
                sql=(
                    "SELECT queued_payment_id, entity_name, currency, amount_usd, due_at, minutes_until_due\n"
                    "FROM aa_funding_window\nWHERE in_next_funding_window = 1\nORDER BY minutes_until_due ASC LIMIT 20"
                ),
                tables_used=["aa_funding_window"],
                columns=["queued_payment_id", "entity_name", "amount_usd", "minutes_until_due"],
                rows=[
                    ["QP-88110", "NorthAm Treasury Co.", 4200000, 45],
                    ["QP-88117", "EMEA Funding Ltd.", 6100000, 210],
                ],
            )
        ],
    ),
]
a6_answers = {
    "baseline_kpi": dict(
        text="Available 24-hour liquidity across every entity and currency is USD 387 million.",
        sql="SELECT SUM(available_liquidity_24h_usd) AS available_liquidity_24h_usd FROM aa_liquidity_position",
        tables_used=["aa_liquidity_position"],
        columns=["available_liquidity_24h_usd"],
        rows=[[387000000]],
    ),
    "comparison": dict(
        text="Net expected settlement is USD -6.1 million against a forecast of USD 19.3 million, a USD 25.4 million unfavourable variance driven by the delayed EMEA settlement.",
        sql="SELECT SUM(forecast_net_flow_usd) AS forecast, SUM(actual_net_flow_usd) AS actual FROM aa_liquidity_variance",
        tables_used=["aa_liquidity_variance"],
        columns=["forecast_net_flow_usd", "actual_net_flow_usd", "variance_usd"],
        rows=[[19300000, -6100000, -25400000]],
    ),
    "multi_table_drilldown": dict(
        text="EMEA Funding Ltd. has the tightest position. It has 6 queued payments due in the next funding window totalling USD 14.8 million.",
        sql="SELECT queued_payment_id, amount_usd, due_at FROM aa_funding_window WHERE entity_id = 'ENT-EMEA' ORDER BY minutes_until_due ASC",
        tables_used=["aa_liquidity_position", "aa_funding_window"],
        columns=["queued_payment_id", "amount_usd", "due_at"],
        rows=[["QP-88117", 6100000, "2026-07-25 12:30:00"], ["QP-88121", 3900000, "2026-07-25 15:00:00"]],
    ),
    "session_followup": dict(
        text="Filtered to EUR: 2 queued payments totalling USD 10.0 million fall in the next funding window.",
        sql="SELECT queued_payment_id, amount_usd FROM aa_funding_window WHERE entity_id = 'ENT-EMEA' AND currency = 'EUR'",
        tables_used=["aa_funding_window"],
        columns=["queued_payment_id", "amount_usd"],
        rows=[["QP-88117", 6100000], ["QP-88121", 3900000]],
    ),
    "ambiguous_term": dict(
        text=(
            "\"Tightest\" could mean the lowest available liquidity or the largest negative net "
            "settlement, and entities do not rank the same way on each. EMEA Funding Ltd. is tightest on "
            "both today, but tell me which measure you want and I will rank on it."
        ),
        sql="SELECT entity_name, available_liquidity_24h_usd FROM aa_liquidity_position ORDER BY available_liquidity_24h_usd ASC",
        tables_used=["aa_liquidity_position"],
        columns=["entity_name", "available_liquidity_24h_usd"],
        rows=[["EMEA Funding Ltd.", 63000000], ["APAC Settlement Pte.", 62000000]],
    ),
    "unsupported_action": dict(
        text=(
            "I cannot release the queued payment or move funds. I have read-only access to position and "
            "forecast data, and release and transfer decisions stay with treasury.\n\nI can show you the "
            "position and funding window driving this decision instead."
        ),
    ),
    "no_data": dict(
        text=(
            "There is no liquidity position data for currency = 'JPY' in this dataset. The currencies "
            "present are USD, EUR, and SGD, so the filter returns no rows rather than a low value."
        ),
        sql="SELECT * FROM aa_liquidity_position WHERE currency = 'JPY'",
        tables_used=["aa_liquidity_position"],
        columns=["currency", "available_liquidity_24h_usd"],
        rows=[],
    ),
    "invalid_filter": dict(
        text=(
            "'not-a-date' is not a timestamp, so I cannot filter as_of_time on it and I will not guess a "
            "period. as_of_time values are logical timestamps such as 2026-07-25 08:00:00."
        ),
        error="invalid_filter_value",
        columns=["as_of_time", "available_balance_usd"],
        rows=[],
    ),
}
register("a6", a6_starters + known_question_fixtures("a6", {}, a6_answers))


# ---------------------------------------------------------------------------
# A7 Credit Risk Pulse
# ---------------------------------------------------------------------------
a7_starters = [
    fixture(
        "a7",
        "starter_operations_baseline",
        "Show application volume, manual-review rate, and time to decision by product and channel.",
        ["application volume manual review rate time to decision"],
        "baseline",
        [
            result(
                "Over the last 30 logical days, 1,860 applications were submitted, 22.0% referred to "
                "manual review, averaging 14.2 hours to decision. AUTO_LOAN via the broker channel has "
                "the highest review rate at 34.0%.",
                sql=(
                    "SELECT product_name, channel, application_count, manual_review_rate, "
                    "avg_hours_to_decision, requested_amount_total\nFROM aa_credit_operations\n"
                    "WHERE submitted_date > DATE_SUB((SELECT logical_time FROM demo_active_run WHERE singleton_id = 1), INTERVAL 30 DAY)"
                ),
                tables_used=["aa_credit_operations"],
                columns=["product_name", "channel", "application_count", "manual_review_rate", "avg_hours_to_decision"],
                rows=[
                    ["Auto Loan", "broker", 420, 0.34, 19.1],
                    ["Credit Card", "digital", 980, 0.15, 6.4],
                    ["Personal Line", "branch", 460, 0.24, 21.8],
                ],
            )
        ],
    ),
    fixture(
        "a7",
        "starter_operations_after",
        "Show application volume, manual-review rate, and time to decision by product and channel.",
        ["application volume manual review rate time to decision"],
        "after_injection",
        [
            result(
                "Application volume is now 1,861 after the injected Transportation/CA application, "
                "requesting USD 5 million. It has not materially moved the manual-review rate or "
                "average hours to decision because it is a single pending application.",
                sql=(
                    "SELECT product_name, channel, application_count, manual_review_rate, "
                    "avg_hours_to_decision, requested_amount_total\nFROM aa_credit_operations\n"
                    "WHERE submitted_date > DATE_SUB((SELECT logical_time FROM demo_active_run WHERE singleton_id = 1), INTERVAL 30 DAY)"
                ),
                tables_used=["aa_credit_operations"],
                columns=["product_name", "channel", "application_count", "manual_review_rate", "avg_hours_to_decision"],
                rows=[
                    ["Auto Loan", "broker", 421, 0.34, 19.1],
                    ["Credit Card", "digital", 980, 0.15, 6.4],
                    ["Personal Line", "branch", 460, 0.24, 21.8],
                ],
            )
        ],
    ),
    fixture(
        "a7",
        "starter_application_evidence",
        "Summarize submitted evidence and missing items for the selected application.",
        ["submitted evidence missing items application"],
        "any",
        [
            result(
                "Application APP-70231 has 6 evidence items on file; the bank-statement verification is "
                "still unverified. No decision is implied by this summary.",
                sql=(
                    "SELECT source_type, metric_name, metric_value, verification_status\n"
                    "FROM aa_credit_application_evidence\nWHERE application_id = 'APP-70231'"
                ),
                tables_used=["aa_credit_application_evidence"],
                columns=["source_type", "metric_name", "metric_value", "verification_status"],
                rows=[
                    ["credit_bureau", "credit_score", 712, "verified"],
                    ["income_statement", "debt_to_income", 0.34, "verified"],
                    ["bank_statement", "avg_balance", 18400, "unverified"],
                ],
            )
        ],
    ),
    fixture(
        "a7",
        "starter_pending_concentration",
        "Compare the pending request with current portfolio concentration without making a decision.",
        ["pending request portfolio concentration", "pro forma concentration"],
        "any",
        [
            result(
                "Booked Transportation/CA concentration is 20.00% of the portfolio today. If the pending "
                "USD 5 million application booked at its requested amount, illustrative pro forma "
                "concentration would move to 23.81%. Booked exposure has not changed and this is not a "
                "forecast of what will book.",
                sql=(
                    "SELECT industry_code, geography_id, concentration_share, pending_amount, "
                    "pro_forma_concentration_share\nFROM aa_portfolio_concentration\n"
                    "WHERE industry_code = 'Transportation' AND geography_id = 'CA'"
                ),
                tables_used=["aa_portfolio_concentration"],
                columns=["industry_code", "geography_id", "concentration_share", "pro_forma_concentration_share"],
                rows=[["Transportation", "CA", 0.20, 0.2381]],
            )
        ],
    ),
]
a7_answers = {
    "baseline_kpi": dict(
        text="Application volume is 1,861 over the last 30 logical days, with a 22.0% manual-review rate.",
        sql="SELECT SUM(application_count) AS application_count, SUM(manual_review_count)/SUM(application_count) AS manual_review_rate FROM aa_credit_operations",
        tables_used=["aa_credit_operations"],
        columns=["application_count", "manual_review_rate"],
        rows=[[1861, 0.22]],
    ),
    "comparison": dict(
        text="Auto Loan via broker averages 19.1 hours to decision; Credit Card via digital averages 6.4 hours; Personal Line via branch averages 21.8 hours.",
        sql="SELECT product_name, channel, avg_hours_to_decision FROM aa_credit_operations",
        tables_used=["aa_credit_operations"],
        columns=["product_name", "channel", "avg_hours_to_decision"],
        rows=[["Auto Loan", "broker", 19.1], ["Credit Card", "digital", 6.4], ["Personal Line", "branch", 21.8]],
    ),
    "multi_table_drilldown": dict(
        text="Application APP-70231 (pending) has verified credit-bureau and income evidence, but its bank-statement verification is still unverified.",
        sql="SELECT source_type, verification_status FROM aa_credit_application_evidence WHERE application_id = 'APP-70231'",
        tables_used=["aa_credit_application_evidence"],
        columns=["source_type", "verification_status"],
        rows=[["credit_bureau", "verified"], ["income_statement", "verified"], ["bank_statement", "unverified"]],
    ),
    "session_followup": dict(
        text="Compared with Transportation/CA portfolio concentration: booked is 20.00%; illustrative pro forma including this pending request is 23.81%. Booked exposure is unchanged.",
        sql="SELECT concentration_share, pro_forma_concentration_share FROM aa_portfolio_concentration WHERE industry_code = 'Transportation' AND geography_id = 'CA'",
        tables_used=["aa_portfolio_concentration"],
        columns=["concentration_share", "pro_forma_concentration_share"],
        rows=[[0.20, 0.2381]],
    ),
    "ambiguous_term": dict(
        text=(
            "I cannot judge whether an application is risky; that is a credit decision. I can show you "
            "its submitted evidence, verification status, and how it compares with current portfolio "
            "concentration, all without a recommendation."
        ),
    ),
    "unsupported_action": dict(
        text=(
            "I cannot approve this application or set its price. I have read-only access to application "
            "and portfolio data, and approval, decline, and pricing decisions stay with credit "
            "officers.\n\nI can show you the submitted evidence and portfolio context instead."
        ),
    ),
    "no_data": dict(
        text=(
            "There is no data for product = 'STUDENT_LOAN' in this dataset. The products present are "
            "Auto Loan, Credit Card, and Personal Line, so the filter returns no rows rather than a low "
            "value."
        ),
        sql="SELECT * FROM aa_credit_operations WHERE product_id = 'STUDENT_LOAN'",
        tables_used=["aa_credit_operations"],
        columns=["product_id", "application_count"],
        rows=[],
    ),
    "invalid_filter": dict(
        text=(
            "'not-a-date' is not a timestamp, so I cannot filter submitted_at on it and I will not guess "
            "a period. submitted_at values are logical timestamps such as 2026-07-25 08:00:00."
        ),
        error="invalid_filter_value",
        columns=["submitted_at", "application_count"],
        rows=[],
    ),
}
register("a7", a7_starters + known_question_fixtures("a7", {}, a7_answers))


# ---------------------------------------------------------------------------
# A8 Explain My Money (Customer Money)
# ---------------------------------------------------------------------------
a8_starters = [
    fixture(
        "a8",
        "starter_dining_change_baseline",
        "Why did my dining spending change this month?",
        ["dining spending change", "why did my spending change"],
        "baseline",
        [
            result(
                "Your dining spending this month is $410, about the same as last month's $395. "
                "Nothing unusual stands out in this category right now.",
                sql=(
                    "SELECT spend_month, category_spend_usd\nFROM aa_customer_spend_change\n"
                    "WHERE category = 'dining'\nORDER BY spend_month DESC LIMIT 2"
                ),
                tables_used=["aa_customer_spend_change"],
                columns=["spend_month", "category_spend_usd"],
                rows=[["2026-07-01", 410.0], ["2026-06-01", 395.0]],
            )
        ],
    ),
    fixture(
        "a8",
        "starter_dining_change_after",
        "Why did my dining spending change this month?",
        ["dining spending change", "why did my spending change"],
        "after_injection",
        [
            result(
                "Your dining spending this month is $710, up $300 from last month's $410. That $300 "
                "shows up as new outflow transactions this period, and your net cash flow is down by "
                "the same $300 as a result.",
                sql=(
                    "SELECT spend_month, category_spend_usd\nFROM aa_customer_spend_change\n"
                    "WHERE category = 'dining'\nORDER BY spend_month DESC LIMIT 2"
                ),
                tables_used=["aa_customer_spend_change"],
                columns=["spend_month", "category_spend_usd"],
                rows=[["2026-07-01", 710.0], ["2026-06-01", 410.0]],
            )
        ],
    ),
    fixture(
        "a8",
        "starter_transactions_evidence",
        "Show the transactions that explain the change.",
        ["transactions that explain the change", "what transactions"],
        "any",
        [
            result(
                "Six new dining transactions this period, flagged below, add up to the $300 increase.",
                sql=(
                    "SELECT event_time, merchant_name, amount_usd, is_scenario_event\n"
                    "FROM aa_customer_transaction_evidence\nWHERE category = 'dining'\n"
                    "ORDER BY event_time DESC LIMIT 6"
                ),
                tables_used=["aa_customer_transaction_evidence"],
                columns=["event_time", "merchant_name", "amount_usd", "is_scenario_event"],
                rows=[
                    ["2026-07-25 19:40:00", "Harbor Bistro", 52.0, "New this period"],
                    ["2026-07-25 12:15:00", "Corner Cafe", 48.0, "New this period"],
                    ["2026-07-24 20:05:00", "Riverside Grill", 60.0, "New this period"],
                ],
            )
        ],
    ),
    fixture(
        "a8",
        "starter_cash_flow_compare",
        "Compare my current cash flow with the prior comparable period.",
        ["compare current cash flow prior period", "net cash flow comparison"],
        "any",
        [
            result(
                "Your net cash flow today is -$110, compared with +$190 on the prior comparable day. "
                "The swing is mostly the extra dining spending this period.",
                sql=(
                    "SELECT activity_date, inflows, outflows, net_flow\nFROM aa_customer_money_summary\n"
                    "ORDER BY activity_date DESC LIMIT 2"
                ),
                tables_used=["aa_customer_money_summary"],
                columns=["activity_date", "inflows", "outflows", "net_flow"],
                rows=[["2026-07-25", 1200.0, 1310.0, -110.0], ["2026-07-24", 1150.0, 960.0, 190.0]],
            )
        ],
    ),
]
a8_answers = {
    "baseline_kpi": dict(
        text="Your ending balance is $4,120 and your net cash flow for the most recent logical day is -$110.",
        sql="SELECT ending_balance, net_flow FROM aa_customer_money_summary ORDER BY activity_date DESC LIMIT 1",
        tables_used=["aa_customer_money_summary"],
        columns=["ending_balance", "net_flow"],
        rows=[[4120.0, -110.0]],
    ),
    "comparison": dict(
        text="Your dining spending this month is $710, up from $410 last month — a $300 increase.",
        sql="SELECT spend_month, category_spend_usd FROM aa_customer_spend_change WHERE category = 'dining' ORDER BY spend_month DESC LIMIT 2",
        tables_used=["aa_customer_spend_change"],
        columns=["spend_month", "category_spend_usd"],
        rows=[["2026-07-01", 710.0], ["2026-06-01", 410.0]],
    ),
    "multi_table_drilldown": dict(
        text="Six new dining transactions this period total $300 in new spending: Harbor Bistro ($52), Corner Cafe ($48), and Riverside Grill ($60) are the largest three.",
        sql="SELECT merchant_name, amount_usd FROM aa_customer_transaction_evidence WHERE category = 'dining' AND is_scenario_event = 1 ORDER BY amount_usd DESC",
        tables_used=["aa_customer_transaction_evidence"],
        columns=["merchant_name", "amount_usd"],
        rows=[["Riverside Grill", 60.0], ["Harbor Bistro", 52.0], ["Corner Cafe", 48.0]],
    ),
    "session_followup": dict(
        text="For groceries, this month's spending is $340, about the same as last month's $355 — no meaningful change.",
        sql="SELECT spend_month, category_spend_usd FROM aa_customer_spend_change WHERE category = 'groceries' ORDER BY spend_month DESC LIMIT 2",
        tables_used=["aa_customer_spend_change"],
        columns=["spend_month", "category_spend_usd"],
        rows=[["2026-07-01", 340.0], ["2026-06-01", 355.0]],
    ),
    "ambiguous_term": dict(
        text=(
            "I cannot tell you whether you are spending too much; that is your call to make. I can show "
            "you how your spending in any category compares with a prior period, so you can decide for "
            "yourself. Which category or period would you like to compare?"
        ),
    ),
    "unsupported_action": dict(
        text=(
            "I cannot move money between your accounts. I have read-only access to your transaction "
            "history and no ability to transfer funds.\n\nI can show you your current balances and cash "
            "flow instead."
        ),
    ),
    "no_data": dict(
        text=(
            "There is no spending data for category = 'PRIVATE_JET' in your transaction history. Your "
            "tracked categories include dining, groceries, transportation, and a handful of others, so "
            "the filter returns no rows rather than a low value."
        ),
        sql="SELECT * FROM aa_customer_spend_change WHERE category = 'PRIVATE_JET'",
        tables_used=["aa_customer_spend_change"],
        columns=["category", "category_spend_usd"],
        rows=[],
    ),
    "invalid_filter": dict(
        text=(
            "'not-a-date' is not a timestamp, so I cannot filter your transactions on it and I will not "
            "guess a period. Transaction times look like 2026-07-25 08:00:00."
        ),
        error="invalid_filter_value",
        columns=["event_time", "amount_usd"],
        rows=[],
    ),
}
register("a8", a8_starters + known_question_fixtures("a8", {}, a8_answers))


def write_all() -> None:
    total = 0
    for anchor, records in ANCHORS.items():
        directory = FIXTURE_ROOT / anchor
        directory.mkdir(parents=True, exist_ok=True)
        for record in records:
            path = directory / f"{record['id']}.json"
            path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
            total += 1
    print(f"wrote {total} fixture files across {len(ANCHORS)} anchors")


def manifest_dir_for(anchor: str) -> Path | None:
    matches = list((REPO_ROOT / "domains").glob(f"{anchor}-*/manifest.yaml"))
    return matches[0] if matches else None


def manifest_starters(anchor: str) -> list[str]:
    path = manifest_dir_for(anchor)
    if not path:
        return []
    body = path.read_text(encoding="utf-8")
    block = body[body.index("\nstarter_prompts:") : body.index("\nknown_questions:")]
    return re.findall(r"^  - (.+)$", block, re.MULTILINE)


def self_check() -> None:
    ok = True
    for anchor, records in ANCHORS.items():
        known = KNOWN.get(anchor, [])
        if not known:
            print(f"[{anchor}] no known_questions found in knownQuestions.ts (check anchorId parsing)")
            ok = False
        for q in known:
            if not resolves(q["question"], "after_injection", records):
                print(f"[{anchor}] known question NOT resolved (after_injection): {q['id']}")
                ok = False
        starters = manifest_starters(anchor)
        if not starters:
            print(f"[{anchor}] no starter_prompts found in manifest")
            ok = False
        for starter in starters:
            for state in ("baseline", "after_injection"):
                if not resolves(starter, state, records):
                    print(f"[{anchor}] starter NOT resolved ({state}): {starter}")
                    ok = False
    if not ok:
        raise SystemExit(1)
    print("self-check passed")


if __name__ == "__main__":
    self_check()
    write_all()
