/**
 * A3 "one query" proof: a single SQL statement that does vector similarity,
 * JSON reads, the exact rolling 10-minute device peak, relational joins, and
 * aggregation on live data. The statement is kept as labeled parts so the page
 * can show which part does which job.
 */

import { query } from "../db";

export type QueryJob = "vector" | "document" | "timeseries" | "relational" | "analytics" | "live";

export interface QueryPart {
  text: string;
  job: QueryJob | null;
}

export interface OneQueryMatch {
  case_id: string;
  human_disposition: string;
  channel: string;
  fraud_type: string;
  notes: string | null;
  note_similarity: number;
  velocity_breach: number;
  device_id: string | null;
  device_alert_count: number;
  peak_device_alerts_10m: number;
  merchant_name: string;
  account_age_days: number;
  confirmed_loss_usd: number;
  loss_across_matches: number;
  false_positives_across_matches: number;
}

export interface OneQueryResult {
  reference_case: string;
  reference_note: string | null;
  candidates: { case_id: string; fraud_type: string; human_disposition: string; confirmed_loss_usd: number }[];
  parts: QueryPart[];
  matches: OneQueryMatch[];
  elapsed_ms: number;
}

const CASE_ID = /^FCASE-[A-Z0-9-]{1,40}$/;
const PREFERRED_REFERENCE = "FCASE-A3LC-000";

const PARTS: QueryPart[] = [
  { text: "SELECT m.*,\n  ", job: null },
  { text: "SUM(m.confirmed_loss_usd) OVER () AS loss_across_matches", job: "analytics" },
  { text: ",\n  ", job: null },
  {
    text:
      "SUM(CASE WHEN m.human_disposition = 'legitimate' THEN 1 ELSE 0 END) OVER () AS false_positives_across_matches",
    job: "analytics",
  },
  { text: "\nFROM (\n  SELECT e.case_id, e.human_disposition, e.channel, e.fraud_type, fc.notes,\n    ", job: null },
  { text: "DOT_PRODUCT(fc.notes_embedding, ref.notes_embedding) AS note_similarity", job: "vector" },
  { text: ",\n    ", job: null },
  { text: "JSON_ARRAY_CONTAINS_STRING(e.reason_codes, 'velocity_breach') AS velocity_breach", job: "document" },
  { text: ",\n    ", job: null },
  { text: "e.device_id, e.merchant_name, e.account_age_days", job: "relational" },
  { text: ",\n    ", job: null },
  { text: "COALESCE(v.peak_alerts_10m, 0) AS peak_device_alerts_10m", job: "timeseries" },
  { text: ", ", job: null },
  { text: "v.through_logical_time", job: "live" },
  { text: ", e.device_alert_count, e.confirmed_loss_usd\n  ", job: null },
  { text: "FROM aa_fraud_segment_evidence e", job: "relational" },
  { text: "\n  ", job: null },
  { text: "JOIN demo_active_run ar ON ar.singleton_id = 1", job: "live" },
  { text: "\n  ", job: null },
  { text: "JOIN fraud_case fc ON fc.run_id = ar.run_id AND fc.case_id = e.case_id", job: "relational" },
  { text: "\n  JOIN (\n    SELECT ", job: null },
  { text: "notes_embedding", job: "vector" },
  { text: " FROM fraud_case\n    WHERE run_id = (SELECT run_id FROM demo_active_run WHERE singleton_id = 1)\n      AND case_id = ?\n  ) ref\n  ", job: null },
  { text: "LEFT JOIN aa_fraud_device_velocity v ON v.device_id = e.device_id", job: "timeseries" },
  { text: "\n  WHERE e.case_id <> ?\n    AND ", job: null },
  { text: "fc.opened_at <= ar.logical_time", job: "live" },
  { text: "\n  ", job: null },
  { text: "ORDER BY note_similarity DESC\n  LIMIT 8", job: "vector" },
  { text: "\n) m\nORDER BY m.note_similarity DESC", job: null },
];

const SQL = PARTS.map((part) => part.text).join("");

async function candidates(): Promise<OneQueryResult["candidates"]> {
  return query<OneQueryResult["candidates"][number]>(
    `SELECT case_id, fraud_type, human_disposition, confirmed_loss_usd
     FROM aa_fraud_case_review
     ORDER BY human_disposition = 'open' DESC, confirmed_loss_usd DESC, case_id
     LIMIT 40`
  );
}

export async function runOneQuery(requestedCase: string | null): Promise<OneQueryResult | null> {
  const options = await candidates();
  if (!options.length) return null;

  const valid = requestedCase && CASE_ID.test(requestedCase) ? requestedCase : null;
  const reference =
    (valid && options.some((option) => option.case_id === valid) && valid) ||
    options.find((option) => option.case_id === PREFERRED_REFERENCE)?.case_id ||
    options[0].case_id;

  const started = Date.now();
  const rows = await query<OneQueryMatch>(SQL, [reference, reference]);
  const elapsed = Date.now() - started;

  const note = await query<{ notes: string | null }>(
    `SELECT notes FROM aa_fraud_case_review WHERE case_id = ? LIMIT 1`,
    [reference]
  );

  return {
    reference_case: reference,
    reference_note: note[0]?.notes ?? null,
    candidates: options.map((option) => ({
      case_id: option.case_id,
      fraud_type: option.fraud_type,
      human_disposition: option.human_disposition,
      confirmed_loss_usd: Number(option.confirmed_loss_usd),
    })),
    parts: PARTS,
    matches: rows.map((row) => ({
      ...row,
      note_similarity: Number(row.note_similarity),
      velocity_breach: Number(row.velocity_breach),
      device_alert_count: Number(row.device_alert_count),
      peak_device_alerts_10m: Number(row.peak_device_alerts_10m),
      account_age_days: Number(row.account_age_days),
      confirmed_loss_usd: Number(row.confirmed_loss_usd),
      loss_across_matches: Number(row.loss_across_matches),
      false_positives_across_matches: Number(row.false_positives_across_matches),
    })),
    elapsed_ms: elapsed,
  };
}
