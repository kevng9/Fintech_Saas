/**
 * SingleStore rejects some MySQL SQL patterns that Aura Analyst still emits.
 * Detect those failures so the chat proxy/UI can retry with a safer prompt.
 */

const PATTERNS = [
  /1706/,
  /subselect in aggregate functions/i,
  /subquery.*aggregate/i,
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
  "Do not put a subquery or subselect inside SUM, COUNT, AVG, MIN, MAX, or CASE expressions. " +
  "Resolve comparison timestamps in a CTE and join them before aggregating. " +
  "Do not use GROUP_CONCAT. Do not mix DISTINCT aggregates with ORDER BY. " +
  "Prefer a simple SELECT of detail rows (one row per evidence item or event), " +
  "then summarize verified vs missing items in prose from that row set.";

/**
 * Always attached to live Analyst prompts so the model avoids error 1706 even
 * before Domain instructions are republished in the Portal.
 */
export const SINGLESTORE_SQL_LIVE_HINT =
  "SQL constraints (SingleStore): never place a subquery or subselect inside an " +
  "aggregate or CASE expression; resolve comparison timestamps in a CTE and join them first. " +
  "Never use GROUP_CONCAT with ORDER BY in the same query as DISTINCT aggregates. " +
  "Prefer detail-row SELECTs or simple aggregations that do not mix those features.";

/**
 * Relative windows in presenter questions ("last 30 days") must end on the
 * demo clock. Aura otherwise substitutes the wall clock and the July baseline
 * returns no rows.
 */
export function logicalClockHint(logicalTime: string | null | undefined): string {
  const clock = logicalTime?.trim();
  if (!clock) {
    return (
      "Time window: this demo does not use the wall clock. Resolve phrases such as " +
      "\"last 30 days\", \"last 30 logical days\", \"today\", and \"this month\" against " +
      "demo_active_run.logical_time. Do not use NOW(), CURRENT_TIMESTAMP, or CURRENT_DATE."
    );
  }
  return (
    `Time window: the demo clock is ${clock} (demo_active_run.logical_time). ` +
    "Phrases such as \"last 30 days\", \"last 30 logical days\", \"today\", and \"this month\" " +
    "end at that logical time, not the real-world date. " +
    "Do not use NOW(), CURRENT_TIMESTAMP, or CURRENT_DATE. " +
    `For a last-30-days question, filter timestamps from DATE_SUB('${clock}', INTERVAL 30 DAY) through '${clock}'.`
  );
}
