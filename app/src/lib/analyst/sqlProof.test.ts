import assert from "node:assert/strict";
import test from "node:test";
import { analystResetFor, capabilitiesInSql, segmentSql } from "./sqlProof.ts";

const SAMPLE = `
SELECT DOT_PRODUCT(n.notes_embedding, ref.notes_embedding) AS note_similarity,
  e.reason_codes,
  JSON_ARRAY_CONTAINS_STRING(e.reason_codes, 'velocity_breach') AS velocity_breach,
  v.peak_alerts_10m,
  v.through_logical_time,
  SUM(e.confirmed_loss_usd) OVER () AS loss_across_matches
FROM aa_fraud_case_notes n
JOIN aa_fraud_segment_evidence e ON e.case_id = n.case_id
LEFT JOIN aa_fraud_device_velocity v ON v.device_id = e.device_id
JOIN demo_active_run ar ON ar.singleton_id = 1
WHERE n.opened_at <= ar.logical_time
`;

test("labels all six workloads without dropping SQL text", () => {
  const segments = segmentSql(SAMPLE);
  assert.equal(segments.map((segment) => segment.text).join(""), SAMPLE);
  assert.deepEqual(capabilitiesInSql(SAMPLE), [
    "vector",
    "document",
    "timeseries",
    "relational",
    "analytics",
    "live",
  ]);
});

test("a DOT_PRODUCT span stays vector even though it contains the embedding column", () => {
  const vector = segmentSql(SAMPLE).find((segment) => segment.text.startsWith("DOT_PRODUCT"));
  assert.equal(vector?.job, "vector");
  assert.match(vector?.text ?? "", /notes_embedding/);
});

test("a phase change keeps the visible answers and resets only the Aura session", () => {
  assert.deepEqual(analystResetFor("phase"), { clearTurns: false, resetSession: true });
  assert.deepEqual(analystResetFor("run"), { clearTurns: true, resetSession: true });
});
