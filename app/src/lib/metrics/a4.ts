/**
 * Deterministic A4 Financial Crime Operations (AML Operations) queries.
 *
 * No predicted disposition is stored or exposed anywhere in this module: it
 * reports backlog age, priority, and evidence completeness only
 * (database/migrations/008_a4_aml.sql). Disposition and filing decisions stay
 * with AML investigators.
 */

import { query } from "../db";
import type {
  SharedChangePayload,
  SharedEntityData,
  SharedOverviewData,
} from "../apiTypes";
import { buildChangePayload, scenarioExecution, scenarioExpectedDeltas } from "./shared";

const ACTIVE_RUN_JOIN =
  "JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = aa.run_id";

interface BacklogMetrics {
  open_alert_count: number;
  high_priority_count: number;
  sla_risk_count: number;
  avg_age_hours: number | null;
}

const EMPTY_BACKLOG: BacklogMetrics = {
  open_alert_count: 0,
  high_priority_count: 0,
  sla_risk_count: 0,
  avg_age_hours: null,
};

async function backlogTotals(): Promise<BacklogMetrics> {
  const rows = await query<BacklogMetrics>(
    `SELECT
        COUNT(*) AS open_alert_count,
        SUM(CASE WHEN aa.priority = 'high' THEN 1 ELSE 0 END) AS high_priority_count,
        SUM(CASE WHEN aa.sla_due_at <= DATE_ADD(ar.logical_time, INTERVAL 24 HOUR) THEN 1 ELSE 0 END) AS sla_risk_count,
        AVG(TIMESTAMPDIFF(HOUR, aa.created_at, ar.logical_time)) AS avg_age_hours
     FROM aml_alert aa ${ACTIVE_RUN_JOIN}
     WHERE aa.created_at <= ar.logical_time AND aa.status <> 'closed'`
  );
  return rows[0] ?? EMPTY_BACKLOG;
}

interface BacklogByQueueRow {
  rule_id: string;
  risk_band: string;
  assigned_queue: string;
  priority: string;
  open_alert_count: number;
  high_priority_count: number;
  sla_risk_count: number;
  avg_age_hours: number | null;
  oldest_alert_at: string;
}

async function backlogByQueue(): Promise<BacklogByQueueRow[]> {
  return query<BacklogByQueueRow>(
    `SELECT rule_id, risk_band, assigned_queue, priority, open_alert_count,
            high_priority_count, sla_risk_count, avg_age_hours, oldest_alert_at
     FROM aa_aml_backlog
     ORDER BY sla_risk_count DESC, open_alert_count DESC`
  );
}

interface EntityActivityRow {
  customer_id: string;
  customer_risk_tier: string;
  account_id: string;
  risk_band: string;
  assigned_queue: string;
  linked_transaction_count: number;
  linked_transaction_amount_usd: number;
  distinct_counterparties: number;
  distinct_geographies: number;
  prior_case_count: number;
}

async function topEntities(limit = 12): Promise<EntityActivityRow[]> {
  return query<EntityActivityRow>(
    `SELECT * FROM aa_aml_entity_activity
     ORDER BY linked_transaction_amount_usd DESC
     LIMIT ${Math.max(1, Math.min(Math.trunc(limit), 100))}`
  );
}

