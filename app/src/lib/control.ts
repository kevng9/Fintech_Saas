/**
 * Enqueue a control command and wait for the simulator leader to apply it.
 *
 * Waiting gives the operator a confirmed state instead of an optimistic one:
 * the response either reports the applied transition or an explicit timeout
 * they can act on.
 */

import { NextRequest, NextResponse } from "next/server";
import { describeError, fail, ok } from "./api";
import {
  enqueueCommand,
  readDemoState,
  waitForCommand,
  type CommandType,
} from "./demoState";
import { requireControl, requireLeader } from "./guard";

export async function runCommand(
  req: NextRequest,
  options: {
    type: CommandType;
    payload?: Record<string, unknown>;
    waitMs: number;
    action: string;
  }
): Promise<NextResponse> {
  const guard = await requireControl(req);
  if ("response" in guard) return guard.response;
  const { actor, state, expectedStateVersion } = guard.context;

  const leaderProblem = requireLeader(req, state);
  if (leaderProblem) return leaderProblem;

  try {
    const commandId = await enqueueCommand({
      type: options.type,
      payload: options.payload,
      actorId: actor.actorId,
      role: actor.role,
      expectedStateVersion,
      runId: state.runId,
    });
    const record = await waitForCommand(commandId, options.waitMs);
    const nextState = await readDemoState();

    if (!record || record.status === "queued" || record.status === "claimed") {
      return ok(
        req,
        {
          action: options.action,
          command_id: commandId,
          status: "pending",
          message:
            "The simulator has not confirmed this command yet. The demo state panel will " +
            "update as soon as it does.",
          state: nextState,
        },
        { status: 202 }
      );
    }

    if (record.status === "failed") {
      return fail(
        req,
        409,
        "command_failed",
        record.error_text || "The simulator rejected this command.",
        { command_id: commandId, state_version: nextState?.stateVersion ?? null }
      );
    }

    return ok(req, {
      action: options.action,
      command_id: commandId,
      status: record.status,
      result: safeJson(record.result),
      state: nextState,
    });
  } catch (error) {
    return fail(req, 503, "control_unavailable", describeError(error));
  }
}

function safeJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
