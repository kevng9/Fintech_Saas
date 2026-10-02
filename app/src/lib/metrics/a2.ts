/**
 * Deterministic A2 widget queries.
 *
 * Every anchor page renders from these queries, never from a model call, so
 * page availability never depends on Analyst latency. All time filters read
 * the demo logical clock from demo_active_run, so pausing the simulator
 * genuinely freezes the dashboard.
 */

import { query } from "../db";
import { latestExecution, parseJsonColumn, type ExecutionRecord } from "../demoState";

const ACTIVE_RUN_JOIN =
  "JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = pe.run_id";

export const AFFECTED_LANE = {
  processorId: "P2",
  cardNetwork: "Mastercard",
  issuerCountry: "GB",
} as const;

function minutes(value: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > 60 * 24 * 30) {
    throw new Error("Invalid window length");
  }
  return value;
}

export interface WindowMetrics {
  attempts: number;
  approvals: number;
  declines: number;
  timeout_declines: number;
  approval_rate: number | null;
  timeout_decline_rate: number | null;
  p95_latency_ms: number | null;
  avg_latency_ms: number | null;
  declined_amount: number;
  approved_amount: number;
}

const METRIC_COLUMNS = `
    COUNT(*) AS attempts,
    SUM(pe.approved) AS approvals,
    SUM(1 - pe.approved) AS declines,
    SUM(CASE WHEN pe.response_code = 'TIMEOUT' THEN 1 ELSE 0 END) AS timeout_declines,
    SUM(pe.approved) / COUNT(*) AS approval_rate,
    SUM(CASE WHEN pe.response_code = 'TIMEOUT' THEN 1 ELSE 0 END) / COUNT(*) AS timeout_decline_rate,
    APPROX_PERCENTILE(pe.latency_ms, 0.95) AS p95_latency_ms,
    AVG(pe.latency_ms) AS avg_latency_ms,
    SUM(CASE WHEN pe.approved = 0 THEN pe.amount_usd ELSE 0 END) AS declined_amount,
    SUM(CASE WHEN pe.approved = 1 THEN pe.amount_usd ELSE 0 END) AS approved_amount`;

const EMPTY_METRICS: WindowMetrics = {
  attempts: 0,
  approvals: 0,
  declines: 0,
  timeout_declines: 0,
  approval_rate: null,
  timeout_decline_rate: null,
  p95_latency_ms: null,
  avg_latency_ms: null,
  declined_amount: 0,
  approved_amount: 0,
};

/** Metrics for the trailing window that ends at the current logical time. */
export async function recentWindowMetrics(windowMinutes: number): Promise<WindowMetrics> {
  const span = minutes(windowMinutes);
  const rows = await query<WindowMetrics>(
    `SELECT ${METRIC_COLUMNS}
     FROM payment_event pe ${ACTIVE_RUN_JOIN}
     WHERE pe.event_time > DATE_SUB(ar.logical_time, INTERVAL ${span} MINUTE)
       AND pe.event_time <= ar.logical_time`
  );
  return rows[0]?.attempts ? rows[0] : EMPTY_METRICS;
}

/** Metrics for the seven logical days that precede the trailing window. */
export async function baselineWindowMetrics(windowMinutes: number): Promise<WindowMetrics> {
  const span = minutes(windowMinutes);
  const rows = await query<WindowMetrics>(
    `SELECT ${METRIC_COLUMNS}
     FROM payment_event pe ${ACTIVE_RUN_JOIN}
     WHERE pe.event_time <= DATE_SUB(ar.logical_time, INTERVAL ${span} MINUTE)
       AND pe.event_time > DATE_SUB(ar.logical_time, INTERVAL 7 DAY)`
  );
  return rows[0]?.attempts ? rows[0] : EMPTY_METRICS;
}

export interface HourlyPoint {
  hour_start: string;
  attempts: number;
  approval_rate: number;
  timeout_decline_rate: number;
  p95_latency_ms: number;
  avg_latency_ms: number;
}

export async function hourlySeries(hours = 24): Promise<HourlyPoint[]> {
  const span = minutes(hours * 60);
  return query<HourlyPoint>(
    `SELECT
        DATE_TRUNC('hour', pe.event_time) AS hour_start,
        COUNT(*) AS attempts,
        SUM(pe.approved) / COUNT(*) AS approval_rate,
        SUM(CASE WHEN pe.response_code = 'TIMEOUT' THEN 1 ELSE 0 END) / COUNT(*) AS timeout_decline_rate,
        APPROX_PERCENTILE(pe.latency_ms, 0.95) AS p95_latency_ms,
        AVG(pe.latency_ms) AS avg_latency_ms
     FROM payment_event pe ${ACTIVE_RUN_JOIN}
     WHERE pe.event_time > DATE_SUB(ar.logical_time, INTERVAL ${span} MINUTE)
       AND pe.event_time <= ar.logical_time
     GROUP BY DATE_TRUNC('hour', pe.event_time)
     ORDER BY hour_start`
  );
}

