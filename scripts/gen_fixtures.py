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
# A1 Digital Funnel Performance
# ---------------------------------------------------------------------------
A1_FUNNEL_SQL = (
    "SELECT channel, SUM(sessions_started) AS sessions_started, "
    "SUM(applications_submitted) AS applications_submitted, "
    "SUM(referred_to_review) AS referred_to_review, "
    "SUM(applications_approved) AS applications_approved, "
    "SUM(applications_submitted) / SUM(sessions_started) AS completion_rate\n"
    "FROM aa_digital_funnel\n"
    "WHERE session_date > DATE_SUB((SELECT logical_time FROM demo_active_run WHERE singleton_id = 1), INTERVAL 30 DAY)\n"
    "GROUP BY channel"
)
A1_FUNNEL_COLUMNS = [
    "channel", "sessions_started", "applications_submitted", "referred_to_review",
    "applications_approved", "completion_rate",
]
A1_REVIEW_SQL = (
    "SELECT review_path, SUM(applications) AS applications, SUM(approved) AS approved, "
    "SUM(approved) / SUM(applications) AS approval_rate, "
    "SUM(avg_minutes_to_decision * applications) / SUM(applications) AS avg_minutes_to_decision\n"
    "FROM aa_digital_review_comparison\nGROUP BY review_path"
)
A1_REVIEW_COLUMNS = ["review_path", "applications", "approved", "approval_rate", "avg_minutes_to_decision"]
A1_LOST_SQL = (
    "WITH prior AS (\n"
    "  SELECT intent_cohort, SUM(applications_opened) / SUM(applications_submitted) AS baseline_open_rate\n"
    "  FROM aa_digital_intent_cohort WHERE session_date < '2026-07-25' GROUP BY intent_cohort\n"
    "), today AS (\n"
    "  SELECT intent_cohort, SUM(applications_submitted) AS applications_today, "
    "SUM(applications_opened) AS opened_today, SUM(referred_to_review) AS referred_today, "
    "SUM(submitted_value_usd) AS submitted_value_usd, SUM(opened_value_usd) AS opened_value_usd\n"
    "  FROM aa_digital_intent_cohort WHERE session_date = '2026-07-25' GROUP BY intent_cohort\n"
    ")\n"
    "SELECT t.intent_cohort, t.applications_today, t.referred_today, t.opened_today, p.baseline_open_rate,\n"
    "  GREATEST(t.applications_today * p.baseline_open_rate - t.opened_today, 0) AS openings_lost,\n"
    "  GREATEST(t.submitted_value_usd * p.baseline_open_rate - t.opened_value_usd, 0) AS lost_value_usd\n"
    "FROM today t JOIN prior p ON p.intent_cohort = t.intent_cohort\n"
    "ORDER BY lost_value_usd DESC"
)
A1_LOST_COLUMNS = [
    "intent_cohort", "applications_today", "referred_today", "opened_today",
    "baseline_open_rate", "openings_lost", "lost_value_usd",
]

