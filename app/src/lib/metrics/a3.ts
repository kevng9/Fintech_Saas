/**
 * Deterministic A3 Fraud Strategy Optimization (Fraud Strategy) queries.
 *
 * Every loss and false-positive number is derived from
 * `fraud_case.human_disposition`, never from the alert score alone
 * (database/migrations/007_a3_fraud.sql). Aura Analyst reads the curated
 * `aa_fraud_*` views; this module reads the same underlying facts so the
 * dashboard and Analyst never disagree.
 */

import { query } from "../db";
import type {
  SharedChangePayload,
  SharedEntityData,
  SharedOverviewData,
} from "../apiTypes";
import { buildChangePayload, scenarioExecution, scenarioExpectedDeltas } from "./shared";

const ACTIVE_RUN_JOIN =
  "JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = fc.run_id";

function minutes(value: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > 60 * 24 * 30) {
    throw new Error("Invalid window length");
  }
  return value;
}

interface LossMetrics {
  cases_total: number;
  confirmed_fraud_cases: number;
  legitimate_cases: number;
  open_cases: number;
  confirmed_loss_usd: number;
  false_positive_rate: number | null;
}

const EMPTY_LOSS: LossMetrics = {
  cases_total: 0,
  confirmed_fraud_cases: 0,
  legitimate_cases: 0,
  open_cases: 0,
  confirmed_loss_usd: 0,
  false_positive_rate: null,
};

const LOSS_COLUMNS = `
    COUNT(*) AS cases_total,
    SUM(CASE WHEN fc.human_disposition = 'confirmed_fraud' THEN 1 ELSE 0 END) AS confirmed_fraud_cases,
    SUM(CASE WHEN fc.human_disposition = 'legitimate' THEN 1 ELSE 0 END) AS legitimate_cases,
    SUM(CASE WHEN fc.human_disposition = 'open' THEN 1 ELSE 0 END) AS open_cases,
    SUM(CASE WHEN fc.human_disposition = 'confirmed_fraud' THEN fc.confirmed_loss ELSE 0 END) AS confirmed_loss_usd,
    SUM(CASE WHEN fc.human_disposition = 'legitimate' THEN 1 ELSE 0 END)
      / NULLIF(SUM(CASE WHEN fc.human_disposition IN ('confirmed_fraud', 'legitimate') THEN 1 ELSE 0 END), 0)
      AS false_positive_rate`;

async function lossBefore(until: string): Promise<LossMetrics> {
  const rows = await query<LossMetrics>(
    `SELECT ${LOSS_COLUMNS}
     FROM fraud_case fc ${ACTIVE_RUN_JOIN}
     WHERE fc.opened_at > DATE_SUB(?, INTERVAL 7 DAY) AND fc.opened_at <= ?`,
    [until, until]
  );
  return rows[0]?.cases_total ? rows[0] : EMPTY_LOSS;
}

async function lossBetween(from: string, to: string): Promise<LossMetrics> {
  const rows = await query<LossMetrics>(
    `SELECT ${LOSS_COLUMNS}
     FROM fraud_case fc ${ACTIVE_RUN_JOIN}
     WHERE fc.opened_at > ? AND fc.opened_at <= ?`,
    [from, to]
  );
  return rows[0]?.cases_total ? rows[0] : EMPTY_LOSS;
}

interface FraudTypeRow {
  channel: string;
  fraud_type: string;
  cases_total: number;
  confirmed_fraud_cases: number;
  confirmed_loss_usd: number;
  false_positive_rate: number | null;
}

async function lossByType(): Promise<FraudTypeRow[]> {
  return query<FraudTypeRow>(
    `SELECT channel, fraud_type, cases_total, confirmed_fraud_cases, confirmed_loss_usd, false_positive_rate
     FROM aa_fraud_loss_summary
     ORDER BY confirmed_loss_usd DESC`
  );
}

