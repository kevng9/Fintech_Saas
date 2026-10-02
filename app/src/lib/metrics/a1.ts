/**
 * Deterministic A1 Digital Funnel Performance queries.
 *
 * Every number is SQL against SingleStore, filtered through demo_active_run
 * so pausing the simulator freezes the funnel. `digital_session`,
 * `application`, and `manual_review` are the raw facts; `aa_digital_funnel`,
 * `aa_digital_review_comparison`, and `aa_digital_intent_cohort` are the
 * curated views Aura Analyst reads (database/migrations/006_a1_digital.sql).
 */

import { query } from "../db";
import type {
  SharedChangePayload,
  SharedColumn,
  SharedEntityData,
  SharedOverviewData,
} from "../apiTypes";
import { buildChangePayload, scenarioExecution, scenarioExpectedDeltas } from "./shared";

const ACTIVE_RUN_JOIN =
  "JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = ds.run_id";

const DEFAULT_COHORT = "high_intent_promo";

function minutes(value: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > 60 * 24 * 30) {
    throw new Error("Invalid window length");
  }
  return value;
}

interface FunnelMetrics {
  sessions_started: number;
  applications_submitted: number;
  referred_to_review: number;
  applications_approved: number;
  applications_declined: number;
  submitted_value_usd: number;
  opened_value_usd: number;
}

const EMPTY_FUNNEL: FunnelMetrics = {
  sessions_started: 0,
  applications_submitted: 0,
  referred_to_review: 0,
  applications_approved: 0,
  applications_declined: 0,
  submitted_value_usd: 0,
  opened_value_usd: 0,
};

const FUNNEL_COLUMNS = `
    COUNT(DISTINCT ds.session_id) AS sessions_started,
    COUNT(DISTINCT a.application_id) AS applications_submitted,
    COUNT(DISTINCT mr.review_id) AS referred_to_review,
    SUM(CASE WHEN a.outcome_status = 'approved' THEN 1 ELSE 0 END) AS applications_approved,
    SUM(CASE WHEN a.outcome_status = 'declined' THEN 1 ELSE 0 END) AS applications_declined,
    COALESCE(SUM(dp.annual_value_usd), 0) AS submitted_value_usd,
    COALESCE(SUM(CASE WHEN a.outcome_status = 'approved' THEN dp.annual_value_usd ELSE 0 END), 0)
      AS opened_value_usd`;

const FUNNEL_JOINS = `
     FROM digital_session ds
     ${ACTIVE_RUN_JOIN}
     LEFT JOIN application a
       ON a.run_id = ds.run_id AND a.session_id = ds.session_id AND a.submitted_at <= ar.logical_time
     LEFT JOIN manual_review mr
       ON mr.run_id = a.run_id AND mr.application_id = a.application_id AND mr.referred_at <= ar.logical_time
     LEFT JOIN dim_product dp ON dp.run_id = a.run_id AND dp.product_id = a.product_id`;

async function funnelBefore(until: string, cohort?: string): Promise<FunnelMetrics> {
  const params: unknown[] = [until, until];
  let cohortFilter = "";
  if (cohort) {
    cohortFilter = " AND ds.intent_cohort = ?";
    params.push(cohort);
  }
  const rows = await query<FunnelMetrics>(
    `SELECT ${FUNNEL_COLUMNS} ${FUNNEL_JOINS}
     WHERE ds.started_at > DATE_SUB(?, INTERVAL 7 DAY) AND ds.started_at < ?${cohortFilter}`,
    params
  );
  return rows[0] ?? EMPTY_FUNNEL;
}

async function funnelBetween(from: string, to: string, cohort?: string): Promise<FunnelMetrics> {
  const params: unknown[] = [from, to];
  let cohortFilter = "";
  if (cohort) {
    cohortFilter = " AND ds.intent_cohort = ?";
    params.push(cohort);
  }
  const rows = await query<FunnelMetrics>(
    `SELECT ${FUNNEL_COLUMNS} ${FUNNEL_JOINS}
     WHERE ds.started_at >= ? AND ds.started_at <= ?${cohortFilter}`,
    params
  );
  return rows[0] ?? EMPTY_FUNNEL;
}

