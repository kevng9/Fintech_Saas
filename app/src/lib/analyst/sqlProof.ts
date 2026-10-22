/**
 * Labels the six SingleStore workloads inside SQL Aura generated.
 * The statement itself is never rewritten.
 */

import type { QueryJob } from "@/lib/metrics/a3OneQuery";

export const SQL_JOBS: Record<QueryJob, { label: string; usually: string; color: string; tint: string }> = {
  vector: {
    label: "Vector similarity",
    usually: "a vector database",
    color: "#7c3aed",
    tint: "rgba(124, 58, 237, 0.14)",
  },
  document: {
    label: "JSON documents",
    usually: "a document store",
    color: "#b45309",
    tint: "rgba(217, 119, 6, 0.16)",
  },
  timeseries: {
    label: "Rolling time series",
    usually: "a time-series database",
    color: "#0e7490",
    tint: "rgba(8, 145, 178, 0.14)",
  },
  relational: {
    label: "Relational joins",
    usually: "an operational database",
    color: "#1d4ed8",
    tint: "rgba(37, 99, 235, 0.13)",
  },
  analytics: {
    label: "Aggregation",
    usually: "a data warehouse",
    color: "#047857",
    tint: "rgba(5, 150, 105, 0.14)",
  },
  live: {
    label: "Live data",
    usually: "a streaming pipeline or nightly ETL",
    color: "#be123c",
    tint: "rgba(225, 29, 72, 0.12)",
  },
};

const JOB_ORDER: QueryJob[] = ["vector", "document", "timeseries", "relational", "analytics", "live"];

export interface SqlSegment {
  text: string;
  job: QueryJob | null;
}

interface Hit {
  start: number;
  end: number;
  job: QueryJob;
}

const RULES: { job: QueryJob; pattern: RegExp }[] = [
  { job: "vector", pattern: /DOT_PRODUCT\s*\([^()]*\)|EUCLIDEAN_DISTANCE\s*\([^()]*\)|notes_embedding/gi },
  {
    job: "document",
    pattern: /JSON_[A-Z0-9_]+\s*\([^()]*\)|reason_codes/gi,
  },
  {
    job: "timeseries",
    pattern: /aa_fraud_device_velocity|peak_alerts_10m|TIME_BUCKET\s*\([^()]*\)|INTERVAL\s+\d+\s+MINUTE/gi,
  },
  { job: "relational", pattern: /\bJOIN\b/gi },
  { job: "analytics", pattern: /\bOVER\s*\([^()]*\)/gi },
  {
    job: "live",
    pattern: /through_logical_time|logical_time|demo_active_run/gi,
  },
];

function hitsFor(sql: string): Hit[] {
  const hits: Hit[] = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of sql.matchAll(rule.pattern)) {
      const start = match.index ?? 0;
      hits.push({ start, end: start + match[0].length, job: rule.job });
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const accepted: Hit[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start < cursor) continue;
    accepted.push(hit);
    cursor = hit.end;
  }
  return accepted;
}

/** Split generated SQL into plain and capability-labeled segments. */
export function segmentSql(sql: string): SqlSegment[] {
  const hits = hitsFor(sql);
  const segments: SqlSegment[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start > cursor) segments.push({ text: sql.slice(cursor, hit.start), job: null });
    segments.push({ text: sql.slice(hit.start, hit.end), job: hit.job });
    cursor = hit.end;
  }
  if (cursor < sql.length) segments.push({ text: sql.slice(cursor), job: null });
  return segments;
}

export function capabilitiesInSql(sql: string): QueryJob[] {
  const found = new Set(hitsFor(sql).map((hit) => hit.job));
  return JOB_ORDER.filter((job) => found.has(job));
}

/**
 * A new demo run invalidates prior answers. A scenario phase change must keep
 * those answers on screen and only drop the Aura session, so the next question
 * is not answered from the baseline conversation.
 */
export function analystResetFor(event: "run" | "phase"): { clearTurns: boolean; resetSession: boolean } {
  if (event === "run") return { clearTurns: true, resetSession: true };
  return { clearTurns: false, resetSession: true };
}
