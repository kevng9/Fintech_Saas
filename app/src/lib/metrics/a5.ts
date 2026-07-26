/**
 * Deterministic A5 Dispute Resolution Lens (Disputes Operations) queries.
 *
 * SLA risk is computed from `due_at` against the demo logical clock, never
 * wall-clock time (database/migrations/009_a5_disputes.sql). Adjudication and
 * provisional credit stay with authorised agents.
 */

import { query } from "../db";
import type {
  SharedChangePayload,
  SharedEntityData,
  SharedOverviewData,
} from "../apiTypes";
import { buildChangePayload, scenarioExecution, scenarioExpectedDeltas } from "./shared";

interface SlaRiskTotals {
  open_dispute_count: number;
  sla_risk_count: number;
  disputed_amount_total: number;
  sla_risk_amount_total: number;
}

const EMPTY_TOTALS: SlaRiskTotals = {
  open_dispute_count: 0,
  sla_risk_count: 0,
  disputed_amount_total: 0,
  sla_risk_amount_total: 0,
};

async function slaTotals(): Promise<SlaRiskTotals> {
  const rows = await query<SlaRiskTotals>(
    `SELECT
        SUM(open_dispute_count) AS open_dispute_count,
        SUM(sla_risk_count) AS sla_risk_count,
        SUM(disputed_amount_total) AS disputed_amount_total,
        SUM(sla_risk_amount_total) AS sla_risk_amount_total
     FROM aa_dispute_sla_risk`
  );
  return rows[0] ?? EMPTY_TOTALS;
}

interface SlaRiskRow {
  opened_date: string;
  queue_id: string;
  reason_code: string;
  priority: string;
  open_dispute_count: number;
  sla_risk_count: number;
  sla_risk_amount_total: number;
  disputed_amount_total: number;
  nearest_due_at: string;
}

async function riskByQueue(limit = 20): Promise<SlaRiskRow[]> {
  return query<SlaRiskRow>(
    `SELECT opened_date, queue_id, reason_code, priority, open_dispute_count,
            sla_risk_count, sla_risk_amount_total, disputed_amount_total, nearest_due_at
     FROM aa_dispute_sla_risk
     ORDER BY sla_risk_count DESC, sla_risk_amount_total DESC
     LIMIT ${Math.max(1, Math.min(Math.trunc(limit), 200))}`
  );
}

interface QueueDriverRow {
  opened_date: string;
  queue_id: string;
  reason_code: string;
  dispute_count: number;
  disputed_amount_total: number;
  avg_disputed_amount: number;
  scenario_dispute_count: number;
}

async function queueDrivers(days = 30): Promise<QueueDriverRow[]> {
  return query<QueueDriverRow>(
    `SELECT opened_date, queue_id, reason_code, SUM(dispute_count) AS dispute_count,
            SUM(disputed_amount_total) AS disputed_amount_total,
            AVG(avg_disputed_amount) AS avg_disputed_amount,
            SUM(scenario_dispute_count) AS scenario_dispute_count
     FROM aa_dispute_queue_driver
     WHERE opened_date > DATE_SUB(
       (SELECT logical_time FROM demo_active_run WHERE singleton_id = 1), INTERVAL ${Math.trunc(days)} DAY
     )
     GROUP BY opened_date, queue_id, reason_code
     ORDER BY opened_date`
  );
}

export async function overview(): Promise<SharedOverviewData> {
  const [totals, riskRows, drivers30d] = await Promise.all([
    slaTotals(),
    riskByQueue(20),
    queueDrivers(30),
  ]);

  const kpis: SharedOverviewData["kpis"] = [
    {
      id: "open_dispute_count",
      title: "Open disputes",
      value: totals.open_dispute_count,
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
      id: "disputed_amount_total",
      title: "Total disputed value",
      value: totals.disputed_amount_total,
      baseline: null,
      delta: null,
      format: "currency",
      higherIsBetter: false,
    },
    {
      id: "sla_risk_amount_total",
      title: "Value at SLA risk",
      value: totals.sla_risk_amount_total,
      baseline: null,
      delta: null,
      format: "currency",
      higherIsBetter: false,
    },
  ];

  const seriesByDay = new Map<string, { queue_count: number; disputes: number }>();
  for (const row of drivers30d) {
    const key = String(row.opened_date).slice(0, 10);
    const bucket = seriesByDay.get(key) ?? { queue_count: 0, disputes: 0 };
    bucket.disputes += Number(row.dispute_count);
    seriesByDay.set(key, bucket);
  }

  const series: SharedOverviewData["series"] = {
    title: "Disputes opened by day",
    subtitle: "Last 30 logical days across every queue",
    xKey: "opened_date",
    series: [{ key: "disputes", label: "Disputes opened", format: "count" }],
    points: [...seriesByDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, bucket]) => ({ opened_date: date, disputes: bucket.disputes })),
  };

  const driverTable: SharedOverviewData["drivers"] = {
    title: "Disputes at risk of SLA breach",
    subtitle: "Ranked by count, then value at risk",
    entityType: "dispute",
    columns: [
      { key: "queue_id", label: "Queue" },
      { key: "reason_code", label: "Reason" },
      { key: "priority", label: "Priority" },
      { key: "open_dispute_count", label: "Open", format: "count" },
      { key: "sla_risk_count", label: "SLA risk", format: "count" },
      { key: "sla_risk_amount_total", label: "Value at risk", format: "currency" },
      { key: "nearest_due_at", label: "Nearest due" },
    ],
    rows: riskRows.map((row) => ({
      queue_id: row.queue_id,
      reason_code: row.reason_code,
      priority: row.priority,
      open_dispute_count: Number(row.open_dispute_count),
      sla_risk_count: Number(row.sla_risk_count),
      sla_risk_amount_total: Number(row.sla_risk_amount_total),
      nearest_due_at: row.nearest_due_at,
    })),
  };

  return {
    kpis,
    series,
    drivers: driverTable,
    change: await change(),
    tables: null,
    meta: {},
  };
}

