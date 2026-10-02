import { NextRequest } from "next/server";
import { describeError, fail, readJson } from "@/lib/api";
import { runCommand } from "@/lib/control";
import { listScenarios } from "@/lib/demoState";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const IDEMPOTENCY_HEADER = "x-idempotency-key";

/**
 * Injects one scenario. The idempotency key makes a double click, a retry, or
 * a refreshed page produce exactly one injection.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ scenarioId: string }> }
) {
  const { scenarioId } = await params;
  const body = await readJson<{ idempotency_key?: string }>(req);
  const idempotencyKey =
    req.headers.get(IDEMPOTENCY_HEADER)?.slice(0, 64) ||
    body.idempotency_key?.slice(0, 64) ||
    crypto.randomUUID();

  try {
    const scenarios = await listScenarios();
    const scenario = scenarios.find((item) => item.scenario_id === scenarioId);
    if (!scenario) {
      return fail(req, 404, "scenario_not_found", `Unknown scenario ${scenarioId}.`);
    }
    if (!scenario.enabled) {
      return fail(req, 409, "scenario_disabled", `Scenario ${scenarioId} is disabled.`);
    }
  } catch (error) {
    return fail(req, 503, "database_unavailable", describeError(error));
  }

  return runCommand(req, {
    type: "INJECT",
    // A buyer story is a bounded decision snapshot. Keep the logical clock at
    // the end of that window so dashboards and live Analyst inspect the same
    // evidence until the operator explicitly resumes the stream.
    payload: { scenario_id: scenarioId, idempotency_key: idempotencyKey, freeze_after: true },
    waitMs: 30_000,
    action: "scenario.inject",
  });
}
