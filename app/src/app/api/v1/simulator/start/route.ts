import { NextRequest } from "next/server";
import { describeError, fail, ok } from "@/lib/api";
import {
  enqueueCommand,
  readDemoState,
  waitForCommand,
  type DemoState,
} from "@/lib/demoState";
import { requireControl } from "@/lib/guard";
import { launchSimulator } from "@/lib/simulatorProcess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LEADER_WAIT_MS = 15_000;
const RESUME_WAIT_MS = 8_000;

let inflight: Promise<DemoState | null> | null = null;

async function waitForLeader(): Promise<DemoState | null> {
  const deadline = Date.now() + LEADER_WAIT_MS;
  let latest: DemoState | null = null;
  while (Date.now() < deadline) {
    latest = await readDemoState();
    if (latest?.leaderAlive) return latest;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return latest;
}

async function ensureLeader(state: DemoState): Promise<DemoState> {
  if (state.leaderAlive) return state;
  if (!inflight) {
    inflight = (async () => {
      launchSimulator();
      return waitForLeader();
    })().finally(() => {
      inflight = null;
    });
  }
  const ready = await inflight;
  if (!ready?.leaderAlive) {
    throw new Error(
      "The simulator did not start sending updates. See .demo/simulator.log."
    );
  }
  return ready;
}

export async function POST(req: NextRequest) {
  const guard = await requireControl(req);
  if ("response" in guard) return guard.response;
  const { actor } = guard.context;

  try {
    let state = await ensureLeader(guard.context.state);
    if (state.streamStatus === "RESETTING") {
      return fail(
        req,
        409,
        "reset_in_progress",
        "The environment is still restoring. Start live updates when that finishes."
      );
    }
    if (state.streamStatus === "RUNNING") {
      return ok(req, {
        action: "simulator.start",
        status: "complete",
        state,
      });
    }

    const commandId = await enqueueCommand({
      type: "RESUME",
      actorId: actor.actorId,
      role: actor.role,
      expectedStateVersion: state.stateVersion,
      runId: state.runId,
    });
    const record = await waitForCommand(commandId, RESUME_WAIT_MS);
    state = (await readDemoState()) ?? state;

    if (!record || record.status === "queued" || record.status === "claimed") {
      return ok(
        req,
        {
          action: "simulator.start",
          command_id: commandId,
          status: "pending",
          message: "The simulator has not confirmed live updates yet.",
          state,
        },
        { status: 202 }
      );
    }
    if (record.status === "failed") {
      return fail(
        req,
        409,
        "command_failed",
        record.error_text || "The simulator rejected the request to start live updates.",
        { command_id: commandId }
      );
    }
    return ok(req, {
      action: "simulator.start",
      command_id: commandId,
      status: record.status,
      state,
    });
  } catch (error) {
    return fail(req, 503, "simulator_unavailable", describeError(error));
  }
}
