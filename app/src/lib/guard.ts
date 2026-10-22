/**
 * Shared entry checks for control endpoints: origin, role, live simulator, and
 * optimistic concurrency against the current demo state version.
 */

import { NextRequest, NextResponse } from "next/server";
import { fail, originAllowed } from "./api";
import { readDemoState, type DemoState } from "./demoState";
import { isAdministrator, resolveActor, type Actor } from "./roles";

export const STATE_VERSION_HEADER = "x-demo-state-version";

export interface ControlContext {
  actor: Actor;
  state: DemoState;
  expectedStateVersion: number | null;
}

export async function requireControl(
  req: NextRequest
): Promise<{ context: ControlContext } | { response: NextResponse }> {
  if (!originAllowed(req)) {
    return {
      response: fail(req, 403, "cross_origin_blocked", "Request origin is not allowed."),
    };
  }

  const actor = resolveActor(req);
  if (!isAdministrator(actor)) {
    return {
      response: fail(
        req,
        403,
        "role_required",
        "Only a demo administrator can change demo state. Persona switching does not grant this."
      ),
    };
  }

  let state: DemoState | null = null;
  try {
    state = await readDemoState();
  } catch (error) {
    return {
      response: fail(
        req,
        503,
        "database_unavailable",
        error instanceof Error ? error.message : "SingleStore is unreachable."
      ),
    };
  }

  if (!state) {
    return {
      response: fail(
        req,
        503,
        "demo_not_initialised",
        "No active demo run. Run the seeder: python -m fintech_demo bootstrap."
      ),
    };
  }

  const headerValue = req.headers.get(STATE_VERSION_HEADER);
  const expectedStateVersion = headerValue === null ? null : Number(headerValue);
  if (expectedStateVersion !== null && !Number.isFinite(expectedStateVersion)) {
    return {
      response: fail(req, 400, "invalid_state_version", "State version header must be a number."),
    };
  }
  if (expectedStateVersion !== null && expectedStateVersion !== state.stateVersion) {
    return {
      response: fail(
        req,
        409,
        "state_version_conflict",
        "The demo state changed since this page loaded. Refresh and try again.",
        { current_state_version: state.stateVersion }
      ),
    };
  }

  return { context: { actor, state, expectedStateVersion } };
}

export function requireLeader(
  req: NextRequest,
  state: DemoState
): NextResponse | null {
  if (state.leaderAlive) return null;
  return fail(
    req,
    503,
    "simulator_unavailable",
    "No simulator process is holding the lease. Start it with: python -m fintech_demo run."
  );
}