function completionRate(metrics: FunnelMetrics): number | null {
  return metrics.sessions_started
    ? metrics.applications_submitted / metrics.sessions_started
    : null;
}

function referralRate(metrics: FunnelMetrics): number | null {
  return metrics.applications_submitted
    ? metrics.referred_to_review / metrics.applications_submitted
    : null;
}

interface DailyFunnelRow {
  session_date: string;
  sessions_started: number;
  applications_submitted: number;
  applications_approved: number;
}

async function dailySeries(days = 30): Promise<DailyFunnelRow[]> {
  return query<DailyFunnelRow>(
    `SELECT
        session_date AS session_date,
        SUM(sessions_started) AS sessions_started,
        SUM(applications_submitted) AS applications_submitted,
        SUM(applications_approved) AS applications_approved
     FROM aa_digital_funnel
     WHERE session_date > DATE_SUB((SELECT logical_time FROM demo_active_run WHERE singleton_id = 1), INTERVAL ${Math.trunc(
       days
     )} DAY)
     GROUP BY session_date
     ORDER BY session_date`
  );
}

interface IntentCohortRow {
  session_date: string;
  intent_cohort: string;
  channel: string;
  sessions_started: number;
  applications_submitted: number;
  referred_to_review: number;
  applications_opened: number;
  submit_rate: number | null;
  submit_to_open_rate: number | null;
  referral_rate: number | null;
  has_scenario_activity: number;
}

async function latestCohorts(limit = 10): Promise<IntentCohortRow[]> {
  return query<IntentCohortRow>(
    `SELECT c.*
     FROM aa_digital_intent_cohort c
     JOIN (SELECT MAX(session_date) AS latest FROM aa_digital_intent_cohort) latest
       ON c.session_date = latest.latest
     ORDER BY c.referral_rate DESC
     LIMIT ${Math.max(1, Math.min(Math.trunc(limit), 50))}`
  );
}

async function reviewComparison(): Promise<
  { review_path: string; product_id: string; applications: number; approval_rate: number | null; avg_minutes_to_decision: number | null }[]
> {
  return query(
    `SELECT review_path, product_id, applications, approval_rate, avg_minutes_to_decision
     FROM aa_digital_review_comparison
     ORDER BY applications DESC`
  );
}