interface CaseReviewRow {
  case_id: string;
  alert_id: string;
  fraud_type: string;
  channel: string;
  score: number;
  opened_at: string;
  human_disposition: string;
  confirmed_loss_usd: number;
  evidence_count: number;
}

async function highestLossCases(limit = 12): Promise<CaseReviewRow[]> {
  return query<CaseReviewRow>(
    `SELECT case_id, alert_id, fraud_type, channel, score, opened_at, human_disposition,
            confirmed_loss_usd, evidence_count
     FROM aa_fraud_case_review
     ORDER BY confirmed_loss_usd DESC, score DESC
     LIMIT ${Math.max(1, Math.min(Math.trunc(limit), 100))}`
  );
}

export async function overview(windowMinutes: number): Promise<SharedOverviewData> {
  const span = minutes(windowMinutes);
  const [recent, baseline, byType, cases] = await Promise.all([
    query<LossMetrics>(
      `SELECT ${LOSS_COLUMNS}
       FROM fraud_case fc ${ACTIVE_RUN_JOIN}
       WHERE fc.opened_at > DATE_SUB(ar.logical_time, INTERVAL ${span} MINUTE)
         AND fc.opened_at <= ar.logical_time`
    ).then((rows) => (rows[0]?.cases_total ? rows[0] : EMPTY_LOSS)),
    query<LossMetrics>(
      `SELECT ${LOSS_COLUMNS}
       FROM fraud_case fc ${ACTIVE_RUN_JOIN}
       WHERE fc.opened_at <= DATE_SUB(ar.logical_time, INTERVAL ${span} MINUTE)
         AND fc.opened_at > DATE_SUB(ar.logical_time, INTERVAL 7 DAY)`
    ).then((rows) => (rows[0]?.cases_total ? rows[0] : EMPTY_LOSS)),
    lossByType(),
    highestLossCases(12),
  ]);

  const kpis: SharedOverviewData["kpis"] = [
    {
      id: "confirmed_loss",
      title: "Investigator-confirmed loss",
      subtitle: `Cases opened in the last ${span} minutes; chargeback losses post later`,
      value: recent.confirmed_loss_usd,
      baseline: null,
      delta: null,
      format: "currency",
      higherIsBetter: false,
    },
    {
      id: "false_positive_rate",
      title: "False-positive rate",
      subtitle: "Legitimate share of dispositioned alerts",
      value: recent.false_positive_rate,
      baseline: baseline.false_positive_rate,
      delta:
        recent.false_positive_rate !== null && baseline.false_positive_rate !== null
          ? recent.false_positive_rate - baseline.false_positive_rate
          : null,
      format: "percent",
      higherIsBetter: false,
    },
    {
      id: "confirmed_fraud_cases",
      title: "Confirmed fraud cases",
      value: recent.confirmed_fraud_cases,
      baseline: null,
      delta: null,
      format: "count",
      higherIsBetter: false,
    },
    {
      id: "open_cases",
      title: "Open cases",
      subtitle: "Awaiting investigator disposition",
      value: recent.open_cases,
      baseline: null,
      delta: null,
      format: "count",
      higherIsBetter: false,
    },
  ];

  const drivers: SharedOverviewData["drivers"] = {
    title: "Loss and false-positive rate by channel and fraud type",
    subtitle: "Ranked by confirmed loss",
    columns: [
      { key: "channel", label: "Channel" },
      { key: "fraud_type", label: "Fraud type" },
      { key: "cases_total", label: "Cases", format: "count" },
      { key: "confirmed_fraud_cases", label: "Confirmed fraud", format: "count" },
      { key: "confirmed_loss_usd", label: "Confirmed loss", format: "currency" },
      { key: "false_positive_rate", label: "False-positive rate", format: "percent" },
    ],
    rows: byType.map((row) => ({
      channel: row.channel,
      fraud_type: row.fraud_type,
      cases_total: Number(row.cases_total),
      confirmed_fraud_cases: Number(row.confirmed_fraud_cases),
      confirmed_loss_usd: Number(row.confirmed_loss_usd),
      false_positive_rate: row.false_positive_rate === null ? null : Number(row.false_positive_rate),
    })),
  };

  const tables: SharedOverviewData["tables"] = {
    title: "Highest-loss cases for investigator review",
    subtitle: "Ranked by confirmed loss, then alert score",
    columns: [
      { key: "case_id", label: "Case" },
      { key: "fraud_type", label: "Fraud type" },
      { key: "channel", label: "Channel" },
      { key: "score", label: "Score", format: "percent" },
      { key: "human_disposition", label: "Disposition" },
      { key: "confirmed_loss_usd", label: "Confirmed loss", format: "currency" },
      { key: "evidence_count", label: "Evidence items", format: "count" },
    ],
    rows: cases.map((row) => ({
      case_id: row.case_id,
      fraud_type: row.fraud_type,
      channel: row.channel,
      score: Number(row.score),
      human_disposition: row.human_disposition,
      confirmed_loss_usd: Number(row.confirmed_loss_usd),
      evidence_count: Number(row.evidence_count),
    })),
  };

  return {
    kpis,
    series: null,
    drivers,
    change: await change(),
    tables,
    meta: {
      notes: "Confirmed loss and false-positive rate only count cases with a human disposition.",
    },
  };
}