async function change(): Promise<SharedChangePayload | null> {
  const scenarioId = "A5_CASE_SURGE";
  const state = await query<{ run_id: number }>(
    "SELECT run_id FROM demo_active_run WHERE singleton_id = 1"
  );
  const runId = state[0]?.run_id;
  if (!runId) return null;
  const execution = await scenarioExecution(runId, scenarioId);
  if (!execution?.window_start || !execution?.window_end) return null;

  const expected = await scenarioExpectedDeltas(scenarioId);
  const segment = (expected.segment as Record<string, string> | undefined) ?? {};
  const label = segment.reason_code ?? "MERCHANT_OUTAGE";

  const totals = await slaTotals();

  return buildChangePayload({
    scenarioId,
    execution,
    expected,
    segmentLabel: String(label),
    specs: [
      { label: "Queue depth", key: "open_dispute_count", format: "count" },
      { label: "SLA-risk count", key: "sla_risk_count", format: "count" },
    ],
    before: { open_dispute_count: null, sla_risk_count: null },
    after: {
      open_dispute_count: totals.open_dispute_count,
      sla_risk_count: totals.sla_risk_count,
    },
  });
}

export async function entity(
  entityType: string,
  entityId: string
): Promise<SharedEntityData | null> {
  if (entityType !== "dispute") return null;
  const disputeId = decodeURIComponent(entityId);

  const header = await query<{
    dispute_id: string;
    payment_id: string;
    customer_id: string;
    opened_at: string;
    due_at: string;
    status: string;
    reason_code: string;
    priority: string;
    queue_id: string;
    owner_id: string;
    disputed_amount: number;
  }>(
    `SELECT dc.dispute_id, dc.payment_id, dc.customer_id, dc.opened_at, dc.due_at, dc.status,
            dc.reason_code, dc.priority, dc.queue_id, dc.owner_id, dc.disputed_amount
     FROM dispute_case dc
     JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = dc.run_id
     WHERE dc.dispute_id = ?
     LIMIT 1`,
    [disputeId]
  );
  if (!header.length) return null;
  const row = header[0];

  const timeline = await query<{
    timeline_type: string;
    event_time: string;
    event_type: string;
    actor_type: string;
    amount: number | null;
  }>(
    `SELECT timeline_type, event_time, event_type, actor_type, amount
     FROM aa_dispute_timeline
     WHERE dispute_id = ?
     ORDER BY event_time`,
    [disputeId]
  );

  const slaBreached = new Date(row.due_at) < new Date();

  return {
    entity_type: "dispute",
    entity_id: disputeId,
    header: {
      title: `Dispute ${disputeId}`,
      subtitle: `${row.reason_code} · queue ${row.queue_id} · owner ${row.owner_id}`,
      pills: [
        { label: row.status, tone: row.status === "closed" ? "good" : "warn" },
        { label: row.priority, tone: row.priority === "high" ? "bad" : "neutral" },
      ],
    },
    metrics: [
      {
        id: "disputed_amount",
        title: "Disputed amount",
        value: Number(row.disputed_amount),
        baseline: null,
        delta: null,
        format: "currency",
      },
    ],
    sections: [
      {
        kind: "fields",
        title: "Case summary",
        fields: [
          { label: "Payment", value: row.payment_id, mono: true },
          { label: "Customer", value: row.customer_id, mono: true },
          { label: "Opened", value: row.opened_at },
          { label: "Due", value: row.due_at },
          { label: "SLA status", value: slaBreached ? "Past due" : "Within SLA" },
        ],
      },
      {
        kind: "timeline",
        title: "Case timeline",
        subtitle: "Case events, customer contact, and provisional credit",
        columns: [
          { key: "event_time", label: "Time" },
          { key: "timeline_type", label: "Type" },
          { key: "event_type", label: "Event" },
          { key: "actor_type", label: "Actor" },
          { key: "amount", label: "Amount", format: "currency" },
        ],
        rows: timeline.map((item) => ({
          event_time: item.event_time,
          timeline_type: item.timeline_type,
          event_type: item.event_type,
          actor_type: item.actor_type,
          amount: item.amount === null ? null : Number(item.amount),
        })),
      },
    ],
  };
}

export async function watermark(): Promise<{ last_event_time: string | null; events: number }> {
  const rows = await query<{ last_event_time: string | null; events: number }>(
    `SELECT MAX(dc.opened_at) AS last_event_time, COUNT(*) AS events
     FROM dispute_case dc
     JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = dc.run_id`
  );
  return rows[0] ?? { last_event_time: null, events: 0 };
}