export async function overview(windowMinutes: number): Promise<SharedOverviewData> {
  const span = minutes(windowMinutes);
  const periodLabel =
    span === 7 * 24 * 60
      ? "Full seven-day baseline"
      : span === 24 * 60
        ? "Last 24 hours"
        : `Last ${span} minutes`;
  const [recentRows, baselineRows, series, cohorts, review] = await Promise.all([
    query<FunnelMetrics & { as_of: string }>(
      `SELECT ${FUNNEL_COLUMNS}, ar.logical_time AS as_of ${FUNNEL_JOINS}
       WHERE ds.started_at > DATE_SUB(ar.logical_time, INTERVAL ${span} MINUTE)
         AND ds.started_at <= ar.logical_time`
    ),
    query<FunnelMetrics>(
      `SELECT ${FUNNEL_COLUMNS} ${FUNNEL_JOINS}
       WHERE ds.started_at <= DATE_SUB(ar.logical_time, INTERVAL ${span} MINUTE)
         AND ds.started_at > DATE_SUB(ar.logical_time, INTERVAL 7 DAY)`
    ),
    dailySeries(30),
    latestCohorts(10),
    reviewComparison(),
  ]);
  const recent = recentRows[0] ?? EMPTY_FUNNEL;
  const baseline = baselineRows[0] ?? EMPTY_FUNNEL;
  const lowSample = Number(recent.sessions_started) < 30;

  const manualReview = review.find((row) => row.review_path === "manual_review") ?? null;

  const kpis: SharedOverviewData["kpis"] = [
    {
      id: "sessions_started",
      title: "Sessions started",
      subtitle: periodLabel,
      value: recent.sessions_started,
      baseline: null,
      delta: null,
      format: "count",
      higherIsBetter: true,
      statusLabel: lowSample ? "Low sample" : "Observed",
      statusTone: lowSample ? "warn" : "neutral",
    },
    {
      id: "completion_rate",
      title: "Session-to-application completion",
      subtitle: "Applications submitted per session started",
      value: completionRate(recent),
      baseline: completionRate(baseline),
      delta:
        completionRate(recent) !== null && completionRate(baseline) !== null
          ? completionRate(recent)! - completionRate(baseline)!
          : null,
      format: "percent",
      higherIsBetter: true,
      ...(lowSample ? { statusLabel: "Low sample", statusTone: "warn" as const } : {}),
    },
    {
      id: "referral_rate",
      title: "Manual review referral rate",
      subtitle: "Referred to review per application submitted",
      value: referralRate(recent),
      baseline: referralRate(baseline),
      delta:
        referralRate(recent) !== null && referralRate(baseline) !== null
          ? referralRate(recent)! - referralRate(baseline)!
          : null,
      format: "percent",
      higherIsBetter: false,
      ...(lowSample ? { statusLabel: "Low sample", statusTone: "warn" as const } : {}),
    },
    {
      id: "manual_review_minutes",
      title: "Minutes to decision (manual review)",
      subtitle: "Average across every product in manual review",
      value: manualReview?.avg_minutes_to_decision ?? null,
      baseline: null,
      delta: null,
      format: "count",
      higherIsBetter: false,
      detail: manualReview ? `${manualReview.applications} applications` : undefined,
    },
  ];

  const seriesPayload: SharedOverviewData["series"] = {
    title: "Account-opening funnel by day",
    subtitle: "Last 30 logical days across every channel",
    xKey: "session_date",
    series: [
      { key: "sessions_started", label: "Sessions started", format: "count" },
      { key: "applications_submitted", label: "Applications submitted", format: "count" },
      { key: "applications_approved", label: "Applications approved", format: "count" },
    ],
    points: series.map((row) => ({
      session_date: String(row.session_date).slice(0, 10),
      sessions_started: Number(row.sessions_started),
      applications_submitted: Number(row.applications_submitted),
      applications_approved: Number(row.applications_approved),
    })),
  };

  const driversColumns: SharedColumn[] = [
    { key: "intent_cohort", label: "Intent cohort" },
    { key: "channel", label: "Channel" },
    { key: "sessions_started", label: "Sessions", format: "count" },
    { key: "submit_rate", label: "Submit rate", format: "percent" },
    { key: "submit_to_open_rate", label: "Open rate", format: "percent" },
    { key: "referral_rate", label: "Referral rate", format: "percent" },
  ];

  const drivers: SharedOverviewData["drivers"] = {
    title: "High-intent cohorts driving manual review",
    subtitle: "Most recent logical day, ranked by referral rate",
    entityType: "cohort",
    entityKey: "intent_cohort",
    linkLabelKey: "intent_cohort",
    columns: driversColumns,
    rows: cohorts.map((row) => ({
      intent_cohort: row.intent_cohort,
      channel: row.channel,
      sessions_started: Number(row.sessions_started),
      submit_rate: row.submit_rate === null ? null : Number(row.submit_rate),
      submit_to_open_rate: row.submit_to_open_rate === null ? null : Number(row.submit_to_open_rate),
      referral_rate: row.referral_rate === null ? null : Number(row.referral_rate),
      has_scenario_activity: Number(row.has_scenario_activity),
    })),
  };

  const tables: SharedOverviewData["tables"] = {
    title: "Manual review vs. straight-through",
    subtitle: "By product, across the full run",
    columns: [
      { key: "review_path", label: "Path" },
      { key: "product_id", label: "Product" },
      { key: "applications", label: "Applications", format: "count" },
      { key: "approval_rate", label: "Approval rate", format: "percent" },
      { key: "avg_minutes_to_decision", label: "Avg minutes to decision", format: "count" },
    ],
    rows: review.map((row) => ({ ...row })),
  };

  return {
    kpis,
    series: seriesPayload,
    drivers,
    change: await change(),
    tables,
    meta: {},
  };
}