export interface LaneComparison {
  lane_key: string;
  processor_id: string;
  processor_name: string;
  rail: string;
  card_network: string;
  issuer_country: string;
  recent_attempts: number;
  recent_approval_rate: number | null;
  recent_timeout_rate: number | null;
  recent_p95_latency_ms: number | null;
  baseline_attempts: number;
  baseline_approval_rate: number | null;
  baseline_timeout_rate: number | null;
  baseline_p95_latency_ms: number | null;
  approval_rate_change: number | null;
  p95_latency_change_ms: number | null;
  contracted_sla_ms: number;
}

interface LaneBucketRow {
  bucket: "recent" | "baseline";
  processor_id: string;
  processor_name: string;
  rail: string;
  card_network: string;
  issuer_country: string;
  contracted_sla_ms: number;
  attempts: number;
  approvals: number;
  timeout_declines: number;
  p95_latency_ms: number;
}

/**
 * Ranks every processor / network / issuer-country lane by how far its recent
 * window has moved from its own prior seven-day baseline.
 */
export async function laneComparison(windowMinutes: number): Promise<LaneComparison[]> {
  const span = minutes(windowMinutes);
  const bucketSelect = (bucket: "recent" | "baseline", predicate: string) => `
    SELECT
        '${bucket}' AS bucket,
        pe.processor_id AS processor_id,
        dp.processor_name AS processor_name,
        pe.rail AS rail,
        pe.card_network AS card_network,
        pe.issuer_country AS issuer_country,
        dp.contracted_sla_ms AS contracted_sla_ms,
        COUNT(*) AS attempts,
        SUM(pe.approved) AS approvals,
        SUM(CASE WHEN pe.response_code = 'TIMEOUT' THEN 1 ELSE 0 END) AS timeout_declines,
        APPROX_PERCENTILE(pe.latency_ms, 0.95) AS p95_latency_ms
    FROM payment_event pe ${ACTIVE_RUN_JOIN}
    JOIN dim_processor dp ON dp.run_id = pe.run_id AND dp.processor_id = pe.processor_id
    WHERE ${predicate}
    GROUP BY pe.processor_id, dp.processor_name, pe.rail, pe.card_network,
             pe.issuer_country, dp.contracted_sla_ms`;

  const rows = await query<LaneBucketRow>(
    `${bucketSelect(
      "recent",
      `pe.event_time > DATE_SUB(ar.logical_time, INTERVAL ${span} MINUTE)
         AND pe.event_time <= ar.logical_time`
    )}
     UNION ALL
     ${bucketSelect(
       "baseline",
       `pe.event_time <= DATE_SUB(ar.logical_time, INTERVAL ${span} MINUTE)
          AND pe.event_time > DATE_SUB(ar.logical_time, INTERVAL 7 DAY)`
     )}`
  );

  const lanes = new Map<string, LaneComparison>();
  for (const row of rows) {
    const key = `${row.processor_id}|${row.card_network}|${row.issuer_country}`;
    const lane =
      lanes.get(key) ??
      ({
        lane_key: key,
        processor_id: row.processor_id,
        processor_name: row.processor_name,
        rail: row.rail,
        card_network: row.card_network,
        issuer_country: row.issuer_country,
        recent_attempts: 0,
        recent_approval_rate: null,
        recent_timeout_rate: null,
        recent_p95_latency_ms: null,
        baseline_attempts: 0,
        baseline_approval_rate: null,
        baseline_timeout_rate: null,
        baseline_p95_latency_ms: null,
        approval_rate_change: null,
        p95_latency_change_ms: null,
        contracted_sla_ms: Number(row.contracted_sla_ms),
      } satisfies LaneComparison);

    const attempts = Number(row.attempts);
    const approvalRate = attempts ? Number(row.approvals) / attempts : null;
    const timeoutRate = attempts ? Number(row.timeout_declines) / attempts : null;
    if (row.bucket === "recent") {
      lane.recent_attempts = attempts;
      lane.recent_approval_rate = approvalRate;
      lane.recent_timeout_rate = timeoutRate;
      lane.recent_p95_latency_ms = Number(row.p95_latency_ms);
    } else {
      lane.baseline_attempts = attempts;
      lane.baseline_approval_rate = approvalRate;
      lane.baseline_timeout_rate = timeoutRate;
      lane.baseline_p95_latency_ms = Number(row.p95_latency_ms);
    }
    lanes.set(key, lane);
  }

  const comparisons = [...lanes.values()].map((lane) => ({
    ...lane,
    approval_rate_change:
      lane.recent_approval_rate !== null && lane.baseline_approval_rate !== null
        ? lane.recent_approval_rate - lane.baseline_approval_rate
        : null,
    p95_latency_change_ms:
      lane.recent_p95_latency_ms !== null && lane.baseline_p95_latency_ms !== null
        ? lane.recent_p95_latency_ms - lane.baseline_p95_latency_ms
        : null,
  }));

  return comparisons.sort(
    (a, b) => (a.approval_rate_change ?? 0) - (b.approval_rate_change ?? 0)
  );
}

