import { NextRequest } from "next/server";
import { describeError, fail, ok } from "@/lib/api";
import { listExecutions, listScenarios, parseJsonColumn, readDemoState } from "@/lib/demoState";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const anchorId = req.nextUrl.searchParams.get("anchor") ?? undefined;
  try {
    const [scenarios, state] = await Promise.all([listScenarios(anchorId), readDemoState()]);
    const executions = state ? await listExecutions(state.runId) : [];
    return ok(req, {
      run_id: state?.runId ?? null,
      scenarios: scenarios.map((scenario) => ({
        scenario_id: scenario.scenario_id,
        anchor_id: scenario.anchor_id,
        name: scenario.name,
        description: scenario.description,
        metric_window: scenario.metric_window,
        enabled: Boolean(scenario.enabled),
        expected_deltas: parseJsonColumn<Record<string, unknown>>(scenario.expected_deltas, {}),
        executions: executions.filter(
          (execution) => execution.scenario_id === scenario.scenario_id
        ),
      })),
    });
  } catch (error) {
    return fail(req, 503, "database_unavailable", describeError(error));
  }
}
