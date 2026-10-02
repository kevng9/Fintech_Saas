/** Shapes returned by the demo API, shared by client components. */

export interface AnchorSummaryPayload {
  id: string;
  name: string;
  jobTitle: string;
  businessDecision: string;
  criticalBusinessIssue: string;
  takeaway: string;
  status: "available" | "planned";
  estimatedMinutes: number;
  primaryScenarioId: string | null;
  starterPrompts: string[];
  guardrailText: string;
  humanOwnership: string | null;
  analyst_configured: boolean;
  widget_count: number;
}

export interface ConfigPayload {
  app: { name: string; synthetic_data_notice: string };
  role: string;
  open_demo: boolean;
  personas: { id: string; label: string; emphasis: string }[];
  analyst: {
    mode: string;
    timeout_seconds: number;
    max_rows: number;
    max_message_chars: number;
  };
  simulator: { allowed_speeds: number[]; speed_note: string };
  fixture: { seed: number; epoch: string; baseline_days: number };
  anchors: AnchorSummaryPayload[];
}

export interface DemoStatePayload {
  run_id: number;
  logical_time: string;
  stream_status: "PREPARING" | "PAUSED" | "RUNNING" | "RESETTING" | "FAILED";
  speed_multiplier: number;
  sequence_no: number;
  minute_cursor: number;
  analyst_mode: string;
  state_version: number;
  leader_alive: boolean;
  leader_age_seconds: number | null;
  updated_at: string;
}

export interface RunPayload {
  run_id: number;
  seed: number;
  fixture_version: string;
  status: string;
  logical_epoch: string;
  baseline_from: string;
  baseline_checksum: string;
  row_counts: Record<string, number>;
}

export interface ScenarioPayload {
  scenario_id: string;
  anchor_id: string;
  name: string;
  description: string;
  metric_window: string;
  enabled: boolean;
  expected_deltas: {
    narrative?: string;
    segment?: Record<string, string>;
    baseline?: Record<string, number | string>;
    after?: Record<string, number | string>;
    tolerance?: Record<string, number>;
    rows_inserted?: Record<string, number>;
  };
}

export interface ExecutionPayload {
  scenario_id: string;
  execution_id: string;
  status: string;
  requested_at: string;
  completed_at: string | null;
  window_start: string | null;
  window_end: string | null;
  rows_inserted: Record<string, number>;
}

export interface StateEnvelope {
  role: string;
  state: DemoStatePayload;
  run: RunPayload | null;
  scenarios: ScenarioPayload[];
  executions: ExecutionPayload[];
  request_id: string;
}