async function change(): Promise<SharedChangePayload | null> {
  const scenarioId = "A1_REVIEW_SPIKE";
  const state = await query<{ run_id: number }>(
    "SELECT run_id FROM demo_active_run WHERE singleton_id = 1"
  );
  const runId = state[0]?.run_id;
  if (!runId) return null;
  const execution = await scenarioExecution(runId, scenarioId);
  if (!execution?.window_start || !execution?.window_end) return null;

  const expected = await scenarioExpectedDeltas(scenarioId);
  const segment = (expected.segment as Record<string, string> | undefined) ?? {};
  const cohort = segment.intent_cohort ?? DEFAULT_COHORT;

  const [before, after] = await Promise.all([
    funnelBefore(execution.window_start, cohort),
    funnelBetween(execution.window_start, execution.window_end, cohort),
  ]);
  const lost = lostOpenings(before, after);

  return buildChangePayload({
    scenarioId,
    execution,
    expected,
    segmentLabel: cohort === "high_mobile" ? "High-intent mobile cohort" : `Intent cohort: ${cohort}`,
    specs: [
      { label: "Sessions started", key: "sessions_started", format: "count" },
      { label: "Applications submitted", key: "applications_submitted", format: "count" },
      { label: "Referred to review", key: "referred_to_review", format: "count" },
      { label: "Applications approved", key: "applications_approved", format: "count" },
      { label: "Openings lost vs. cohort baseline", key: "openings_lost", format: "count" },
      { label: "Annual value of lost openings", key: "lost_value_usd", format: "currency" },
    ],
    before: {
      sessions_started: before.sessions_started,
      applications_submitted: before.applications_submitted,
      referred_to_review: before.referred_to_review,
      applications_approved: before.applications_approved,
      openings_lost: null,
      lost_value_usd: null,
    },
    after: {
      sessions_started: after.sessions_started,
      applications_submitted: after.applications_submitted,
      referred_to_review: after.referred_to_review,
      applications_approved: after.applications_approved,
      openings_lost: lost?.openings ?? null,
      lost_value_usd: lost?.valueUsd ?? null,
    },
  });
}

/**
 * Openings the window would have produced at the cohort's own baseline
 * submit-to-open rate, minus the openings it did produce. Value prices each
 * application at its product's illustrative first-year value
 * (dim_product.annual_value_usd), so it reflects the product mix.
 */
function lostOpenings(
  before: FunnelMetrics,
  after: FunnelMetrics
): { openings: number; valueUsd: number } | null {
  const baselineSubmitted = Number(before.applications_submitted);
  if (!baselineSubmitted) return null;
  const rate = Number(before.applications_approved) / baselineSubmitted;
  const openings = Number(after.applications_submitted) * rate - Number(after.applications_approved);
  const valueUsd = Number(after.submitted_value_usd) * rate - Number(after.opened_value_usd);
  return {
    openings: Math.max(0, Math.round(openings * 10) / 10),
    valueUsd: Math.max(0, Math.round(valueUsd * 100) / 100),
  };
}

