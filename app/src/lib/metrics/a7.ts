/**
 * Deterministic A7 Credit and Exposure Management queries.
 *
 * No automated approval, decline, pricing, or adverse-action field exists
 * anywhere in this module (database/migrations/011_a7_credit.sql). The
 * pending-vs-booked comparison in `aa_portfolio_concentration` is explicitly
 * illustrative, per spec section 8.7, and is always labeled as such.
 * Approval, decline, and pricing stay with credit officers.
 */

import { query } from "../db";
import type {
  SharedChangePayload,
  SharedEntityData,
  SharedOverviewData,
} from "../apiTypes";
import { buildChangePayload, scenarioExecution, scenarioExpectedDeltas } from "./shared";

/** Illustrative per-segment (industry x geography) limit. Mirrors domains/a7-credit-risk/manifest.yaml. */
export const SEGMENT_CONCENTRATION_LIMIT = 0.25;

interface CreditOperationsRow {
  product_id: string;
  product_name: string;
  channel: string;
  submitted_date: string;
  application_count: number;
  manual_review_count: number;
  manual_review_rate: number | null;
  avg_hours_to_decision: number | null;
  requested_amount_total: number;
}

async function operations(days = 30): Promise<CreditOperationsRow[]> {
  return query<CreditOperationsRow>(
    `SELECT product_id, product_name, channel, submitted_date, application_count,
            manual_review_count, manual_review_rate, avg_hours_to_decision, requested_amount_total
     FROM aa_credit_operations
     WHERE submitted_date > DATE_SUB(
       (SELECT logical_time FROM demo_active_run WHERE singleton_id = 1), INTERVAL ${Math.trunc(days)} DAY
     )
     ORDER BY submitted_date`
  );
}

interface ConcentrationRow {
  industry_code: string;
  geography_id: string;
  existing_risk_grade: string;
  booked_outstanding_amount: number;
  booked_committed_amount: number;
  concentration_share: number;
  pending_amount: number;
  pro_forma_concentration_share: number;
}

async function concentration(): Promise<ConcentrationRow[]> {
  return query<ConcentrationRow>(
    `SELECT industry_code, geography_id, existing_risk_grade, booked_outstanding_amount,
            booked_committed_amount, concentration_share, pending_amount, pro_forma_concentration_share
     FROM aa_portfolio_concentration
     ORDER BY pro_forma_concentration_share DESC`
  );
}

interface ApplicationListRow {
  application_id: string;
  customer_id: string;
  product_id: string;
  channel: string;
  submitted_at: string;
  requested_amount: number;
  industry_code: string;
  geography_id: string;
  review_status: string;
  scenario_id: string | null;
}

/** Recent applications for the active run, newest first — the clickable proof path. */
async function recentApplications(limit = 25): Promise<ApplicationListRow[]> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
  return query<ApplicationListRow>(
    `SELECT ca.application_id, ca.customer_id, ca.product_id, ca.channel, ca.submitted_at,
            ca.requested_amount, ca.industry_code, ca.geography_id, ca.review_status, ca.scenario_id
     FROM credit_application ca
     JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = ca.run_id
     WHERE ca.submitted_at <= ar.logical_time
     ORDER BY ca.submitted_at DESC, ca.application_id DESC
     LIMIT ${safeLimit}`
  );
}

