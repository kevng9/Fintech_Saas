/**
 * Small helpers shared by the A1, A3-A8 metrics modules.
 *
 * Every anchor beyond A2 reads its curated `aa_*` views, which already join
 * `demo_active_run` and filter on the demo logical clock, so these modules
 * never repeat that join themselves. `change()` below mirrors A2's
 * `whatChanged`: it reads the latest `demo_scenario_execution` row for the
 * anchor's scenario and returns null until that scenario has actually been
 * injected, which today is always (A1 and A3-A8 scenarios are declared in the
 * spec and the anchor catalog but are not yet wired into the simulator). The
 * function is still real code, not a stub, so the page works the moment a
 * later phase adds the generator segment for that scenario.
 */

import { query } from "../db";
import { latestExecution, parseJsonColumn, type ExecutionRecord } from "../demoState";
import type { SharedChangePayload, SharedChangeRow, SharedMetricFormat } from "../apiTypes";

export async function scenarioExpectedDeltas(scenarioId: string): Promise<Record<string, unknown>> {
  const rows = await query<{ expected_deltas: string }>(
    "SELECT expected_deltas FROM demo_scenario WHERE scenario_id = ?",
    [scenarioId]
  );
  return parseJsonColumn<Record<string, unknown>>(rows[0]?.expected_deltas, {});
}

export async function scenarioExecution(
  runId: number,
  scenarioId: string
): Promise<ExecutionRecord | null> {
  return latestExecution(runId, scenarioId);
}

export interface ChangeRowSpec {
  label: string;
  key: string;
  format: SharedMetricFormat;
}

/**
 * Builds a generic before/after callout from a scenario's published expected
 * deltas plus the measured values a caller has already computed for the
 * injection window. Kept anchor-agnostic so every A1/A3-A8 `change()` reads
 * the same way as A2's "What changed?" panel.
 */
export function buildChangePayload(options: {
  scenarioId: string;
  execution: ExecutionRecord;
  expected: Record<string, unknown>;
  segmentLabel: string;
  specs: ChangeRowSpec[];
  before: Record<string, number | null>;
  after: Record<string, number | null>;
}): SharedChangePayload {
  const expectedAfter = (options.expected.after ?? {}) as Record<string, number>;
  const tolerance = (options.expected.tolerance ?? {}) as Record<string, number>;
  const rows: SharedChangeRow[] = options.specs.map((spec) => ({
    label: spec.label,
    key: spec.key,
    format: spec.format,
    before: options.before[spec.key] ?? null,
    after: options.after[spec.key] ?? null,
    expected: typeof expectedAfter[spec.key] === "number" ? expectedAfter[spec.key] : null,
    tolerance: typeof tolerance[spec.key] === "number" ? tolerance[spec.key] : null,
  }));
  return {
    scenarioId: options.scenarioId,
    windowStart: options.execution.window_start,
    windowEnd: options.execution.window_end,
    segmentLabel: options.segmentLabel,
    narrative: typeof options.expected.narrative === "string" ? options.expected.narrative : null,
    rows,
  };
}

export function emptyChange(): null {
  return null;
}