export interface DeclineMixRow {
  merchant_category: string;
  response_code: string;
  declines: number;
  declined_amount: number;
  avg_latency_ms: number;
}

export async function declineMix(windowMinutes: number, limit = 100): Promise<DeclineMixRow[]> {
  const span = minutes(windowMinutes);
  const cap = Math.min(Math.max(Math.trunc(limit), 1), 100);
  return query<DeclineMixRow>(
    `SELECT
        dm.merchant_category AS merchant_category,
        pe.response_code AS response_code,
        COUNT(*) AS declines,
        SUM(pe.amount_usd) AS declined_amount,
        AVG(pe.latency_ms) AS avg_latency_ms
     FROM payment_event pe ${ACTIVE_RUN_JOIN}
     JOIN dim_merchant dm ON dm.run_id = pe.run_id AND dm.merchant_id = pe.merchant_id
     WHERE pe.approved = 0
       AND pe.event_time > DATE_SUB(ar.logical_time, INTERVAL ${span} MINUTE)
       AND pe.event_time <= ar.logical_time
     GROUP BY dm.merchant_category, pe.response_code
     ORDER BY declines DESC
     LIMIT ${cap}`
  );
}

export interface LaneWindowMetrics extends WindowMetrics {
  lane_key: string;
}

async function laneMetricsBetween(
  lane: { processorId: string; cardNetwork: string; issuerCountry: string },
  from: string,
  to: string
): Promise<WindowMetrics> {
  const rows = await query<WindowMetrics>(
    `SELECT ${METRIC_COLUMNS}
     FROM payment_event pe ${ACTIVE_RUN_JOIN}
     WHERE pe.processor_id = ? AND pe.card_network = ? AND pe.issuer_country = ?
       AND pe.event_time >= ? AND pe.event_time < ?`,
    [lane.processorId, lane.cardNetwork, lane.issuerCountry, from, to]
  );
  return rows[0]?.attempts ? rows[0] : EMPTY_METRICS;
}

async function laneBaselineBefore(
  lane: { processorId: string; cardNetwork: string; issuerCountry: string },
  before: string
): Promise<WindowMetrics> {
  const rows = await query<WindowMetrics>(
    `SELECT ${METRIC_COLUMNS}
     FROM payment_event pe ${ACTIVE_RUN_JOIN}
     WHERE pe.processor_id = ? AND pe.card_network = ? AND pe.issuer_country = ?
       AND pe.scenario_id IS NULL
       AND pe.event_time >= DATE_SUB(?, INTERVAL 7 DAY)
       AND pe.event_time < ?`,
    [lane.processorId, lane.cardNetwork, lane.issuerCountry, before, before]
  );
  return rows[0]?.attempts ? rows[0] : EMPTY_METRICS;
}

function normalizeBaselineVolume(
  baseline: WindowMetrics,
  targetAttempts: number
): WindowMetrics {
  if (!baseline.attempts || !targetAttempts) return baseline;
  const factor = targetAttempts / Number(baseline.attempts);
  return {
    ...baseline,
    attempts: targetAttempts,
    approvals: Math.round(Number(baseline.approvals) * factor),
    declines: Math.round(Number(baseline.declines) * factor),
    timeout_declines: Math.round(Number(baseline.timeout_declines) * factor),
    declined_amount: Number(baseline.declined_amount) * factor,
    approved_amount: Number(baseline.approved_amount) * factor,
  };
}

