export interface AnalystTable {
  columns: string[];
  rows: (string | number | null)[][];
  row_count: number;
  truncated: boolean;
}

export interface AnalystSqlInfo {
  command: string;
  confidence_score: number | null;
  tables_used: string[];
}

export interface AnalystResult {
  text: string | null;
  sql: AnalystSqlInfo | null;
  table: AnalystTable | null;
  chart: { data: unknown[]; layout: Record<string, unknown> } | null;
  error: string | null;
}

export type AnalystSource = "live" | "fixture";

export interface AnalystEnvelope {
  source: AnalystSource;
  anchor_id: string;
  results: AnalystResult[];
  session_id: string | null;
  trace_id: string | null;
  latency_ms: number;
  fixture?: {
    id: string;
    recorded_at: string;
    fixture_version: string;
    scenario_state: string;
  };
  degraded_reason?: string;
}
