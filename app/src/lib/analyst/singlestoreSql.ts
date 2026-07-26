/**
 * SingleStore rejects some MySQL SQL patterns that Aura Analyst still emits.
 * Detect those failures so the chat proxy/UI can retry with a safer prompt.
 */

const PATTERNS = [
  /1706/,
  /group_concat with order by mixed with distinct/i,
  /group_concat.*order by.*distinct/i,
  /feature 'group_concat/i,
];

export function isUnsupportedSinglestoreSqlError(text: string | null | undefined): boolean {
  if (!text) return false;
  return PATTERNS.some((pattern) => pattern.test(text));
}

/** Appended on automatic retry after a dialect failure. */
export const SINGLESTORE_SQL_RETRY_HINT =
  "Retry with a different SQL shape that SingleStore accepts. " +
  "Do not use GROUP_CONCAT. Do not mix DISTINCT aggregates with ORDER BY. " +
  "Prefer a simple SELECT of detail rows (one row per evidence item or event), " +
  "then summarize verified vs missing items in prose from that row set.";

/**
 * Always attached to live Analyst prompts so the model avoids error 1706 even
 * before Domain instructions are republished in the Portal.
 */
export const SINGLESTORE_SQL_LIVE_HINT =
  "SQL constraint (SingleStore): never use GROUP_CONCAT with ORDER BY in the " +
  "same query as DISTINCT aggregates. Prefer detail-row SELECTs or simple " +
  "aggregations that do not mix those features.";