export interface WhatChanged {
  scenarioId: string;
  windowStart: string;
  windowEnd: string;
  lane: string;
  baseline: WindowMetrics;
  after: WindowMetrics;
  expected: Record<string, unknown>;
}

/**
 * The "What changed?" callout: the affected lane inside the injected window
 * against the same lane's seeded history.
 */
export async function whatChanged(
  runId: number,
  scenarioId: string
): Promise<WhatChanged | null> {
  const execution: ExecutionRecord | null = await latestExecution(runId, scenarioId);
  if (!execution?.window_start || !execution?.window_end) return null;

  const scenarioRow = await query<{ expected_deltas: string }>(
    "SELECT expected_deltas FROM demo_scenario WHERE scenario_id = ?",
    [scenarioId]
  );
  const expected = parseJsonColumn<Record<string, unknown>>(
    scenarioRow[0]?.expected_deltas,
    {}
  );
  const segment = (expected.segment as Record<string, string> | undefined) ?? {};
  const lane = {
    processorId: segment.processor_id ?? AFFECTED_LANE.processorId,
    cardNetwork: segment.card_network ?? AFFECTED_LANE.cardNetwork,
    issuerCountry: segment.issuer_country ?? AFFECTED_LANE.issuerCountry,
  };

  const [rawBaseline, after] = await Promise.all([
    laneBaselineBefore(lane, execution.window_start),
    laneMetricsBetween(lane, execution.window_start, execution.window_end),
  ]);
  const baseline = normalizeBaselineVolume(rawBaseline, Number(after.attempts));

  return {
    scenarioId,
    windowStart: execution.window_start,
    windowEnd: execution.window_end,
    lane: `${lane.processorId} / ${lane.cardNetwork} / ${lane.issuerCountry}`,
    baseline,
    after,
    expected,
  };
}

export interface SegmentDetail {
  lane_key: string;
  processor_id: string;
  processor_name: string;
  rail: string;
  card_network: string;
  issuer_country: string;
  issuer_country_name: string | null;
  contracted_sla_ms: number;
  window: WindowMetrics;
  baseline: WindowMetrics;
  hourly: HourlyPoint[];
  events: PaymentSampleRow[];
}

export interface PaymentSampleRow {
  payment_id: string;
  event_time: string;
  processor_id: string;
  processor_name: string;
  rail: string;
  card_network: string;
  issuer_country: string;
  merchant_id: string;
  merchant_name: string;
  merchant_category: string;
  customer_id: string;
  amount: number;
  amount_usd: number;
  currency: string;
  response_code: string;
  approved: number;
  latency_ms: number;
  is_scenario_event: number;
  scenario_id: string | null;
}

const PAYMENT_SAMPLE_COLUMNS = [
  "payment_id",
  "event_time",
  "processor_id",
  "processor_name",
  "rail",
  "card_network",
  "issuer_country",
  "merchant_id",
  "merchant_name",
  "merchant_category",
  "customer_id",
  "amount",
  "amount_usd",
  "currency",
  "response_code",
  "approved",
  "latency_ms",
  "is_scenario_event",
  "scenario_id",
].join(", ");

export function parseLaneKey(laneKey: string) {
  const [processorId, cardNetwork, issuerCountry] = decodeURIComponent(laneKey).split("|");
  if (!processorId || !cardNetwork || !issuerCountry) return null;
  return { processorId, cardNetwork, issuerCountry };
}