export interface WindowMetricsPayload {
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

export interface WidgetMeta {
  id: string;
  title: string;
  subtitle?: string;
  metricFormat: "percent" | "milliseconds" | "count" | "currency" | "text";
  visualization: string;
  expectedBaseline: string;
  expectedScenarioDelta: string;
  proofMode: string;
  sourceTables: string[];
}

export interface KpiWidget {
  meta: WidgetMeta;
  value: number | null;
  baseline: number | null;
  delta: number | null;
  attempts?: number;
  avg_latency_ms?: number | null;
  timeout_declines?: number;
  declines?: number;
}

export interface HourlyPointPayload {
  hour_start: string;
  attempts: number;
  approval_rate: number;
  timeout_decline_rate: number;
  p95_latency_ms: number;
  avg_latency_ms: number;
}

export interface LanePayload {
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

export interface DeclineMixPayload {
  merchant_category: string;
  response_code: string;
  declines: number;
  declined_amount: number;
  avg_latency_ms: number;
}

export interface WhatChangedPayload {
  scenarioId: string;
  windowStart: string;
  windowEnd: string;
  lane: string;
  baseline: WindowMetricsPayload;
  after: WindowMetricsPayload;
  expected: ScenarioPayload["expected_deltas"];
}

export interface OverviewPayload {
  anchor: AnchorSummaryPayload;
  window_minutes: number;
  state: {
    run_id: number;
    logical_time: string;
    stream_status: string;
    speed_multiplier: number;
    state_version: number;
    leader_alive: boolean;
  };
  data: { last_event_time: string | null; events_in_run: number };
  widgets: {
    authorization_rate: KpiWidget;
    p95_latency: KpiWidget;
    timeout_share: KpiWidget;
    declined_value: KpiWidget;
    hourly_performance: { meta: WidgetMeta; points: HourlyPointPayload[] };
    lane_drivers: { meta: WidgetMeta; lanes: LanePayload[] };
    decline_mix: { meta: WidgetMeta; rows: DeclineMixPayload[] };
    what_changed: { meta: WidgetMeta; comparison: WhatChangedPayload | null };
  };
  request_id: string;
}

export interface PaymentSamplePayload {
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

export interface SegmentDetailPayload {
  entity_type: string;
  window_minutes: number;
  segment: {
    lane_key: string;
    processor_id: string;
    processor_name: string;
    rail: string;
    card_network: string;
    issuer_country: string;
    issuer_country_name: string | null;
    contracted_sla_ms: number;
    window: WindowMetricsPayload;
    baseline: WindowMetricsPayload;
    hourly: HourlyPointPayload[];
    events: PaymentSamplePayload[];
  };
  request_id: string;
}

export interface AnalystResultPayload {
  text: string | null;
  sql: { command: string; confidence_score: number | null; tables_used: string[] } | null;
  table: {
    columns: string[];
    rows: (string | number | null)[][];
    row_count: number;
    truncated: boolean;
  } | null;
  chart: { data: unknown[]; layout: Record<string, unknown> } | null;
  error: string | null;
}

export interface AnalystEnvelopePayload {
  source: "live" | "fixture";
  anchor_id: string;
  results: AnalystResultPayload[];
  session_id: string | null;
  trace_id: string | null;
  latency_ms: number;
  degraded_reason?: string;
  fixture?: {
    id: string;
    recorded_at: string;
    fixture_version: string;
    scenario_state: string;
  };
  request_id: string;
}

/**
 * Shared anchor shape (A1, A3-A8). A2 keeps its own richer payload above;
 * every other anchor renders through this generic contract and the
 * `components/anchors/*` widgets so a new anchor never needs a new page.
 */
export type SharedMetricFormat = "percent" | "milliseconds" | "count" | "currency" | "text";

export interface SharedKpiPayload {
  id: string;
  title: string;
  subtitle?: string;
  value: number | null;
  baseline: number | null;
  delta: number | null;
  format: SharedMetricFormat;
  higherIsBetter?: boolean;
  detail?: string;
  statusLabel?: string;
  statusTone?: "neutral" | "good" | "warn" | "bad" | "accent";
}

export interface SharedColumn {
  key: string;
  label: string;
  format?: SharedMetricFormat;
}

export interface SharedSeriesPayload {
  title: string;
  subtitle?: string;
  xKey: string;
  series: { key: string; label: string; format: SharedMetricFormat }[];
  points: Record<string, number | string | null>[];
}

export interface SharedDriversPayload {
  title: string;
  subtitle?: string;
  entityType?: string;
  entityKey?: string;
  linkLabelKey?: string;
  columns: SharedColumn[];
  rows: Record<string, unknown>[];
}

export interface SharedTablePayload {
  title: string;
  subtitle?: string;
  /** When set with entityKey + linkLabelKey, the label cell drills to entity detail. */
  entityType?: string;
  entityKey?: string;
  linkLabelKey?: string;
  columns: SharedColumn[];
  rows: Record<string, unknown>[];
}

export interface SharedChangeRow {
  label: string;
  key: string;
  format: SharedMetricFormat;
  before: number | null;
  after: number | null;
  expected: number | null;
  tolerance: number | null;
}

export interface SharedChangePayload {
  scenarioId: string;
  windowStart: string | null;
  windowEnd: string | null;
  segmentLabel: string;
  narrative?: string | null;
  rows: SharedChangeRow[];
}

export interface SharedOverviewData {
  kpis: SharedKpiPayload[];
  series: SharedSeriesPayload | null;
  drivers: SharedDriversPayload | null;
  change: SharedChangePayload | null;
  tables: SharedTablePayload | null;
  meta: { notes?: string };
}

export interface SharedOverviewPayload extends SharedOverviewData {
  anchor: AnchorSummaryPayload;
  window_minutes: number;
  state: {
    run_id: number;
    logical_time: string;
    stream_status: string;
    speed_multiplier: number;
    state_version: number;
    leader_alive: boolean;
  };
  data: { last_event_time: string | null; events_in_run: number };
  request_id: string;
}

export interface SharedEntitySection {
  kind: "table" | "timeline" | "fields";
  title: string;
  subtitle?: string;
  columns?: SharedColumn[];
  rows?: Record<string, unknown>[];
  fields?: { label: string; value: string; mono?: boolean }[];
}

export interface SharedEntityData {
  entity_type: string;
  entity_id: string;
  header: { title: string; subtitle?: string; pills?: { label: string; tone?: string }[] };
  metrics: SharedKpiPayload[];
  sections: SharedEntitySection[];
}

export interface SharedEntityPayload extends SharedEntityData {
  request_id: string;
}

export interface HealthPayload {
  status: string;
  checked_at: string;
  live_domains_complete?: boolean;
  checks: { id: string; ok: boolean; detail: string }[];
  state: Record<string, unknown> | null;
  data: { last_event_time: string | null; events: number } | null;
  scenario_executions: number;
  analyst: { mode: string; sessions_in_memory: number };
  fixture: { seed: number; epoch: string };
  anchors: {
    anchor_id: string;
    name: string;
    status: string;
    analyst_configured: boolean;
    fixture_count: number;
  }[];
}
