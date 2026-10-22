/**
 * SingleStore rejects some MySQL SQL patterns that Aura Analyst still emits.
 * Detect those failures so the chat proxy/UI can retry with a safer prompt.
 */

const PATTERNS = [
  /1706/,
  /1749/,
  /1994/,
  /1064/,
  /syntax; check the manual/i,
  /scalar subselect/i,
  /non-scalar value/i,
  /used as a scalar/i,
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
  "JSON_TO_ARRAY returns a table. Never use it in SELECT, WHERE, GROUP BY, ORDER BY, or an aggregate. " +
  "Unnest reason codes with JOIN TABLE(JSON_TO_ARRAY(e.reason_codes)) rc and " +
  "TRIM(BOTH '\"' FROM rc.table_col) AS reason_code. " +
  "To test one known code, use JSON_ARRAY_CONTAINS_STRING(e.reason_codes, 'code') instead. " +
  "Error 1749: never put a scalar subquery inside ORDER BY, GROUP BY, or DOT_PRODUCT. " +
  "Join the reference row: JOIN aa_fraud_case_notes ref ON ref.case_id = 'FCASE-...' " +
  "and ORDER BY DOT_PRODUCT(n.notes_embedding, ref.notes_embedding) DESC. " +
  "Error 1064 near an empty token means the statement was cut off. " +
  "For an exact peak in any rolling 10-minute interval, join aa_fraud_device_velocity; " +
  "do not substitute fixed TIME_BUCKET intervals. " +
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
  "JSON_TO_ARRAY is table-valued and causes error 1994 when used as a scalar. " +
  "Never select, filter, group, or aggregate JSON_TO_ARRAY(reason_codes). " +
  "Unnest with JOIN TABLE(JSON_TO_ARRAY(e.reason_codes)) rc and read " +
  "TRIM(BOTH '\"' FROM rc.table_col). Test one code with JSON_ARRAY_CONTAINS_STRING. " +
  "Never put a scalar subquery inside ORDER BY, GROUP BY, or DOT_PRODUCT (error 1749). " +
  "Join aa_fraud_case_notes ref on the reference case_id and rank with " +
  "DOT_PRODUCT(n.notes_embedding, ref.notes_embedding). " +
  "Use aa_fraud_device_velocity for the peak in any rolling 10-minute interval; " +
  "its through_logical_time is the enforced cutoff. " +
  "Prefer detail-row SELECTs or simple aggregations that do not mix those features.";

/** Extra schema guidance for the six-workload fraud question. */
export function fraudMultiModelHint(anchorId: string, message: string): string {
  if (anchorId !== "a3") return "";
  const asksForEmbeddings = /embed/i.test(message);
  const asksForReasonCodes = /reason code/i.test(message);
  const asksForVelocity = /10-minute|10 minute/i.test(message);
  if (!asksForEmbeddings || !asksForReasonCodes || !asksForVelocity) return "";
  return (
    "Build the query independently from the curated views. For the exact peak in any " +
    "rolling 10-minute interval, join aa_fraud_device_velocity on device_id and select " +
    "peak_alerts_10m and through_logical_time. That view already excludes alerts after " +
    "the current logical time. Do not use TIME_BUCKET for an 'any rolling window' request. " +
    "Join aa_fraud_case_notes twice (candidate n and one-row reference ref), calculate " +
    "DOT_PRODUCT(n.notes_embedding, ref.notes_embedding), and join " +
    "aa_fraud_segment_evidence for reason_codes, device reuse, account age, merchant, " +
    "human disposition, and confirmed loss. Use window functions for the requested totals. " +
    "Return at most eight matches and finish the complete statement with ORDER BY.\n\n" +
    "After that table, write **Next check** from the returned rows only.\n" +
    "Compare rows with human_disposition confirmed_fraud to rows with human_disposition legitimate.\n" +
    "Name the reason codes that confirmed fraud has and legitimate rows do not have.\n" +
    "Name the reason codes that legitimate rows have and confirmed fraud does not have.\n" +
    "Name whether the confirmed-fraud rows share one device.\n" +
    "Give one test for the fraud strategy team for the confirmed-fraud pattern.\n" +
    "When legitimate rows have their own pattern, give one test for that pattern too.\n" +
    "State how many cases in the result show each pattern.\n" +
    "Write this sentence: Investigators still close each case.\n" +
    "Write this sentence: This result does not change a rule.\n" +
    "Do not say that a similar note proves fraud.\n" +
    "Do not invent a reason code that is not in the result."
  );
}

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