export async function segmentDetail(
  laneKey: string,
  windowMinutes: number
): Promise<SegmentDetail | null> {
  const lane = parseLaneKey(laneKey);
  if (!lane) return null;
  const span = minutes(windowMinutes);

  const header = await query<{
    processor_name: string;
    rail: string;
    contracted_sla_ms: number;
    issuer_country_name: string | null;
  }>(
    `SELECT dp.processor_name AS processor_name, dp.rail AS rail,
            dp.contracted_sla_ms AS contracted_sla_ms, dg.country_name AS issuer_country_name
     FROM dim_processor dp
     JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = dp.run_id
     LEFT JOIN dim_geography dg ON dg.country = ?
     WHERE dp.processor_id = ?`,
    [lane.issuerCountry, lane.processorId]
  );
  if (!header.length) return null;

  const [windowMetrics, baseline, hourly, events] = await Promise.all([
    query<WindowMetrics>(
      `SELECT ${METRIC_COLUMNS}
       FROM payment_event pe ${ACTIVE_RUN_JOIN}
       WHERE pe.processor_id = ? AND pe.card_network = ? AND pe.issuer_country = ?
         AND pe.event_time > DATE_SUB(ar.logical_time, INTERVAL ${span} MINUTE)
         AND pe.event_time <= ar.logical_time`,
      [lane.processorId, lane.cardNetwork, lane.issuerCountry]
    ),
    query<WindowMetrics>(
      `SELECT ${METRIC_COLUMNS}
       FROM payment_event pe ${ACTIVE_RUN_JOIN}
       WHERE pe.processor_id = ? AND pe.card_network = ? AND pe.issuer_country = ?
         AND pe.event_time <= DATE_SUB(ar.logical_time, INTERVAL ${span} MINUTE)
         AND pe.event_time > DATE_SUB(ar.logical_time, INTERVAL 7 DAY)`,
      [lane.processorId, lane.cardNetwork, lane.issuerCountry]
    ),
    query<HourlyPoint>(
      `SELECT
          DATE_TRUNC('hour', pe.event_time) AS hour_start,
          COUNT(*) AS attempts,
          SUM(pe.approved) / COUNT(*) AS approval_rate,
          SUM(CASE WHEN pe.response_code = 'TIMEOUT' THEN 1 ELSE 0 END) / COUNT(*) AS timeout_decline_rate,
          APPROX_PERCENTILE(pe.latency_ms, 0.95) AS p95_latency_ms,
          AVG(pe.latency_ms) AS avg_latency_ms
       FROM payment_event pe ${ACTIVE_RUN_JOIN}
       WHERE pe.processor_id = ? AND pe.card_network = ? AND pe.issuer_country = ?
         AND pe.event_time > DATE_SUB(ar.logical_time, INTERVAL 24 HOUR)
         AND pe.event_time <= ar.logical_time
       GROUP BY DATE_TRUNC('hour', pe.event_time)
       ORDER BY hour_start`,
      [lane.processorId, lane.cardNetwork, lane.issuerCountry]
    ),
    query<PaymentSampleRow>(
      `SELECT ${PAYMENT_SAMPLE_COLUMNS} FROM aa_payment_event_sample
       WHERE processor_id = ? AND card_network = ? AND issuer_country = ?
       ORDER BY event_time DESC
       LIMIT 100`,
      [lane.processorId, lane.cardNetwork, lane.issuerCountry]
    ),
  ]);

  return {
    lane_key: `${lane.processorId}|${lane.cardNetwork}|${lane.issuerCountry}`,
    processor_id: lane.processorId,
    processor_name: header[0].processor_name,
    rail: header[0].rail,
    card_network: lane.cardNetwork,
    issuer_country: lane.issuerCountry,
    issuer_country_name: header[0].issuer_country_name,
    contracted_sla_ms: Number(header[0].contracted_sla_ms),
    window: windowMetrics[0]?.attempts ? windowMetrics[0] : EMPTY_METRICS,
    baseline: baseline[0]?.attempts ? baseline[0] : EMPTY_METRICS,
    hourly,
    events,
  };
}

export async function paymentDetail(paymentId: string): Promise<PaymentSampleRow | null> {
  const rows = await query<PaymentSampleRow>(
    `SELECT
        pe.payment_id, pe.event_time, pe.processor_id, dp.processor_name, pe.rail,
        pe.card_network, pe.issuer_country, pe.merchant_id, dm.merchant_name,
        dm.merchant_category, pe.customer_id, pe.amount, pe.amount_usd, pe.currency,
        pe.response_code,
        pe.approved, pe.latency_ms,
        CASE WHEN pe.scenario_id IS NULL THEN 0 ELSE 1 END AS is_scenario_event,
        pe.scenario_id
     FROM payment_event pe ${ACTIVE_RUN_JOIN}
     JOIN dim_processor dp ON dp.run_id = pe.run_id AND dp.processor_id = pe.processor_id
     JOIN dim_merchant dm ON dm.run_id = pe.run_id AND dm.merchant_id = pe.merchant_id
     WHERE pe.payment_id = ?
     LIMIT 1`,
    [paymentId]
  );
  return rows[0] ?? null;
}

export async function dataWatermark(): Promise<{ last_event_time: string | null; events: number }> {
  const rows = await query<{ last_event_time: string | null; events: number }>(
    `SELECT MAX(pe.event_time) AS last_event_time, COUNT(*) AS events
     FROM payment_event pe ${ACTIVE_RUN_JOIN}`
  );
  return rows[0] ?? { last_event_time: null, events: 0 };
}
