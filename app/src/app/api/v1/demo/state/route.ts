import { NextRequest } from "next/server";
import { describeError, fail, ok } from "@/lib/api";
import {
  listExecutions,
  listScenarios,
  parseJsonColumn,
  readDemoState,
} from "@/lib/demoState";
import { resolveActor } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** Single source of truth for the header strip: run, clock, stream, scenarios. */
export async function GET(req: NextRequest) {
  const actor = resolveActor(req);
  try {
    const state = await readDemoState();
    if (!state) {
      return fail(
        req,
        503,
        "demo_not_initialised",
        "No active demo run. Run the seeder: python -m fintech_demo bootstrap."
      );
    }
    const [scenarios, executions] = await Promise.all([
      listScenarios(),
      listExecutions(state.runId),
    ]);

    return ok(req, {
      role: actor.role,
      state: {
        run_id: state.runId,
        logical_time: state.logicalTime,
        stream_status: state.streamStatus,
        speed_multiplier: state.speedMultiplier,
        sequence_no: state.sequenceNo,
        minute_cursor: state.minuteCursor,
        analyst_mode: state.analystMode,
        state_version: state.stateVersion,
        leader_alive: state.leaderAlive,
        leader_age_seconds: state.leaderAgeSeconds,
        updated_at: state.updatedAt,
      },
      run: state.run
        ? {
            run_id: state.run.run_id,
            seed: state.run.seed,
            fixture_version: state.run.fixture_version,
            status: state.run.status,
            logical_epoch: state.run.logical_epoch,
            baseline_from: state.run.baseline_from,
            baseline_checksum: state.run.baseline_checksum,
            row_counts: parseJsonColumn<Record<string, number>>(state.run.row_counts, {}),
          }
        : null,
      scenarios: scenarios.map((scenario) => ({
        scenario_id: scenario.scenario_id,
        anchor_id: scenario.anchor_id,
        name: scenario.name,
        description: scenario.description,
        metric_window: scenario.metric_window,
        enabled: Boolean(scenario.enabled),
        expected_deltas: parseJsonColumn<Record<string, unknown>>(scenario.expected_deltas, {}),
      })),
      executions: executions.map((execution) => ({
        ...execution,
        rows_inserted: parseJsonColumn<Record<string, number>>(execution.rows_inserted, {}),
      })),
    });
  } catch (error) {
    return fail(req, 503, "database_unavailable", describeError(error));
  }
}