/** No windowMinutes filter: the backlog view is a point-in-time snapshot. */
export async function overview(): Promise<SharedOverviewData> {
  const [totals, byQueue, entities] = await Promise.all([
    backlogTotals(),
    backlogByQueue(),
    topEntities(12),
  ]);

  const kpis: SharedOverviewData["kpis"] = [
    {
      id: "open_alert_count",
      title: "Open alerts",
      subtitle: "Not yet closed",
      value: totals.open_alert_count,
      baseline: null,
      delta: null,
      format: "count",
      higherIsBetter: false,
    },
    {
      id: "high_priority_count",
      title: "High-priority alerts",
      value: totals.high_priority_count,
      baseline: null,
      delta: null,
      format: "count",
      higherIsBetter: false,
    },
    {
      id: "sla_risk_count",
      title: "At risk of SLA breach",
      subtitle: "Due within the next 24 logical hours",
      value: totals.sla_risk_count,
      baseline: null,
      delta: null,
      format: "count",
      higherIsBetter: false,
    },
    {
      id: "avg_age_hours",
      title: "Average alert age",
      subtitle: "Hours since creation, open alerts only",
      value: totals.avg_age_hours,
      baseline: null,
      delta: null,
      format: "count",
      higherIsBetter: false,
    },
  ];

  const drivers: SharedOverviewData["drivers"] = {
    title: "Backlog by rule, risk band, and queue",
    subtitle: "Ranked by SLA risk, then volume",
    columns: [
      { key: "rule_id", label: "Rule" },
      { key: "risk_band", label: "Risk band" },
      { key: "assigned_queue", label: "Queue" },
      { key: "priority", label: "Priority" },
      { key: "open_alert_count", label: "Open", format: "count" },
      { key: "sla_risk_count", label: "SLA risk", format: "count" },
      { key: "avg_age_hours", label: "Avg age (hrs)", format: "count" },
    ],
    rows: byQueue.map((row) => ({
      rule_id: row.rule_id,
      risk_band: row.risk_band,
      assigned_queue: row.assigned_queue,
      priority: row.priority,
      open_alert_count: Number(row.open_alert_count),
      sla_risk_count: Number(row.sla_risk_count),
      avg_age_hours: row.avg_age_hours === null ? null : Number(row.avg_age_hours),
    })),
  };

  const tables: SharedOverviewData["tables"] = {
    title: "Entities with the highest linked transaction value",
    subtitle: "Counterparties, geographies, and prior case history",
    columns: [
      { key: "customer_id", label: "Customer" },
      { key: "customer_risk_tier", label: "Risk tier" },
      { key: "assigned_queue", label: "Queue" },
      { key: "linked_transaction_count", label: "Linked txns", format: "count" },
      { key: "linked_transaction_amount_usd", label: "Linked value", format: "currency" },
      { key: "distinct_counterparties", label: "Counterparties", format: "count" },
      { key: "distinct_geographies", label: "Geographies", format: "count" },
      { key: "prior_case_count", label: "Prior cases", format: "count" },
    ],
    rows: entities.map((row) => ({
      customer_id: row.customer_id,
      customer_risk_tier: row.customer_risk_tier,
      assigned_queue: row.assigned_queue,
      linked_transaction_count: Number(row.linked_transaction_count),
      linked_transaction_amount_usd: Number(row.linked_transaction_amount_usd),
      distinct_counterparties: Number(row.distinct_counterparties),
      distinct_geographies: Number(row.distinct_geographies),
      prior_case_count: Number(row.prior_case_count),
    })),
  };

  return {
    kpis,
    series: null,
    drivers,
    change: await change(),
    tables,
    meta: {
      notes: "No predicted disposition is generated. Alert disposition and SAR filing stay with AML investigators.",
    },
  };
}

async function change(): Promise<SharedChangePayload | null> {
  const scenarioId = "A4_CORRESPONDENT_SPIKE";
  const state = await query<{ run_id: number }>(
    "SELECT run_id FROM demo_active_run WHERE singleton_id = 1"
  );
  const runId = state[0]?.run_id;
  if (!runId) return null;
  const execution = await scenarioExecution(runId, scenarioId);
  if (!execution?.window_start || !execution?.window_end) return null;

  const expected = await scenarioExpectedDeltas(scenarioId);
  const injected = await query<{ alerts: number; links: number; evidence: number }>(
    `SELECT
        (SELECT COUNT(*) FROM aml_alert WHERE run_id = ? AND scenario_id = ?) AS alerts,
        (SELECT COUNT(*) FROM aml_alert_transaction WHERE run_id = ? AND scenario_id = ?) AS links,
        (SELECT COUNT(*) FROM aml_evidence WHERE run_id = ? AND scenario_id = ?) AS evidence`,
    [runId, scenarioId, runId, scenarioId, runId, scenarioId]
  );
  const row = injected[0];

  return buildChangePayload({
    scenarioId,
    execution,
    expected,
    segmentLabel: "New correspondent-banking alert",
    specs: [
      { label: "New high-priority alerts", key: "high_priority_delta", format: "count" },
      { label: "Linked transactions", key: "linked_transaction_count", format: "count" },
      { label: "Evidence records", key: "evidence_delta", format: "count" },
    ],
    before: { high_priority_delta: 0, linked_transaction_count: 0, evidence_delta: 0 },
    after: {
      high_priority_delta: Number(row?.alerts ?? 0),
      linked_transaction_count: Number(row?.links ?? 0),
      evidence_delta: Number(row?.evidence ?? 0),
    },
  });
}