export async function entity(
  entityType: string,
  entityId: string
): Promise<SharedEntityData | null> {
  if (entityType !== "cohort") return null;
  const cohort = decodeURIComponent(entityId);

  const rows = await query<IntentCohortRow>(
    `SELECT * FROM aa_digital_intent_cohort WHERE intent_cohort = ? ORDER BY session_date`,
    [cohort]
  );
  if (!rows.length) return null;

  const sessions = await query<{
    session_id: string;
    channel: string;
    campaign: string;
    started_at: string;
    application_id: string | null;
    outcome_status: string | null;
  }>(
    `SELECT ds.session_id, ds.channel, ds.campaign, ds.started_at,
            a.application_id, a.outcome_status
     FROM digital_session ds
     JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = ds.run_id
     LEFT JOIN application a
       ON a.run_id = ds.run_id AND a.session_id = ds.session_id AND a.submitted_at <= ar.logical_time
     WHERE ds.intent_cohort = ? AND ds.started_at <= ar.logical_time
     ORDER BY ds.started_at DESC
     LIMIT 100`,
    [cohort]
  );

  const totals = rows.reduce(
    (acc, row) => ({
      sessions_started: acc.sessions_started + Number(row.sessions_started),
      applications_submitted: acc.applications_submitted + Number(row.applications_submitted),
      referred_to_review: acc.referred_to_review + Number(row.referred_to_review),
    }),
    { sessions_started: 0, applications_submitted: 0, referred_to_review: 0 }
  );

  return {
    entity_type: "cohort",
    entity_id: cohort,
    header: {
      title: `Intent cohort: ${cohort}`,
      subtitle: "Account-opening activity for this cohort across the run",
      pills: rows.some((row) => Number(row.has_scenario_activity))
        ? [{ label: "Scenario activity", tone: "accent" }]
        : undefined,
    },
    metrics: [
      {
        id: "sessions_started",
        title: "Sessions started",
        value: totals.sessions_started,
        baseline: null,
        delta: null,
        format: "count",
      },
      {
        id: "applications_submitted",
        title: "Applications submitted",
        value: totals.applications_submitted,
        baseline: null,
        delta: null,
        format: "count",
      },
      {
        id: "referred_to_review",
        title: "Referred to review",
        value: totals.referred_to_review,
        baseline: null,
        delta: null,
        format: "count",
      },
    ],
    sections: [
      {
        kind: "table",
        title: "Daily activity",
        columns: [
          { key: "session_date", label: "Date" },
          { key: "channel", label: "Channel" },
          { key: "sessions_started", label: "Sessions", format: "count" },
          { key: "submit_rate", label: "Submit rate", format: "percent" },
          { key: "referral_rate", label: "Referral rate", format: "percent" },
        ],
        rows: rows.map((row) => ({
          session_date: String(row.session_date).slice(0, 10),
          channel: row.channel,
          sessions_started: Number(row.sessions_started),
          submit_rate: row.submit_rate === null ? null : Number(row.submit_rate),
          referral_rate: row.referral_rate === null ? null : Number(row.referral_rate),
        })),
      },
      {
        kind: "table",
        title: "Recent sessions",
        columns: [
          { key: "started_at", label: "Started" },
          { key: "channel", label: "Channel" },
          { key: "campaign", label: "Campaign" },
          { key: "application_id", label: "Application" },
          { key: "outcome_status", label: "Outcome" },
        ],
        rows: sessions.map((row) => ({
          started_at: row.started_at,
          channel: row.channel,
          campaign: row.campaign,
          application_id: row.application_id ?? "—",
          outcome_status: row.outcome_status ?? "in progress",
        })),
      },
    ],
  };
}

export async function watermark(): Promise<{ last_event_time: string | null; events: number }> {
  const rows = await query<{ last_event_time: string | null; events: number }>(
    `SELECT MAX(ds.started_at) AS last_event_time, COUNT(*) AS events
     FROM digital_session ds ${ACTIVE_RUN_JOIN}`
  );
  return rows[0] ?? { last_event_time: null, events: 0 };
}