export async function overview(): Promise<SharedOverviewData> {
  const [ops, conc, applications] = await Promise.all([
    operations(30),
    concentration(),
    recentApplications(25),
  ]);

  const applicationCount = ops.reduce((sum, row) => sum + Number(row.application_count), 0);
  const manualReviewCount = ops.reduce((sum, row) => sum + Number(row.manual_review_count), 0);
  const requestedTotal = ops.reduce((sum, row) => sum + Number(row.requested_amount_total), 0);
  const weightedHours = ops.reduce(
    (sum, row) =>
      sum + (row.avg_hours_to_decision ?? 0) * Number(row.application_count),
    0
  );

  const byDay = new Map<string, { applications: number; manual_review: number }>();
  for (const row of ops) {
    const key = String(row.submitted_date).slice(0, 10);
    const bucket = byDay.get(key) ?? { applications: 0, manual_review: 0 };
    bucket.applications += Number(row.application_count);
    bucket.manual_review += Number(row.manual_review_count);
    byDay.set(key, bucket);
  }

  const kpis: SharedOverviewData["kpis"] = [
    {
      id: "application_count",
      title: "Applications",
      subtitle: "Last 30 logical days",
      value: applicationCount,
      baseline: null,
      delta: null,
      format: "count",
    },
    {
      id: "manual_review_rate",
      title: "Manual review rate",
      value: applicationCount ? manualReviewCount / applicationCount : null,
      baseline: null,
      delta: null,
      format: "percent",
      higherIsBetter: false,
    },
    {
      id: "avg_hours_to_decision",
      title: "Average hours to decision",
      value: applicationCount ? weightedHours / applicationCount : null,
      baseline: null,
      delta: null,
      format: "count",
    },
    {
      id: "requested_amount_total",
      title: "Requested amount",
      value: requestedTotal,
      baseline: null,
      delta: null,
      format: "currency",
    },
  ];

  const series: SharedOverviewData["series"] = {
    title: "Applications by day",
    subtitle: "Last 30 logical days, all products and channels",
    xKey: "submitted_date",
    series: [
      { key: "applications", label: "Applications", format: "count" },
      { key: "manual_review", label: "Manual review", format: "count" },
    ],
    points: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, bucket]) => ({
        submitted_date: date,
        applications: bucket.applications,
        manual_review: bucket.manual_review,
      })),
  };

  const drivers: SharedOverviewData["drivers"] = {
    title: "Portfolio concentration (illustrative)",
    subtitle: "Booked exposure vs. a pro forma view that includes pending applications",
    columns: [
      { key: "industry_code", label: "Industry" },
      { key: "geography_id", label: "Geography" },
      { key: "existing_risk_grade", label: "Risk grade" },
      { key: "booked_outstanding_amount", label: "Booked outstanding", format: "currency" },
      { key: "concentration_share", label: "Booked concentration", format: "percent" },
      { key: "pending_amount", label: "Pending amount", format: "currency" },
      { key: "pro_forma_concentration_share", label: "Pro forma (illustrative)", format: "percent" },
      { key: "limit_headroom", label: "Headroom to 25% limit", format: "percent" },
    ],
    rows: conc.map((row) => ({
      industry_code: row.industry_code,
      geography_id: row.geography_id,
      existing_risk_grade: row.existing_risk_grade,
      booked_outstanding_amount: Number(row.booked_outstanding_amount),
      concentration_share: Number(row.concentration_share),
      pending_amount: Number(row.pending_amount),
      pro_forma_concentration_share: Number(row.pro_forma_concentration_share),
      limit_headroom: SEGMENT_CONCENTRATION_LIMIT - Number(row.pro_forma_concentration_share),
    })),
  };

  const tables: SharedOverviewData["tables"] = {
    title: "Recent applications",
    subtitle: "Click an application id to open submitted evidence and verification status",
    entityType: "application",
    entityKey: "application_id",
    linkLabelKey: "application_id",
    columns: [
      { key: "application_id", label: "Application" },
      { key: "submitted_at", label: "Submitted" },
      { key: "industry_code", label: "Industry" },
      { key: "geography_id", label: "Geography" },
      { key: "channel", label: "Channel" },
      { key: "requested_amount", label: "Requested", format: "currency" },
      { key: "review_status", label: "Status" },
      { key: "scenario_tag", label: "Scenario" },
    ],
    rows: applications.map((row) => ({
      application_id: row.application_id,
      submitted_at: row.submitted_at,
      industry_code: row.industry_code,
      geography_id: row.geography_id,
      channel: row.channel,
      requested_amount: Number(row.requested_amount),
      review_status: row.review_status,
      scenario_tag: row.scenario_id ?? "baseline",
    })),
  };

  return {
    kpis,
    series,
    drivers,
    change: await change(),
    tables,
    meta: {
      notes:
        "Pro forma concentration and the 25% segment limit are illustrative only: they show what the book would look like if every pending application booked as requested. This is not a decision. Open an application id to inspect evidence.",
    },
  };
}