async function change(): Promise<SharedChangePayload | null> {
  const scenarioId = "A3_LOSS_CLUSTER";
  const state = await query<{ run_id: number }>(
    "SELECT run_id FROM demo_active_run WHERE singleton_id = 1"
  );
  const runId = state[0]?.run_id;
  if (!runId) return null;
  const execution = await scenarioExecution(runId, scenarioId);
  if (!execution?.window_start || !execution?.window_end) return null;

  const expected = await scenarioExpectedDeltas(scenarioId);
  const segment = (expected.segment as Record<string, string> | undefined) ?? {};
  const label =
    segment.fraud_type === "card_testing" && segment.channel === "card_not_present"
      ? "Card-testing burst, card not present"
      : segment.fraud_type ?? segment.channel ?? "Injected cohort";

  const [before, after] = await Promise.all([
    lossBefore(execution.window_start),
    lossBetween(execution.window_start, execution.window_end),
  ]);

  return buildChangePayload({
    scenarioId,
    execution,
    expected,
    segmentLabel: String(label),
    specs: [
      { label: "Cases opened", key: "cases_total", format: "count" },
      { label: "Confirmed fraud cases", key: "confirmed_fraud_cases", format: "count" },
      { label: "Confirmed loss", key: "confirmed_loss_usd", format: "currency" },
      { label: "False-positive rate", key: "false_positive_rate", format: "percent" },
    ],
    before: {
      cases_total: before.cases_total,
      confirmed_fraud_cases: before.confirmed_fraud_cases,
      confirmed_loss_usd: before.confirmed_loss_usd,
      false_positive_rate: before.false_positive_rate,
    },
    after: {
      cases_total: after.cases_total,
      confirmed_fraud_cases: after.confirmed_fraud_cases,
      confirmed_loss_usd: after.confirmed_loss_usd,
      false_positive_rate: after.false_positive_rate,
    },
  });
}