export async function entity(
  entityType: string,
  entityId: string
): Promise<SharedEntityData | null> {
  if (entityType !== "alert") return null;
  const alertId = decodeURIComponent(entityId);

  const header = await query<{
    alert_id: string;
    customer_id: string;
    account_id: string;
    rule_id: string;
    priority: string;
    risk_band: string;
    created_at: string;
    sla_due_at: string;
    status: string;
    assigned_queue: string;
  }>(
    `SELECT aa.alert_id, aa.customer_id, aa.account_id, aa.rule_id, aa.priority, aa.risk_band,
            aa.created_at, aa.sla_due_at, aa.status, aa.assigned_queue
     FROM aml_alert aa
     JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = aa.run_id
     WHERE aa.alert_id = ?
     LIMIT 1`,
    [alertId]
  );
  if (!header.length) return null;
  const row = header[0];

  const activity = await query<EntityActivityRow>(
    `SELECT * FROM aa_aml_entity_activity WHERE account_id = ? LIMIT 1`,
    [row.account_id]
  );

  const evidence = await query<{
    source_type: string;
    source_id: string;
    observed_at: string;
    fact_text: string;
    completeness_status: string;
    is_scenario_event: number;
  }>(
    `SELECT source_type, source_id, observed_at, fact_text, completeness_status, is_scenario_event
     FROM aa_aml_alert_evidence
     WHERE alert_id = ?
     ORDER BY observed_at`,
    [alertId]
  );

  const missing = evidence.filter((item) => item.completeness_status !== "complete");
  const proof = activity[0];

  return {
    entity_type: "alert",
    entity_id: alertId,
    header: {
      title: `Alert ${alertId}`,
      subtitle: `${row.rule_id} · ${row.risk_band} risk · queue ${row.assigned_queue}`,
      pills: [
        { label: row.priority, tone: row.priority === "high" ? "bad" : "neutral" },
        { label: row.status, tone: row.status === "closed" ? "good" : "warn" },
      ],
    },
    metrics: [
      {
        id: "linked_transaction_amount_usd",
        title: "Linked transaction value",
        value: proof ? Number(proof.linked_transaction_amount_usd) : null,
        baseline: null,
        delta: null,
        format: "currency",
      },
      {
        id: "distinct_counterparties",
        title: "Distinct counterparties",
        value: proof ? Number(proof.distinct_counterparties) : null,
        baseline: null,
        delta: null,
        format: "count",
      },
      {
        id: "prior_case_count",
        title: "Prior cases",
        value: proof ? Number(proof.prior_case_count) : null,
        baseline: null,
        delta: null,
        format: "count",
      },
    ],
    sections: [
      {
        kind: "fields",
        title: "Alert summary",
        fields: [
          { label: "Customer", value: row.customer_id, mono: true },
          { label: "Account", value: row.account_id, mono: true },
          { label: "Created", value: row.created_at },
          { label: "SLA due", value: row.sla_due_at },
          {
            label: "Missing evidence",
            value: missing.length ? `${missing.length} item(s) incomplete` : "None recorded",
          },
        ],
      },
      {
        kind: "timeline",
        title: "Evidence",
        columns: [
          { key: "observed_at", label: "Observed" },
          { key: "source_type", label: "Source type" },
          { key: "source_id", label: "Source" },
          { key: "fact_text", label: "Fact" },
          { key: "completeness_status", label: "Completeness" },
        ],
        rows: evidence.map((item) => ({ ...item })),
      },
    ],
  };
}

export async function watermark(): Promise<{ last_event_time: string | null; events: number }> {
  const rows = await query<{ last_event_time: string | null; events: number }>(
    `SELECT MAX(aa.created_at) AS last_event_time, COUNT(*) AS events
     FROM aml_alert aa ${ACTIVE_RUN_JOIN}`
  );
  return rows[0] ?? { last_event_time: null, events: 0 };
}