async function change(): Promise<SharedChangePayload | null> {
  const scenarioId = "A7_PENDING_EXPOSURE";
  const state = await query<{ run_id: number }>(
    "SELECT run_id FROM demo_active_run WHERE singleton_id = 1"
  );
  const runId = state[0]?.run_id;
  if (!runId) return null;
  const execution = await scenarioExecution(runId, scenarioId);
  if (!execution?.window_start || !execution?.window_end) return null;

  const expected = await scenarioExpectedDeltas(scenarioId);
  const segment = (expected.segment as Record<string, string> | undefined) ?? {};
  const industry = segment.industry_code ?? "TRANSPORTATION";
  const geography = segment.geography_id ?? "GEO-USCA";

  const conc = await concentration();
  const match = conc.find(
    (row) => row.industry_code === industry && row.geography_id === geography
  );

  return buildChangePayload({
    scenarioId,
    execution,
    expected,
    segmentLabel: "Transportation in California, illustrative",
    specs: [
      { label: "Pending amount", key: "pending_amount_usd", format: "currency" },
      { label: "Illustrative concentration", key: "pro_forma_concentration_share", format: "percent" },
      { label: "Headroom to 25% segment limit", key: "limit_headroom", format: "percent" },
      { label: "Booked exposure change", key: "booked_outstanding_delta_usd", format: "currency" },
    ],
    before: {
      pending_amount_usd: 0,
      pro_forma_concentration_share: match ? Number(match.concentration_share) : null,
      limit_headroom: match ? SEGMENT_CONCENTRATION_LIMIT - Number(match.concentration_share) : null,
      booked_outstanding_delta_usd: 0,
    },
    after: {
      pending_amount_usd: match ? Number(match.pending_amount) : null,
      pro_forma_concentration_share: match ? Number(match.pro_forma_concentration_share) : null,
      limit_headroom: match
        ? SEGMENT_CONCENTRATION_LIMIT - Number(match.pro_forma_concentration_share)
        : null,
      booked_outstanding_delta_usd: 0,
    },
  });
}

export async function entity(
  entityType: string,
  entityId: string
): Promise<SharedEntityData | null> {
  if (entityType !== "application") return null;
  const applicationId = decodeURIComponent(entityId);

  const header = await query<{
    application_id: string;
    customer_id: string;
    product_id: string;
    channel: string;
    submitted_at: string;
    requested_amount: number;
    industry_code: string;
    geography_id: string;
    review_status: string;
    was_manual_review: number;
    decision_time: string | null;
  }>(
    `SELECT ca.application_id, ca.customer_id, ca.product_id, ca.channel, ca.submitted_at,
            ca.requested_amount, ca.industry_code, ca.geography_id, ca.review_status,
            ca.was_manual_review, ca.decision_time
     FROM credit_application ca
     JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = ca.run_id
     WHERE ca.application_id = ?
     LIMIT 1`,
    [applicationId]
  );
  if (!header.length) return null;
  const row = header[0];

  const evidence = await query<{
    source_type: string;
    metric_name: string;
    metric_value: number;
    observed_at: string;
    verification_status: string;
    provenance_ref: string;
  }>(
    `SELECT source_type, metric_name, metric_value, observed_at, verification_status, provenance_ref
     FROM aa_credit_application_evidence
     WHERE application_id = ?
     ORDER BY observed_at`,
    [applicationId]
  );

  const missing = evidence.filter((item) => item.verification_status !== "verified");

  return {
    entity_type: "application",
    entity_id: applicationId,
    header: {
      title: `Application ${applicationId}`,
      subtitle: `${row.industry_code} · ${row.geography_id} · submitted ${row.submitted_at}`,
      pills: [
        { label: row.review_status, tone: row.review_status === "decided" ? "good" : "warn" },
        row.was_manual_review ? { label: "manual review", tone: "accent" } : { label: "straight-through" },
      ],
    },
    metrics: [
      {
        id: "requested_amount",
        title: "Requested amount",
        value: Number(row.requested_amount),
        baseline: null,
        delta: null,
        format: "currency",
      },
      {
        id: "evidence_count",
        title: "Evidence items",
        value: evidence.length,
        baseline: null,
        delta: null,
        format: "count",
        detail: missing.length ? `${missing.length} unverified` : "All verified",
      },
    ],
    sections: [
      {
        kind: "fields",
        title: "Application summary",
        fields: [
          { label: "Customer", value: row.customer_id, mono: true },
          { label: "Product", value: row.product_id },
          { label: "Channel", value: row.channel },
          { label: "Decision time", value: row.decision_time ?? "Pending" },
        ],
      },
      {
        kind: "table",
        title: "Submitted evidence",
        subtitle: "Observed metrics, not a decision",
        columns: [
          { key: "observed_at", label: "Observed" },
          { key: "source_type", label: "Source" },
          { key: "metric_name", label: "Metric" },
          { key: "metric_value", label: "Value" },
          { key: "verification_status", label: "Status" },
        ],
        rows: evidence.map((item) => ({
          observed_at: item.observed_at,
          source_type: item.source_type,
          metric_name: item.metric_name,
          metric_value: Number(item.metric_value),
          verification_status: item.verification_status,
        })),
      },
    ],
  };
}

export async function watermark(): Promise<{ last_event_time: string | null; events: number }> {
  const rows = await query<{ last_event_time: string | null; events: number }>(
    `SELECT MAX(ca.submitted_at) AS last_event_time, COUNT(*) AS events
     FROM credit_application ca
     JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = ca.run_id`
  );
  return rows[0] ?? { last_event_time: null, events: 0 };
}