a1_starters = [
    fixture(
        "a1",
        "starter_funnel_baseline",
        "Show the account-opening funnel by step and channel for the last 30 days, including completion and abandonment rates.",
        ["funnel by channel", "sessions applications referrals", "account opening funnel"],
        "baseline",
        [
            result(
                "Session-to-application completion is **68.52%** across both channels: **378** sessions "
                "started and **259** applications were submitted. Only seven logical days of history "
                "exist (2026-07-18 to 2026-07-25), so that is the period shown rather than 30 days.\n\n"
                "- mobile_app: **224** sessions, **155** applications (**69.20%** completion, **30.80%** "
                "abandonment), **24** referred to manual review, **120** opened.\n"
                "- web: **154** sessions, **104** applications (**67.53%** completion, **32.47%** "
                "abandonment), **18** referred, **78** opened.\n\n"
                "The two channels convert within two points of each other, so neither stands out.",
                sql=A1_FUNNEL_SQL,
                tables_used=["aa_digital_funnel"],
                columns=A1_FUNNEL_COLUMNS,
                rows=[
                    ["mobile_app", 224, 155, 24, 120, 0.6920],
                    ["web", 154, 104, 18, 78, 0.6753],
                ],
            )
        ],
    ),
    fixture(
        "a1",
        "starter_funnel_after",
        "Show the account-opening funnel by step and channel for the last 30 days, including completion and abandonment rates.",
        ["funnel by channel", "sessions applications referrals", "account opening funnel"],
        "after_injection",
        [
            result(
                "mobile_app now converts sessions to applications at **72.84%** against **68.83%** on web, "
                "but far fewer of its applications open an account. Only seven logical days of history "
                "exist (2026-07-18 to 2026-07-25), so that is the period shown rather than 30 days.\n\n"
                "- mobile_app: **324** sessions, **236** applications (**27.16%** abandonment), **65** "
                "referred to manual review (**27.54%**), **140** opened.\n"
                "- web: **154** sessions, **106** applications (**31.17%** abandonment), **19** referred "
                "(**17.92%**), **80** opened.\n"
                "- Since 09:00, mobile_app gained **100** sessions, **81** applications, and **41** "
                "referrals, but only **20** more openings.\n\n"
                "The extra demand is reaching the application step; the loss happens after submission. "
                "Ask which cohort lost the most openings to see where.",
                sql=A1_FUNNEL_SQL,
                tables_used=["aa_digital_funnel"],
                columns=A1_FUNNEL_COLUMNS,
                rows=[
                    ["mobile_app", 324, 236, 65, 140, 0.7284],
                    ["web", 154, 106, 19, 80, 0.6883],
                ],
            )
        ],
    ),
    fixture(
        "a1",
        "starter_review_baseline",
        "Compare manual review with straight-through applications.",
        ["manual review vs straight through", "review path comparison"],
        "baseline",
        [
            result(
                "Straight-through applications approve at **82.95%** against **42.86%** for manual "
                "review, and decide almost three times faster.\n\n"
                "- Straight-through: **217** applications, **180** approved, **30.8** minutes to decision "
                "on average.\n"
                "- Manual review: **42** applications, **18** approved, **84.1** minutes to decision.\n\n"
                "That gap is expected, since review exists to catch harder cases. Whether review is "
                "referring the right applicants is not something this data can show.",
                sql=A1_REVIEW_SQL,
                tables_used=["aa_digital_review_comparison"],
                columns=A1_REVIEW_COLUMNS,
                rows=[
                    ["straight_through", 217, 180, 0.8295, 30.8],
                    ["manual_review", 42, 18, 0.4286, 84.1],
                ],
            )
        ],
    ),
    fixture(
        "a1",
        "starter_review_after",
        "Compare manual review with straight-through applications.",
        ["manual review vs straight through", "review path comparison"],
        "after_injection",
        [
            result(
                "Straight-through applications approve at **70.16%** against **46.43%** for manual "
                "review, a gap of **23.73** points.\n\n"
                "- Straight-through: **258** applications, **181** approved, **26.4** minutes to decision "
                "on average.\n"
                "- Manual review: **84** applications, **39** approved, **47.5** minutes to decision.\n"
                "- Manual-review volume doubled from **42** this morning, and straight-through approval "
                "fell from **82.95%** because **40** new straight-through applications were all declined.\n\n"
                "Both review paths are deciding more applications against the same customers, which "
                "points to one cohort rather than a change in review policy. Confirm with the "
                "onboarding team.",
                sql=A1_REVIEW_SQL,
                tables_used=["aa_digital_review_comparison"],
                columns=A1_REVIEW_COLUMNS,
                rows=[
                    ["straight_through", 258, 181, 0.7016, 26.4],
                    ["manual_review", 84, 39, 0.4643, 47.5],
                ],
            )
        ],
    ),
    fixture(
        "a1",
        "starter_cohort_driver_baseline",
        "Which intent cohort lost the most account openings, and at which journey stage?",
        ["cohort driving manual review", "highest referral cohort", "intent cohort ranking", "lost account openings stage"],
        "baseline",
        [
            result(
                "No intent cohort is losing a material number of openings: submit-to-open rates sit "
                "between **71.74%** and **79.71%** across all four cohorts.\n\n"
                "- low_web has the lowest open rate (**71.74%**, 33 of 46 applications) and the highest "
                "referral rate (**26.09%**).\n"
                "- At the **76.45%** open rate across all cohorts, low_web would have opened about **2** "
                "more accounts.\n"
                "- high_mobile has the most volume (**86** applications) and opens **75.58%** of them.\n\n"
                "The spread is within what a small sample produces, so there is no loss to chase yet.",
                sql=(
                    "SELECT intent_cohort, SUM(applications_submitted) AS applications_submitted, "
                    "SUM(referred_to_review) / SUM(applications_submitted) AS referral_rate, "
                    "SUM(applications_opened) / SUM(applications_submitted) AS submit_to_open_rate\n"
                    "FROM aa_digital_intent_cohort\nGROUP BY intent_cohort\nORDER BY submit_to_open_rate"
                ),
                tables_used=["aa_digital_intent_cohort"],
                columns=["intent_cohort", "applications_submitted", "referral_rate", "submit_to_open_rate"],
                rows=[
                    ["low_web", 46, 0.2609, 0.7174],
                    ["high_mobile", 86, 0.2093, 0.7558],
                    ["medium_web", 58, 0.1034, 0.7759],
                    ["medium_mobile", 69, 0.0870, 0.7971],
                ],
            )
        ],
    ),
    fixture(
        "a1",
        "starter_cohort_driver",
        "Which intent cohort lost the most account openings, and at which journey stage?",
        ["cohort driving manual review", "highest referral cohort", "intent cohort ranking", "lost account openings stage"],
        "after_injection",
        [
            result(
                "high_mobile lost the most account openings today, about **38**, worth an estimated "
                "**$26,103.70** in first-year revenue, and the loss happens at the **manual-review** "
                "stage, not at application start.\n\n"
                "- Demand is healthy: **85** applications today from **107** sessions.\n"
                "- **41** of those 85 applications (**48.24%**) were referred to manual review, against "
                "**20.99%** over the prior seven logical days.\n"
                "- Only **25** opened an account. At the cohort's own prior open rate of **74.07%**, about "
                "**63** would have.\n"
                "- The other three cohorts lost less than one opening each.\n\n"
                "The dollar figure uses illustrative first-year product values set for this demo, not "
                "benchmarks. Which review rule is referring these applicants is not in this Domain and "
                "needs confirming with the onboarding team.",
                sql=A1_LOST_SQL,
                tables_used=["aa_digital_intent_cohort"],
                columns=A1_LOST_COLUMNS,
                rows=[
                    ["high_mobile", 85, 41, 25, 0.7407, 37.96, 26103.70],
                    ["low_web", 2, 0, 1, 0.7273, 0.45, 136.36],
                    ["medium_web", 6, 1, 5, 0.7778, 0, 0],
                    ["medium_mobile", 5, 2, 4, 0.7846, 0, 0],
                ],
            )
        ],
    ),
]
a1_answers = {
    "baseline_kpi": dict(
        text=(
            "Session-to-application completion is **71.55%**: **478** sessions started and **342** "
            "applications were submitted. Only seven logical days of history exist (2026-07-18 to "
            "2026-07-25), so that is the period used rather than 30 days."
        ),
        sql=(
            "SELECT SUM(sessions_started) AS sessions_started, SUM(applications_submitted) AS applications_submitted, "
            "SUM(applications_submitted) / SUM(sessions_started) AS completion_rate FROM aa_digital_funnel"
        ),
        tables_used=["aa_digital_funnel"],
        columns=["sessions_started", "applications_submitted", "completion_rate"],
        rows=[[478, 342, 0.7155]],
    ),
    "comparison": dict(
        text=(
            "Straight-through applications approve at **70.16%** against **46.43%** for manual review, "
            "so straight-through is higher by **23.73** points."
        ),
        sql=(
            "SELECT review_path, SUM(approved) / SUM(applications) AS approval_rate "
            "FROM aa_digital_review_comparison GROUP BY review_path"
        ),
        tables_used=["aa_digital_review_comparison"],
        columns=["review_path", "approval_rate"],
        rows=[["straight_through", 0.7016], ["manual_review", 0.4643]],
    ),
    "multi_table_drilldown": dict(
        text=(
            "high_mobile explains the largest share of manual-review referrals: **58** of **84** "
            "(**69.05%**). Its referral rate is **34.94%**, with 58 of its 166 applications referred."
        ),
        sql=(
            "SELECT intent_cohort, SUM(applications_submitted) AS applications_submitted, "
            "SUM(referred_to_review) AS referred_to_review, "
            "SUM(referred_to_review) / SUM(applications_submitted) AS referral_rate "
            "FROM aa_digital_intent_cohort GROUP BY intent_cohort ORDER BY referred_to_review DESC"
        ),
        tables_used=["aa_digital_intent_cohort"],
        columns=["intent_cohort", "applications_submitted", "referred_to_review", "referral_rate"],
        rows=[
            ["high_mobile", 166, 58, 0.3494],
            ["low_web", 46, 12, 0.2609],
            ["medium_web", 60, 7, 0.1167],
            ["medium_mobile", 70, 7, 0.1000],
        ],
    ),
    "session_followup": dict(
        text=(
            "high_mobile runs entirely through mobile_app: **226** sessions, **166** applications, and "
            "**58** referrals to manual review. It has no web activity to compare against."
        ),
        sql=(
            "SELECT channel, SUM(sessions_started) AS sessions_started, SUM(applications_submitted) AS applications_submitted, "
            "SUM(referred_to_review) AS referred_to_review FROM aa_digital_intent_cohort "
            "WHERE intent_cohort = 'high_mobile' GROUP BY channel"
        ),
        tables_used=["aa_digital_intent_cohort"],
        columns=["channel", "sessions_started", "applications_submitted", "referred_to_review"],
        rows=[["mobile_app", 226, 166, 58]],
    ),
    "ambiguous_term": dict(
        text=(
            "\"Best\" depends on the measure, and the two channels rank differently. mobile_app has the "
            "higher completion rate (**72.84%** against **68.83%**), but web opens more of its "
            "applications (**75.47%** against **59.32%**). Tell me which measure you mean and I will "
            "rank on it."
        ),
        sql=(
            "SELECT channel, SUM(applications_submitted) / SUM(sessions_started) AS completion_rate, "
            "SUM(applications_approved) / SUM(applications_submitted) AS submit_to_open_rate "
            "FROM aa_digital_funnel GROUP BY channel"
        ),
        tables_used=["aa_digital_funnel"],
        columns=["channel", "completion_rate", "submit_to_open_rate"],
        rows=[["mobile_app", 0.7284, 0.5932], ["web", 0.6883, 0.7547]],
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
            "There is no digital-channel data for channel = 'branch' in this dataset: this Domain tracks "
            "only mobile_app and web. The filter returns no rows rather than a low value, and I have not "
            "substituted a nearby channel."
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
# A3 Fraud Strategy Optimization (Fraud Strategy)
# ---------------------------------------------------------------------------
A3_LOSS_SQL = (
    "SELECT channel, fraud_type, cases_total, confirmed_fraud_cases, confirmed_loss_usd, "
    "false_positive_rate\nFROM aa_fraud_loss_summary\nORDER BY confirmed_loss_usd DESC"
)
A3_LOSS_COLUMNS = ["channel", "fraud_type", "cases_total", "confirmed_fraud_cases", "confirmed_loss_usd", "false_positive_rate"]
A3_LOSS_ROWS_BASELINE_TAIL = [
    ["card_not_present", "first_party", 2, 1, 595.18, 0.5],
    ["online_banking", "synthetic_identity", 2, 1, 175.44, 0.5],
]
A3_LOSS_ROWS_BASELINE_REST = [
    ["card_not_present", "account_takeover", 5, 1, 76.28, 0.75],
    ["card_present", "synthetic_identity", 3, 1, 70.95, 0.6667],
    ["online_banking", "account_takeover", 2, 0, 0.00, None],
    ["card_present", "first_party", 1, 0, 0.00, 1.0],
]
A3_LOSS_ROWS_BASELINE = [
    *A3_LOSS_ROWS_BASELINE_TAIL,
    ["card_not_present", "card_testing", 6, 2, 81.34, 0.6667],
    *A3_LOSS_ROWS_BASELINE_REST,
]
A3_LOSS_ROWS_AFTER = [
    ["card_not_present", "card_testing", 18, 7, 2581.34, 0.6111],
    *A3_LOSS_ROWS_BASELINE_TAIL,
    *A3_LOSS_ROWS_BASELINE_REST,
]
A3_PATTERN_SQL = (
    "SELECT human_disposition, COUNT(*) AS cases,\n"
    "  SUM(JSON_ARRAY_CONTAINS_STRING(reason_codes, 'velocity_breach')) AS velocity_breach_cases,\n"
    "  SUM(JSON_ARRAY_CONTAINS_STRING(reason_codes, 'geo_anomaly')) AS geo_anomaly_cases,\n"
    "  COUNT(DISTINCT device_id) AS distinct_devices,\n"
    "  MAX(device_alert_count) AS max_device_alert_count,\n"
    "  ROUND(AVG(account_age_days), 1) AS avg_account_age_days,\n"
    "  SUM(confirmed_loss_usd) AS confirmed_loss_usd\n"
    "FROM aa_fraud_segment_evidence\n"
    "WHERE channel = 'card_not_present' AND fraud_type = 'card_testing'\n"
    "  AND human_disposition IN ('confirmed_fraud', 'legitimate')\n"
    "GROUP BY human_disposition"
)
A3_PATTERN_COLUMNS = [
    "human_disposition", "cases", "velocity_breach_cases", "geo_anomaly_cases",
    "distinct_devices", "max_device_alert_count", "avg_account_age_days", "confirmed_loss_usd",
]
A3_REVIEW_SQL = (
    "SELECT case_id, fraud_type, channel, score, human_disposition, confirmed_loss_usd\n"
    "FROM aa_fraud_case_review\nORDER BY confirmed_loss_usd DESC, score DESC LIMIT 12"
)

a3_starters = [
    fixture(
        "a3",
        "starter_loss_by_type_baseline",
        "Show confirmed fraud loss and false-positive rate by channel and fraud type.",
        ["confirmed loss by fraud type", "loss and false positive rate"],
        "baseline",
        [
            result(
                "Over the seven baseline days, **first-party fraud on card-not-present** leads "
                "investigator-confirmed loss at **$595.18**, from a single confirmed case.\n\n"
                "- Total confirmed loss: **$999.19** across **21** cases.\n"
                "- Overall false-positive rate: **66.67%** (12 legitimate of 18 dispositioned cases).\n"
                "- No segment has more than **2** confirmed cases, and most confirmed losses are "
                "under $100.\n\n"
                "Loss is spread thinly across segments, so no single cluster stands out yet. Amounts "
                "are normalized to US dollars.",
                sql=A3_LOSS_SQL,
                tables_used=["aa_fraud_loss_summary"],
                columns=A3_LOSS_COLUMNS,
                rows=A3_LOSS_ROWS_BASELINE,
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
                "My answer has changed since the last run: **card testing on card-not-present** is "
                "now the highest-loss segment at **$2,581.34**, ahead of first-party fraud on "
                "card-not-present at $595.18.\n\n"
                "- The segment held only $81.34 of confirmed loss before; **12** cases arrived in "
                "the last few minutes and investigators confirmed **5** of them as fraud, adding "
                "**$2,500.00**.\n"
                "- Its false-positive rate is **61.11%** (11 of 18 dispositioned cases were legitimate).\n"
                "- Total confirmed loss rose from $999.19 to **$3,499.19**.\n\n"
                "A segment jumping to the top within minutes is worth an investigator's attention; "
                "the next step is to see what separates its confirmed fraud from its false "
                "positives. Amounts are normalized to US dollars.",
                sql=A3_LOSS_SQL,
                tables_used=["aa_fraud_loss_summary"],
                columns=A3_LOSS_COLUMNS,
                rows=A3_LOSS_ROWS_AFTER,
            )
        ],
    ),
    fixture(
        "a3",
        "starter_segment_pattern_baseline",
        "For the highest-loss segment, compare reason codes, device reuse, account age, and merchant for confirmed fraud versus false positives.",
        ["reason codes device reuse account age merchant", "confirmed fraud versus false positives"],
        "baseline",
        [
            result(
                "The highest-loss segment, **first-party fraud on card-not-present**, has only "
                "**2** cases: one confirmed fraud and one false positive. That is too few to call "
                "a pattern.\n\n"
                "- FCASE-A3B-000015 (confirmed fraud, **$595.18**): reason codes geo_anomaly and "
                "velocity_breach, device used on 2 alerts, account 1,291 days old, Copperfield "
                "Electronics Retail.\n"
                "- FCASE-A3B-000021 (legitimate): reason code velocity_breach, device used on 1 "
                "alert, account 1,118 days old, Alder Travel Markets.\n\n"
                "Both carry velocity_breach, so that code does not tell them apart here.",
                sql=(
                    "SELECT case_id, human_disposition, reason_codes, device_id, device_alert_count, "
                    "account_age_days, merchant_name, confirmed_loss_usd\nFROM aa_fraud_segment_evidence\n"
                    "WHERE channel = 'card_not_present' AND fraud_type = 'first_party'\n"
                    "ORDER BY confirmed_loss_usd DESC"
                ),
                tables_used=["aa_fraud_segment_evidence"],
                columns=["case_id", "human_disposition", "reason_codes", "device_id", "device_alert_count", "account_age_days", "merchant_name", "confirmed_loss_usd"],
                rows=[
                    ["FCASE-A3B-000015", "confirmed_fraud", '["geo_anomaly", "velocity_breach"]', "DEV-0007", 2, 1291, "Copperfield Electronics Retail", 595.18],
                    ["FCASE-A3B-000021", "legitimate", '["velocity_breach"]', "DEV-0039", 1, 1118, "Alder Travel Markets", 0.00],
                ],
            )
        ],
    ),
    fixture(
        "a3",
        "starter_segment_pattern_after",
        "For the highest-loss segment, compare reason codes, device reuse, account age, and merchant for confirmed fraud versus false positives.",
        ["reason codes device reuse account age merchant", "confirmed fraud versus false positives"],
        "after_injection",
        [
            result(
                "In **card testing on card-not-present**, no single signal separates confirmed fraud "
                "from false positives, but two together do: velocity plus a reused device.\n\n"
                "- Confirmed fraud (**7** cases, $2,581.34): **7 of 7** carry velocity_breach and "
                "none carry geo_anomaly. One device, **DEV-0008**, appears on **5** of them; "
                "accounts average **1,559.7** days old.\n"
                "- False positives (**11** cases): **4** also carry velocity_breach, so velocity "
                "alone is not enough. **7** were flagged on geo_anomaly alone, and every one was "
                "legitimate. They use **10** different devices, none on more than **2** alerts; "
                "accounts average **1,106.6** days old.\n"
                "- Merchant does not separate them: the burst cases on both sides are at "
                "Electronics merchants.\n\n"
                "Repeated attempts from one device on established accounts fit card testing rather "
                "than new-account fraud. Most of these cases come from one burst, so an "
                "investigator should confirm the pattern against a longer window.",
                sql=A3_PATTERN_SQL,
                tables_used=["aa_fraud_segment_evidence"],
                columns=A3_PATTERN_COLUMNS,
                rows=[
                    ["confirmed_fraud", 7, 7, 0, 3, 5, 1559.7, 2581.34],
                    ["legitimate", 11, 4, 7, 10, 2, 1106.6, 0.00],
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
                "The **12** highest-loss cases are ranked below by confirmed loss, then alert score; "
                "the largest is **FCASE-A3LC-003** at **$601.22**.\n\n"
                "- Five of the top six are the card-testing burst (FCASE-A3LC-000 to -004), "
                "between $412.37 and $601.22 each.\n"
                "- **3** cases are still open and need a disposition: FCASE-A3B-000002, "
                "FCASE-A3B-000004, and FCASE-A3B-000014.\n\n"
                "Ranking by loss favors single large cases; ranking by segment shows the burst as "
                "one problem. Dispositions stay with fraud investigators.",
                sql=A3_REVIEW_SQL,
                tables_used=["aa_fraud_case_review"],
                columns=["case_id", "fraud_type", "channel", "score", "human_disposition", "confirmed_loss_usd"],
                rows=[
                    ["FCASE-A3LC-003", "card_testing", "card_not_present", 0.79, "confirmed_fraud", 601.22],
                    ["FCASE-A3B-000015", "first_party", "card_not_present", 0.3921, "confirmed_fraud", 595.18],
                    ["FCASE-A3LC-001", "card_testing", "card_not_present", 0.63, "confirmed_fraud", 538.90],
                    ["FCASE-A3LC-002", "card_testing", "card_not_present", 0.71, "confirmed_fraud", 487.15],
                    ["FCASE-A3LC-004", "card_testing", "card_not_present", 0.87, "confirmed_fraud", 460.36],
                    ["FCASE-A3LC-000", "card_testing", "card_not_present", 0.55, "confirmed_fraud", 412.37],
                    ["FCASE-A3B-000008", "synthetic_identity", "online_banking", 0.6932, "confirmed_fraud", 175.44],
                    ["FCASE-A3B-000005", "account_takeover", "card_not_present", 0.4028, "confirmed_fraud", 76.28],
                    ["FCASE-A3B-000006", "synthetic_identity", "card_present", 0.4119, "confirmed_fraud", 70.95],
                    ["FCASE-A3B-000007", "card_testing", "card_not_present", 0.9405, "confirmed_fraud", 46.26],
                    ["FCASE-A3B-000020", "card_testing", "card_not_present", 0.723, "confirmed_fraud", 35.08],
                    ["FCASE-A3B-000003", "account_takeover", "card_not_present", 0.9747, "legitimate", 0.00],
                ],
            )
        ],
    ),
    fixture(
        "a3",
        "rule_change_candidates",
        "What rule change should the fraud strategy team review for this segment?",
        ["what rule change should we review", "how would you optimize this", "what would you change"],
        "after_injection",
        [
            result(
                "In card testing on card-not-present, **geo_anomaly** flagged **7** cases and every "
                "one was legitimate, while **velocity_breach** caught all **7** confirmed fraud cases "
                "but also **4** legitimate ones.\n\n"
                "- velocity_breach: **7** confirmed fraud, **4** false positives.\n"
                "- cvv_retry: **6** confirmed fraud, **1** false positive.\n"
                "- geo_anomaly: **0** confirmed fraud, **7** false positives.\n\n"
                "Two candidates for your fraud strategy team to test: raise case priority when "
                "velocity_breach and cvv_retry fire together on a device already linked to other "
                "alerts, and test whether a geo_anomaly alert with no other reason code could go to "
                "step-up authentication instead of a case. This rests on 18 cases, most from one "
                "burst, so back-test both against a longer window before changing a rule. I have "
                "not changed any rule.",
                sql=(
                    "SELECT TRIM(BOTH '\"' FROM rc.table_col) AS reason_code,\n"
                    "  SUM(e.human_disposition = 'confirmed_fraud') AS confirmed_fraud_cases,\n"
                    "  SUM(e.human_disposition = 'legitimate') AS false_positive_cases\n"
                    "FROM aa_fraud_segment_evidence e\n"
                    "JOIN TABLE(JSON_TO_ARRAY(e.reason_codes)) rc\n"
                    "WHERE e.channel = 'card_not_present' AND e.fraud_type = 'card_testing'\n"
                    "GROUP BY reason_code\nORDER BY confirmed_fraud_cases DESC, false_positive_cases DESC"
                ),
                tables_used=["aa_fraud_segment_evidence"],
                columns=["reason_code", "confirmed_fraud_cases", "false_positive_cases"],
                rows=[
                    ["velocity_breach", 7, 4],
                    ["cvv_retry", 6, 1],
                    ["geo_anomaly", 0, 7],
                ],
            )
        ],
    ),
]
a3_answers = {
    "baseline_kpi": dict(
        text=(
            "In the last 24 logical hours, investigator-confirmed fraud loss is **$2,535.08** and "
            "the false-positive rate is **60.00%**.\n\n"
            "- **15** cases opened: **6** confirmed fraud and **9** legitimate.\n"
            "- **$2,500.00** of the loss comes from the card-testing burst on card-not-present.\n\n"
            "The window runs back 24 hours from the latest case. Amounts are normalized to US "
            "dollars, and chargeback-settled loss arrives later and is not included."
        ),
        sql=(
            "SELECT SUM(confirmed_loss_usd) AS confirmed_loss_usd,\n"
            "  SUM(human_disposition = 'legitimate')\n"
            "    / NULLIF(SUM(human_disposition IN ('confirmed_fraud', 'legitimate')), 0) AS false_positive_rate\n"
            "FROM aa_fraud_case_review\n"
            "WHERE opened_at > (SELECT MAX(opened_at) FROM aa_fraud_case_review) - INTERVAL 24 HOUR"
        ),
        tables_used=["aa_fraud_case_review"],
        columns=["confirmed_loss_usd", "false_positive_rate"],
        rows=[[2535.08, 0.6]],
    ),
    "comparison": dict(
        text=(
            "**Card testing on card-not-present** leads confirmed loss at **$2,581.34** "
            "(**73.77%** of the total), ahead of first-party fraud on card-not-present at "
            "**$595.18** (17.01%).\n\n"
            "- Total confirmed loss: **$3,499.19**.\n"
            "- The top two segments hold **90.78%** of all confirmed loss.\n\n"
            "The leading segment is new in the last few minutes, so its share reflects one burst "
            "rather than a long-run trend. Amounts are normalized to US dollars."
        ),
        sql=(
            "SELECT channel, fraud_type, confirmed_loss_usd,\n"
            "  confirmed_loss_usd / SUM(confirmed_loss_usd) OVER () AS share_of_loss\n"
            "FROM aa_fraud_loss_summary\nWHERE confirmed_loss_usd > 0\nORDER BY confirmed_loss_usd DESC"
        ),
        tables_used=["aa_fraud_loss_summary"],
        columns=["channel", "fraud_type", "confirmed_loss_usd", "share_of_loss"],
        rows=[
            ["card_not_present", "card_testing", 2581.34, 0.7377],
            ["card_not_present", "first_party", 595.18, 0.1701],
            ["online_banking", "synthetic_identity", 175.44, 0.0501],
            ["card_not_present", "account_takeover", 76.28, 0.0218],
            ["card_present", "synthetic_identity", 70.95, 0.0203],
        ],
    ),
    "multi_table_drilldown": dict(
        text=(
            "The highest-loss fraud type is **card_testing** at **$2,581.34** across 7 confirmed "
            "cases, all on card-not-present.\n\n"
            "- Five cases share device **DEV-0008**, which appears on **5** alerts, and every one "
            "carries velocity_breach. Together they lost **$2,500.00**.\n"
            "- The two baseline cases, FCASE-A3B-000007 ($46.26) and FCASE-A3B-000020 ($35.08), "
            "also carry velocity_breach but use devices seen on at most **2** alerts.\n\n"
            "Velocity is common to all seven; the shared device is what marks the burst as one "
            "attacker."
        ),
        sql=(
            "SELECT r.case_id, r.channel, r.confirmed_loss_usd, e.device_id, e.device_alert_count,\n"
            "  JSON_ARRAY_CONTAINS_STRING(e.reason_codes, 'velocity_breach') AS velocity_breach\n"
            "FROM aa_fraud_case_review r\n"
            "JOIN aa_fraud_segment_evidence e ON e.case_id = r.case_id\n"
            "WHERE r.fraud_type = 'card_testing' AND r.human_disposition = 'confirmed_fraud'\n"
            "ORDER BY r.confirmed_loss_usd DESC, r.score DESC"
        ),
        tables_used=["aa_fraud_case_review", "aa_fraud_segment_evidence"],
        columns=["case_id", "channel", "confirmed_loss_usd", "device_id", "device_alert_count", "velocity_breach"],
        rows=[
            ["FCASE-A3LC-003", "card_not_present", 601.22, "DEV-0008", 5, 1],
            ["FCASE-A3LC-001", "card_not_present", 538.90, "DEV-0008", 5, 1],
            ["FCASE-A3LC-002", "card_not_present", 487.15, "DEV-0008", 5, 1],
            ["FCASE-A3LC-004", "card_not_present", 460.36, "DEV-0008", 5, 1],
            ["FCASE-A3LC-000", "card_not_present", 412.37, "DEV-0008", 5, 1],
            ["FCASE-A3B-000007", "card_not_present", 46.26, "DEV-0017", 1, 1],
            ["FCASE-A3B-000020", "card_not_present", 35.08, "DEV-0034", 2, 1],
        ],
    ),
    "session_followup": dict(
        text=(
            "None of the **18** card_testing cases is still open; every one has a human "
            "disposition.\n\n"
            "- **7** confirmed fraud and **11** legitimate.\n"
            "- Across all fraud types, **3** cases are open: FCASE-A3B-000002, FCASE-A3B-000004, "
            "and FCASE-A3B-000014.\n\n"
            "No card-testing case is waiting on an investigator."
        ),
        sql=(
            "SELECT human_disposition, COUNT(*) AS cases\nFROM aa_fraud_case_review\n"
            "WHERE fraud_type = 'card_testing'\nGROUP BY human_disposition"
        ),
        tables_used=["aa_fraud_case_review"],
        columns=["human_disposition", "cases"],
        rows=[["confirmed_fraud", 7], ["legitimate", 11]],
    ),
    "ambiguous_term": dict(
        text=(
            "\"Worst\" could mean the most confirmed loss, the most cases, or the highest "
            "false-positive rate, and fraud types rank differently on each. By loss, "
            "**card_testing** is worst at **$2,581.34**.\n\n"
            "- By false-positive rate, **account_takeover** is worst at **75.00%**: 3 of its 4 "
            "dispositioned cases were legitimate.\n"
            "- By case count, card_testing leads with **18**.\n\n"
            "Tell me which measure you mean and I will rank on it."
        ),
        sql=(
            "SELECT fraud_type, SUM(cases_total) AS cases_total, SUM(confirmed_loss_usd) AS confirmed_loss_usd,\n"
            "  SUM(legitimate_cases) / NULLIF(SUM(confirmed_fraud_cases + legitimate_cases), 0) AS false_positive_rate\n"
            "FROM aa_fraud_loss_summary\nGROUP BY fraud_type\nORDER BY confirmed_loss_usd DESC"
        ),
        tables_used=["aa_fraud_loss_summary"],
        columns=["fraud_type", "cases_total", "confirmed_loss_usd", "false_positive_rate"],
        rows=[
            ["card_testing", 18, 2581.34, 0.6111],
            ["first_party", 3, 595.18, 0.6667],
            ["synthetic_identity", 5, 246.39, 0.6],
            ["account_takeover", 7, 76.28, 0.75],
        ],
    ),
    "unsupported_action": dict(
        text=(
            "I cannot close cases or determine that fraud occurred. I have read-only access to case and "
            "alert data, and case disposition stays with fraud investigators.\n\nI can show you the "
            "evidence instead: reason codes, device reuse, and account age for these cases. Ask and I "
            "will pull it."
        ),
    ),
    "no_data": dict(
        text=(
            "There is no data for fraud_type = 'INSURANCE_CLAIM' in this dataset. The fraud types present "
            "are account_takeover, card_testing, synthetic_identity, and first_party, so the filter "
            "returns no rows rather than a low value."
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
# A4 Financial Crime Operations (AML Operations)
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
# A5 Dispute Operations Performance (Disputes Operations)
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
                "**5** disputes are open and **1** is at risk of an SLA breach in the next 24 logical "
                "hours, with **$174.81** of disputed value at risk. Amounts are normalized to US dollars.\n\n"
                "- queue_disputes_escalated holds the only at-risk dispute: **1** DUPLICATE_CHARGE case.\n"
                "- The other open disputes are due between 4 and 9 days out.\n\n"
                "The queue is under control; nothing suggests a capacity problem.",
                sql=(
                    "SELECT queue_id, reason_code, SUM(open_dispute_count) AS open_dispute_count, "
                    "SUM(sla_risk_count) AS sla_risk_count, SUM(sla_risk_amount_total) AS sla_risk_amount_total\n"
                    "FROM aa_dispute_sla_risk\nGROUP BY queue_id, reason_code\n"
                    "ORDER BY sla_risk_count DESC, sla_risk_amount_total DESC"
                ),
                tables_used=["aa_dispute_sla_risk"],
                columns=["queue_id", "reason_code", "open_dispute_count", "sla_risk_count", "sla_risk_amount_total"],
                rows=[
                    ["queue_disputes_escalated", "DUPLICATE_CHARGE", 2, 1, 174.81],
                    ["queue_disputes_1", "BILLING_ERROR", 1, 0, 0],
                    ["queue_disputes_2", "GOODS_NOT_RECEIVED", 1, 0, 0],
                    ["queue_disputes_2", "FRAUD_CLAIM", 1, 0, 0],
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
                "SLA risk rose from **1** to **13** disputes, and **$7,197.75** of disputed value is now due "
                "within the next 24 logical hours. Amounts are normalized to US dollars.\n\n"
                "- PAID_BY_OTHER_MEANS in queue_disputes_escalated accounts for **12** of the 13 at-risk "
                "disputes and **$7,022.94** of the value at risk.\n"
                "- Open disputes rose from **5** to **25**; all 20 new ones carry PAID_BY_OTHER_MEANS.\n\n"
                "One reason code in one queue explains almost all of the near-term risk. Ask which merchant "
                "those disputes trace to before deciding whether this is one incident.",
                sql=(
                    "SELECT queue_id, reason_code, SUM(open_dispute_count) AS open_dispute_count, "
                    "SUM(sla_risk_count) AS sla_risk_count, SUM(sla_risk_amount_total) AS sla_risk_amount_total\n"
                    "FROM aa_dispute_sla_risk\nGROUP BY queue_id, reason_code\n"
                    "ORDER BY sla_risk_count DESC, sla_risk_amount_total DESC"
                ),
                tables_used=["aa_dispute_sla_risk"],
                columns=["queue_id", "reason_code", "open_dispute_count", "sla_risk_count", "sla_risk_amount_total"],
                rows=[
                    ["queue_disputes_escalated", "PAID_BY_OTHER_MEANS", 20, 12, 7022.94],
                    ["queue_disputes_escalated", "DUPLICATE_CHARGE", 2, 1, 174.81],
                    ["queue_disputes_1", "BILLING_ERROR", 1, 0, 0],
                    ["queue_disputes_2", "GOODS_NOT_RECEIVED", 1, 0, 0],
                    ["queue_disputes_2", "FRAUD_CLAIM", 1, 0, 0],
                ],
            )
        ],
    ),
    fixture(
        "a5",
        "starter_queue_baseline_compare",
        "Which reason code and merchant are driving the largest at-risk queue, and when did those disputes arrive?",
        ["reason code driving at risk queue", "merchant concentration", "when did disputes arrive", "queue driver trend"],
        "baseline",
        [
            result(
                "queue_disputes_escalated has the most SLA risk, but only **1** dispute: a DUPLICATE_CHARGE "
                "case at Alder Digital Markets, opened 2026-07-22 and due 2026-07-25 19:02.\n\n"
                "- The queue receives about **1** dispute per day, spread across four reason codes.\n"
                "- Every dispute traces to a different merchant, so nothing is concentrated.\n"
                "- No reason code shows a wave over the seven logical days of history.\n\n"
                "There is no concentrated driver to investigate right now.",
                sql=(
                    "SELECT opened_date, reason_code, merchant_name, SUM(dispute_count) AS dispute_count, "
                    "SUM(disputed_amount_total) AS disputed_amount_total\n"
                    "FROM aa_dispute_queue_driver\nWHERE queue_id = 'queue_disputes_escalated'\n"
                    "GROUP BY opened_date, reason_code, merchant_name\nORDER BY opened_date"
                ),
                tables_used=["aa_dispute_queue_driver"],
                columns=["opened_date", "reason_code", "merchant_name", "dispute_count", "disputed_amount_total"],
                rows=[
                    ["2026-07-22", "DUPLICATE_CHARGE", "Alder Digital Markets", 1, 174.81],
                    ["2026-07-23", "DUPLICATE_CHARGE", "Harbor Streaming Direct", 1, 84.29],
                    ["2026-07-23", "FRAUD_CLAIM", "Harbor Electronics Retail", 1, 271.03],
                    ["2026-07-24", "GOODS_NOT_RECEIVED", "Redstone Digital Direct", 1, 254.41],
                    ["2026-07-25", "BILLING_ERROR", "Brightside Streaming Markets", 1, 164.88],
                ],
            )
        ],
    ),
    fixture(
        "a5",
        "starter_queue_driver_after",
        "Which reason code and merchant are driving the largest at-risk queue, and when did those disputes arrive?",
        ["reason code driving at risk queue", "merchant concentration", "when did disputes arrive", "queue driver trend"],
        "after_injection",
        [
            result(
                "PAID_BY_OTHER_MEANS drives the queue_disputes_escalated risk, all **20** of those disputes "
                "trace to one merchant, **Copperfield Electronics Retail** (MERCH-029), and they arrived in "
                "**two waves**, a week apart.\n\n"
                "- Every disputed payment was made at that merchant between 09:00 and 09:12 on 2026-07-18.\n"
                "- **12** were opened on 2026-07-18 and 2026-07-19; all 12 reach their five-business-day "
                "provisional-credit target within the next 24 logical hours, with **$7,022.94** at risk.\n"
                "- **8** more were opened on 2026-07-25 and are due on 2026-08-01.\n"
                "- Before this pattern, the queue received about **1** dispute per day, each from a "
                "different merchant.\n\n"
                "One merchant, one 12-minute window, and one reason code point to a single incident at "
                "that merchant. What happened there is for the operations team to confirm with the merchant.",
                sql=(
                    "SELECT opened_date, reason_code, merchant_name, SUM(dispute_count) AS dispute_count, "
                    "SUM(disputed_amount_total) AS disputed_amount_total\n"
                    "FROM aa_dispute_queue_driver\nWHERE queue_id = 'queue_disputes_escalated'\n"
                    "GROUP BY opened_date, reason_code, merchant_name\nORDER BY opened_date"
                ),
                tables_used=["aa_dispute_queue_driver"],
                columns=["opened_date", "reason_code", "merchant_name", "dispute_count", "disputed_amount_total"],
                rows=[
                    ["2026-07-18", "PAID_BY_OTHER_MEANS", "Copperfield Electronics Retail", 9, 5813.63],
                    ["2026-07-19", "PAID_BY_OTHER_MEANS", "Copperfield Electronics Retail", 3, 1209.31],
                    ["2026-07-22", "DUPLICATE_CHARGE", "Alder Digital Markets", 1, 174.81],
                    ["2026-07-23", "DUPLICATE_CHARGE", "Harbor Streaming Direct", 1, 84.29],
                    ["2026-07-23", "FRAUD_CLAIM", "Harbor Electronics Retail", 1, 271.03],
                    ["2026-07-24", "GOODS_NOT_RECEIVED", "Redstone Digital Direct", 1, 254.41],
                    ["2026-07-25", "BILLING_ERROR", "Brightside Streaming Markets", 1, 164.88],
                    ["2026-07-25", "PAID_BY_OTHER_MEANS", "Copperfield Electronics Retail", 8, 3118.01],
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
                "Dispute DISP-A5B-000012 (DUPLICATE_CHARGE, **$174.81**) has **2** recorded events and is "
                "due 2026-07-25 19:02.\n\n"
                "- The customer opened the dispute on 2026-07-22 19:02.\n"
                "- An inbound chat followed five minutes later.\n"
                "- No provisional credit has been recorded.\n\n"
                "The case has had no agent activity since it was opened, which a reviewer may want to check "
                "before the deadline.",
                sql=(
                    "SELECT event_time, timeline_type, event_type, actor_type, amount\n"
                    "FROM aa_dispute_timeline\nWHERE dispute_id = 'DISP-A5B-000012'\nORDER BY event_time"
                ),
                tables_used=["aa_dispute_timeline"],
                columns=["event_time", "timeline_type", "event_type", "amount"],
                rows=[
                    ["2026-07-22 19:02:45", "case_event", "opened", None],
                    ["2026-07-22 19:07:45", "customer_contact", "chat_inbound", None],
                ],
            )
        ],
    ),
]
a5_answers = {
    "baseline_kpi": dict(
        text=(
            "**25** disputes are open, and **13** are at risk of an SLA breach in the next 24 logical "
            "hours, measured against the demo logical clock."
        ),
        sql="SELECT SUM(open_dispute_count) AS open_dispute_count, SUM(sla_risk_count) AS sla_risk_count FROM aa_dispute_sla_risk",
        tables_used=["aa_dispute_sla_risk"],
        columns=["open_dispute_count", "sla_risk_count"],
        rows=[[25, 13]],
    ),
    "comparison": dict(
        text=(
            "At-risk queue depth is **13** disputes now against **1** before the PAID_BY_OTHER_MEANS "
            "disputes appeared, an increase of **12**. Only seven logical days of history exist, so the "
            "baseline covers that period rather than the full 30 days requested."
        ),
        sql="SELECT SUM(sla_risk_count) AS sla_risk_count FROM aa_dispute_sla_risk",
        tables_used=["aa_dispute_sla_risk"],
        columns=["current_sla_risk_count", "baseline_sla_risk_count", "delta"],
        rows=[[13, 1, 12]],
    ),
    "multi_table_drilldown": dict(
        text=(
            "queue_disputes_escalated has the most SLA risk. Its at-risk disputes break down as "
            "PAID_BY_OTHER_MEANS (**12**, $7,022.94) and DUPLICATE_CHARGE (**1**, $174.81)."
        ),
        sql=(
            "SELECT reason_code, SUM(sla_risk_count) AS sla_risk_count, SUM(sla_risk_amount_total) AS sla_risk_amount_total "
            "FROM aa_dispute_sla_risk WHERE queue_id = 'queue_disputes_escalated' GROUP BY reason_code ORDER BY sla_risk_count DESC"
        ),
        tables_used=["aa_dispute_sla_risk"],
        columns=["reason_code", "sla_risk_count", "sla_risk_amount_total"],
        rows=[["PAID_BY_OTHER_MEANS", 12, 7022.94], ["DUPLICATE_CHARGE", 1, 174.81]],
    ),
    "session_followup": dict(
        text=(
            "The largest PAID_BY_OTHER_MEANS dispute is DISP-A5CS-004 at **$897.33**, due 2026-07-25 "
            "17:00, so it reaches its provisional-credit target within the next 8 logical hours.\n\n"
            "- The customer opened it on 2026-07-18 17:00, reporting a card charge and a second payment "
            "for the same purchase during a terminal outage.\n"
            "- An agent requested proof of the second payment on 2026-07-19 17:00.\n"
            "- Nothing has been recorded since, and no provisional credit has been issued."
        ),
        sql=(
            "SELECT event_time, timeline_type, event_type, actor_type, metadata FROM aa_dispute_timeline "
            "WHERE dispute_id = 'DISP-A5CS-004' ORDER BY event_time"
        ),
        tables_used=["aa_dispute_timeline"],
        columns=["event_time", "timeline_type", "event_type", "actor_type"],
        rows=[
            ["2026-07-18 17:00:00", "case_event", "opened", "customer"],
            ["2026-07-19 17:00:00", "case_event", "evidence_requested", "agent"],
        ],
    ),
    "ambiguous_term": dict(
        text=(
            "\"Falling behind\" could mean the most disputes at SLA risk or the most disputed value at "
            "risk. Here both measures point the same way: queue_disputes_escalated leads with **13** "
            "at-risk disputes and **$7,197.75** at risk. Tell me if you meant a different measure, such "
            "as the oldest open dispute."
        ),
        sql=(
            "SELECT queue_id, SUM(sla_risk_count) AS sla_risk_count, SUM(sla_risk_amount_total) AS sla_risk_amount_total "
            "FROM aa_dispute_sla_risk GROUP BY queue_id"
        ),
        tables_used=["aa_dispute_sla_risk"],
        columns=["queue_id", "sla_risk_count", "sla_risk_amount_total"],
        rows=[["queue_disputes_escalated", 13, 7197.75], ["queue_disputes_1", 0, 0], ["queue_disputes_2", 0, 0]],
    ),
    "unsupported_action": dict(
        text=(
            "I cannot issue provisional credit or adjudicate a dispute. I have read-only access to case "
            "and timeline data, and adjudication and credit decisions stay with authorized agents.\n\n"
            "I can show you the at-risk list and each case's timeline instead."
        ),
    ),
    "no_data": dict(
        text=(
            "There is no data for reason_code = 'COUNTERFEIT_GOODS' in this dataset. Reason codes present "
            "include DUPLICATE_CHARGE, GOODS_NOT_RECEIVED, FRAUD_CLAIM, BILLING_ERROR, and "
            "PAID_BY_OTHER_MEANS, so the filter returns no rows rather than a low value."
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
# A6 Liquidity and Funding Management
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
                "Available 24-hour liquidity totals **USD 77.16 million** across six entities, against "
                "**USD 2.92 million** of queued outbound payments. Amounts are normalized to US dollars.\n\n"
                "- Synthetic Entity 01 in USD holds the largest position at **USD 30.38 million**, mostly "
                "from **USD 26.42 million** of expected inbound settlements.\n"
                "- Synthetic Entity 04 in CAD is the tightest at **USD 5.86 million**.\n\n"
                "Synthetic Entity 01's position depends heavily on settlements still pending, so its "
                "liquidity is more exposed to a late counterparty than the others.",
                sql=(
                    "SELECT entity_name, currency, available_balance_usd, expected_inbound_settlements_usd, "
                    "expected_outbound_settlements_usd, queued_payments_usd, available_liquidity_24h_usd\n"
                    "FROM aa_liquidity_position\nORDER BY available_liquidity_24h_usd ASC"
                ),
                tables_used=["aa_liquidity_position"],
                columns=["entity_name", "currency", "available_balance_usd", "expected_inbound_settlements_usd", "queued_payments_usd", "available_liquidity_24h_usd"],
                rows=[
                    ["Synthetic Entity 04", "CAD", 6281967.74, 0, 419990.53, 5861977.21],
                    ["Synthetic Entity 02", "GBP", 8076492.56, 2116108.61, 591294.14, 7894490.53],
                    ["Synthetic Entity 03", "EUR", 8282534.79, 1790353.61, 531489.08, 8460423.98],
                    ["Synthetic Entity 05", "USD", 10039382.02, 96359.25, 446509.56, 9689231.71],
                    ["Synthetic Entity 06", "GBP", 14032034.86, 2187294.33, 619721.22, 14880159.32],
                    ["Synthetic Entity 01", "USD", 4847887.30, 26418844.75, 315489.74, 30376760.31],
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
                "Available 24-hour liquidity fell to **USD 52.16 million**, down **USD 25.00 million**. "
                "Amounts are normalized to US dollars.\n\n"
                "- Synthetic Entity 01 in USD dropped from **USD 30.38 million** to **USD 5.38 million** and "
                "is now the tightest position.\n"
                "- Its expected inbound settlements fell from **USD 26.42 million** to **USD 1.42 million**.\n"
                "- Every other entity and currency is unchanged.\n\n"
                "The whole movement sits in one entity and currency, which points to a single delayed "
                "inbound settlement. Treasury should confirm the cause with the counterparty.",
                sql=(
                    "SELECT entity_name, currency, available_balance_usd, expected_inbound_settlements_usd, "
                    "expected_outbound_settlements_usd, queued_payments_usd, available_liquidity_24h_usd\n"
                    "FROM aa_liquidity_position\nORDER BY available_liquidity_24h_usd ASC"
                ),
                tables_used=["aa_liquidity_position"],
                columns=["entity_name", "currency", "available_balance_usd", "expected_inbound_settlements_usd", "queued_payments_usd", "available_liquidity_24h_usd"],
                rows=[
                    ["Synthetic Entity 01", "USD", 4847887.30, 1418844.75, 315489.74, 5376760.31],
                    ["Synthetic Entity 04", "CAD", 6281967.74, 0, 419990.53, 5861977.21],
                    ["Synthetic Entity 02", "GBP", 8076492.56, 2116108.61, 591294.14, 7894490.53],
                    ["Synthetic Entity 03", "EUR", 8282534.79, 1790353.61, 531489.08, 8460423.98],
                    ["Synthetic Entity 05", "USD", 10039382.02, 96359.25, 446509.56, 9689231.71],
                    ["Synthetic Entity 06", "GBP", 14032034.86, 2187294.33, 619721.22, 14880159.32],
                ],
            )
        ],
    ),
    fixture(
        "a6",
        "starter_buffer_baseline",
        "Are we above the policy liquidity buffer, and which entity and currency explain any shortfall?",
        ["policy liquidity buffer", "above the buffer", "shortfall entity currency", "headroom"],
        "baseline",
        [
            result(
                "Available 24-hour liquidity is **USD 77.16 million**, **USD 17.16 million** above the "
                "USD 60 million illustrative policy buffer. Amounts are normalized to US dollars.\n\n"
                "- There is no shortfall to explain.\n"
                "- The largest single dependency is Synthetic Entity 01 in USD, which counts on "
                "**USD 26.42 million** of expected inbound settlements.\n\n"
                "Headroom is comfortable, but a delay to Synthetic Entity 01's inbound settlements would "
                "consume most of it.",
                sql=(
                    "SELECT SUM(available_liquidity_24h_usd) AS available_liquidity_24h_usd, "
                    "SUM(available_liquidity_24h_usd) - 60000000 AS headroom_to_buffer_usd\n"
                    "FROM aa_liquidity_position"
                ),
                tables_used=["aa_liquidity_position"],
                columns=["available_liquidity_24h_usd", "policy_buffer_usd", "headroom_to_buffer_usd"],
                rows=[[77163043.06, 60000000, 17163043.06]],
            )
        ],
    ),
    fixture(
        "a6",
        "starter_buffer_after",
        "Are we above the policy liquidity buffer, and which entity and currency explain any shortfall?",
        ["policy liquidity buffer", "above the buffer", "shortfall entity currency", "headroom"],
        "after_injection",
        [
            result(
                "Available 24-hour liquidity is **USD 52.16 million**, **USD 7.84 million below** the "
                "USD 60 million illustrative policy buffer. Amounts are normalized to US dollars.\n\n"
                "- Synthetic Entity 01 in USD explains the whole shortfall: its expected inbound "
                "settlements fell by **USD 25.00 million**.\n"
                "- Before that change, the group had **USD 17.16 million** of headroom.\n"
                "- No other entity or currency moved.\n\n"
                "The breach comes from one delayed inbound settlement, not a broad decline. Whether to "
                "fund the gap, wait for the settlement, or hold queued payments is a treasury decision.",
                sql=(
                    "SELECT entity_name, currency, expected_inbound_settlements_usd, available_liquidity_24h_usd\n"
                    "FROM aa_liquidity_position\nORDER BY available_liquidity_24h_usd ASC"
                ),
                tables_used=["aa_liquidity_position"],
                columns=["entity_name", "currency", "expected_inbound_settlements_usd", "available_liquidity_24h_usd"],
                rows=[
                    ["Synthetic Entity 01", "USD", 1418844.75, 5376760.31],
                    ["Synthetic Entity 04", "CAD", 0, 5861977.21],
                    ["Synthetic Entity 02", "GBP", 2116108.61, 7894490.53],
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
                "**2** queued payments totaling **USD 582,151.11** are due in the next 24-hour funding "
                "window. Amounts are normalized to US dollars.\n\n"
                "- QP-A6B-01-01 for Synthetic Entity 01 (USD 166,763.98) is due first, in **105** minutes.\n"
                "- QP-A6B-02-00 for Synthetic Entity 02 (USD 415,387.13) is due in **1,245** minutes.\n\n"
                "Outbound obligations in the window are small relative to group liquidity.",
                sql=(
                    "SELECT queued_payment_id, entity_name, currency, amount_usd, due_at, minutes_until_due\n"
                    "FROM aa_funding_window\nWHERE in_next_funding_window = 1\nORDER BY minutes_until_due ASC LIMIT 20"
                ),
                tables_used=["aa_funding_window"],
                columns=["queued_payment_id", "entity_name", "currency", "amount_usd", "minutes_until_due"],
                rows=[
                    ["QP-A6B-01-01", "Synthetic Entity 01", "USD", 166763.98, 105],
                    ["QP-A6B-02-00", "Synthetic Entity 02", "GBP", 415387.13, 1245],
                ],
            )
        ],
    ),
]
a6_answers = {
    "baseline_kpi": dict(
        text=(
            "Available 24-hour liquidity across every entity and currency is **USD 52.16 million**, "
            "normalized to US dollars, as of the demo logical clock. That is USD 7.84 million below the "
            "USD 60 million illustrative policy buffer."
        ),
        sql="SELECT SUM(available_liquidity_24h_usd) AS available_liquidity_24h_usd FROM aa_liquidity_position",
        tables_used=["aa_liquidity_position"],
        columns=["available_liquidity_24h_usd"],
        rows=[[52163043.06]],
    ),
    "comparison": dict(
        text="Net expected settlement is USD -6.1 million against a forecast of USD 19.3 million, a USD 25.4 million unfavorable variance driven by the delayed EMEA settlement.",
        sql="SELECT SUM(forecast_net_flow_usd) AS forecast, SUM(actual_net_flow_usd) AS actual FROM aa_liquidity_variance",
        tables_used=["aa_liquidity_variance"],
        columns=["forecast_net_flow_usd", "actual_net_flow_usd", "variance_usd"],
        rows=[[19300000, -6100000, -25400000]],
    ),
    "multi_table_drilldown": dict(
        text=(
            "Synthetic Entity 01 in USD has the tightest position at **USD 5.38 million**. It has **1** "
            "queued payment due in the next funding window: QP-A6B-01-01 for USD 166,763.98, due "
            "2026-07-25 11:00."
        ),
        sql="SELECT queued_payment_id, currency, amount_usd, due_at FROM aa_funding_window WHERE entity_id = 'ENT-01' AND in_next_funding_window = 1 ORDER BY minutes_until_due ASC",
        tables_used=["aa_liquidity_position", "aa_funding_window"],
        columns=["queued_payment_id", "currency", "amount_usd", "due_at"],
        rows=[["QP-A6B-01-01", "USD", 166763.98, "2026-07-25 11:00:00"]],
    ),
    "session_followup": dict(
        text=(
            "Filtered to EUR, the list is empty: Synthetic Entity 01 holds only a USD position, so it has "
            "no EUR payments in the next funding window. I have not substituted another currency."
        ),
        sql="SELECT queued_payment_id, amount_usd FROM aa_funding_window WHERE entity_id = 'ENT-01' AND currency = 'EUR' AND in_next_funding_window = 1",
        tables_used=["aa_funding_window"],
        columns=["queued_payment_id", "amount_usd"],
        rows=[],
    ),
    "ambiguous_term": dict(
        text=(
            "\"Tightest\" could mean the lowest available liquidity or the lowest net expected "
            "settlement, and entities rank differently on each. On available 24-hour liquidity, "
            "Synthetic Entity 01 in USD is tightest at **USD 5.38 million**. On net expected settlement, "
            "Synthetic Entity 04 in CAD is lowest at **USD 0**. Tell me which measure you want."
        ),
        sql=(
            "SELECT entity_name, currency, available_liquidity_24h_usd, "
            "expected_inbound_settlements_usd - expected_outbound_settlements_usd AS net_expected_settlement_usd "
            "FROM aa_liquidity_position ORDER BY available_liquidity_24h_usd ASC"
        ),
        tables_used=["aa_liquidity_position"],
        columns=["entity_name", "currency", "available_liquidity_24h_usd", "net_expected_settlement_usd"],
        rows=[
            ["Synthetic Entity 01", "USD", 5376760.31, 844362.75],
            ["Synthetic Entity 04", "CAD", 5861977.21, 0],
            ["Synthetic Entity 02", "GBP", 7894490.53, 409292.11],
        ],
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
            "present are USD, GBP, EUR, and CAD, so the filter returns no rows rather than a low value."
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
# A7 Credit and Exposure Management
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
        "If pending applications book, how much headroom remains against the 25% segment concentration limit?",
        ["pending request portfolio concentration", "pro forma concentration", "segment concentration limit headroom"],
        "any",
        [
            result(
                "Transportation in California would have **1.19 points** of headroom against the "
                "illustrative 25% segment limit if its pending USD 5 million application booked as "
                "requested, down from **5.00 points** today. These pro forma figures are illustrative, "
                "and booked exposure has not changed.\n\n"
                "- Booked concentration: **20.00%** of USD 100 million outstanding.\n"
                "- Illustrative pro forma concentration: **23.81%**.\n"
                "- Pending amount in the segment: **USD 5,000,000**.\n\n"
                "One more application of similar size in this segment would exceed the limit, which a "
                "credit officer may want to weigh alongside the application's evidence exceptions.",
                sql=(
                    "SELECT industry_code, geography_id, concentration_share, pending_amount, "
                    "pro_forma_concentration_share, 0.25 - pro_forma_concentration_share AS limit_headroom\n"
                    "FROM aa_portfolio_concentration\nORDER BY pro_forma_concentration_share DESC"
                ),
                tables_used=["aa_portfolio_concentration"],
                columns=["industry_code", "geography_id", "concentration_share", "pro_forma_concentration_share", "limit_headroom"],
                rows=[["TRANSPORTATION", "GEO-USCA", 0.20, 0.2381, 0.0119]],
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
        text=(
            "Compared with Transportation in California portfolio concentration: booked is **20.00%**; "
            "illustrative pro forma including this pending request is **23.81%**, leaving **1.19 points** "
            "of headroom against the illustrative 25% segment limit. Booked exposure is unchanged."
        ),
        sql=(
            "SELECT concentration_share, pro_forma_concentration_share, 0.25 - pro_forma_concentration_share AS limit_headroom "
            "FROM aa_portfolio_concentration WHERE industry_code = 'TRANSPORTATION' AND geography_id = 'GEO-USCA'"
        ),
        tables_used=["aa_portfolio_concentration"],
        columns=["concentration_share", "pro_forma_concentration_share", "limit_headroom"],
        rows=[[0.20, 0.2381, 0.0119]],
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
# A8 Embedded Insights Strategy (Customer Money)
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
        text=(
            "Three dining transactions explain the **$300** increase: three charges of **$100** each at "
            "Alder Digital Markets on the most recent logical day."
        ),
        sql="SELECT transaction_id, merchant_name, amount_usd FROM aa_customer_transaction_evidence WHERE category = 'dining' AND is_scenario_event = 1 ORDER BY amount_usd DESC",
        tables_used=["aa_customer_transaction_evidence"],
        columns=["transaction_id", "merchant_name", "amount_usd"],
        rows=[
            ["TXN-A8DS-00", "Alder Digital Markets", 100.0],
            ["TXN-A8DS-01", "Alder Digital Markets", 100.0],
            ["TXN-A8DS-02", "Alder Digital Markets", 100.0],
        ],
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
            "Whether it is too much is your call, but here is how this month compares with your own "
            "history. Your dining spending is **$710** this month against **$410** last month, up "
            "**$300**, and it is the category that changed most. Groceries are steady at **$340** "
            "against **$355**. Want me to compare another category or a longer period?"
        ),
        sql=(
            "SELECT category, spend_month, category_spend_usd FROM aa_customer_spend_change "
            "WHERE category IN ('dining', 'groceries') ORDER BY category, spend_month DESC"
        ),
        tables_used=["aa_customer_spend_change"],
        columns=["category", "spend_month", "category_spend_usd"],
        rows=[
            ["dining", "2026-07-01", 710.0],
            ["dining", "2026-06-01", 410.0],
            ["groceries", "2026-07-01", 340.0],
            ["groceries", "2026-06-01", 355.0],
        ],
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