export async function entity(
  entityType: string,
  entityId: string
): Promise<SharedEntityData | null> {
  if (entityType !== "case") return null;
  const caseId = decodeURIComponent(entityId);

  const header = await query<CaseReviewRow & { notes: string | null; closed_at: string | null }>(
    `SELECT case_id, alert_id, fraud_type, channel, score, opened_at, closed_at,
            human_disposition, confirmed_loss_usd, evidence_count, notes
     FROM aa_fraud_case_review
     WHERE case_id = ?
     LIMIT 1`,
    [caseId]
  );
  if (!header.length) return null;
  const row = header[0];

  const evidence = await query<{
    merchant_name: string;
    merchant_category: string;
    customer_id: string;
    customer_risk_tier: string;
    account_age_days: number;
    device_type: string | null;
    device_risk_band: string | null;
    device_alert_count: number;
    customer_alert_count: number;
    amount_usd: number;
    reason_codes: string[] | string | null;
  }>(
    `SELECT merchant_name, merchant_category, customer_id, customer_risk_tier, account_age_days,
            device_type, device_risk_band, device_alert_count, customer_alert_count, amount_usd,
            reason_codes
     FROM aa_fraud_segment_evidence
     WHERE case_id = ?
     LIMIT 1`,
    [caseId]
  );

  const timeline = await query<{
    evidence_type: string;
    source_id: string;
    observed_value: string;
    observed_at: string;
  }>(
    `SELECT evidence_type, source_id, observed_value, observed_at
     FROM fraud_evidence fe
     JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = fe.run_id
     WHERE fe.case_id = ? AND fe.observed_at <= ar.logical_time
     ORDER BY fe.observed_at`,
    [caseId]
  );

  const proof = evidence[0];
  const reasonCodes = (() => {
    const raw = proof?.reason_codes;
    if (raw === null || raw === undefined) return "none recorded";
    const parsed = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
    return Array.isArray(parsed) ? parsed.join(", ") : String(parsed);
  })();

  return {
    entity_type: "case",
    entity_id: caseId,
    header: {
      title: `Case ${caseId}`,
      subtitle: `${row.fraud_type} · ${row.channel} · opened ${row.opened_at}`,
      pills: [
        {
          label: row.human_disposition,
          tone:
            row.human_disposition === "confirmed_fraud"
              ? "bad"
              : row.human_disposition === "legitimate"
                ? "good"
                : "neutral",
        },
      ],
    },
    metrics: [
      { id: "score", title: "Model score", value: Number(row.score), baseline: null, delta: null, format: "percent" },
      {
        id: "confirmed_loss_usd",
        title: "Confirmed loss",
        value: Number(row.confirmed_loss_usd),
        baseline: null,
        delta: null,
        format: "currency",
      },
      {
        id: "evidence_count",
        title: "Evidence items",
        value: Number(row.evidence_count),
        baseline: null,
        delta: null,
        format: "count",
      },
    ],
    sections: [
      {
        kind: "fields",
        title: "Case evidence",
        fields: proof
          ? [
              { label: "Alert reason codes", value: reasonCodes },
              { label: "Merchant", value: `${proof.merchant_name} (${proof.merchant_category})` },
              { label: "Customer", value: proof.customer_id, mono: true },
              { label: "Customer risk tier", value: proof.customer_risk_tier },
              { label: "Account age", value: `${proof.account_age_days} days` },
              { label: "Device type", value: proof.device_type ?? "unknown" },
              { label: "Device risk band", value: proof.device_risk_band ?? "unknown" },
              { label: "Device alert count", value: String(proof.device_alert_count) },
              { label: "Customer alert count", value: String(proof.customer_alert_count) },
              { label: "Attempt amount", value: `$${Number(proof.amount_usd).toLocaleString()}` },
            ]
          : [],
      },
      {
        kind: "timeline",
        title: "Evidence timeline",
        columns: [
          { key: "observed_at", label: "Observed" },
          { key: "evidence_type", label: "Type" },
          { key: "source_id", label: "Source" },
          { key: "observed_value", label: "Value" },
        ],
        rows: timeline.map((item) => ({ ...item })),
      },
      {
        kind: "fields",
        title: "Investigator notes",
        fields: [{ label: "Notes", value: row.notes ?? "No notes recorded." }],
      },
    ],
  };
}

export async function watermark(): Promise<{ last_event_time: string | null; events: number }> {
  const rows = await query<{ last_event_time: string | null; events: number }>(
    `SELECT MAX(fc.opened_at) AS last_event_time, COUNT(*) AS events
     FROM fraud_case fc ${ACTIVE_RUN_JOIN}`
  );
  return rows[0] ?? { last_event_time: null, events: 0 };
}
