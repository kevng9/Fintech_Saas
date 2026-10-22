import { NextRequest } from "next/server";
import { clampString, describeError, fail, ok, originAllowed, readJson } from "@/lib/api";
import { applyAppUserCookie } from "@/lib/appUser";
import { requireAvailableAnchor } from "@/lib/anchors";
import { analystQuery } from "@/lib/analyst/client";
import { findFixture, fixtureUnavailableResult } from "@/lib/analyst/fixtures";
import { canGoLive, fixtureFallbackReason, resolveMode, scenarioState } from "@/lib/analyst/mode";
import { normalizeQueryResponse } from "@/lib/analyst/normalize";
import type { AnalystEnvelope } from "@/lib/analyst/types";
import { readDemoState } from "@/lib/demoState";
import { analystConfig } from "@/lib/env";
import { resolveActor } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Structured, single-turn Analyst call used by the investigation workspace. */
export async function POST(req: NextRequest) {
  if (!originAllowed(req)) {
    return fail(req, 403, "cross_origin_blocked", "Request origin is not allowed.");
  }
  const actor = resolveActor(req);
  const body = await readJson<{ anchor?: string; message?: string; mode?: string }>(req);
  const anchorId = clampString(body.anchor, 8).toLowerCase();
  const message = clampString(body.message, analystConfig.maxMessageChars).trim();

  const anchor = requireAvailableAnchor(anchorId);
  if (!anchor) {
    return fail(req, 404, "anchor_unavailable", `Anchor ${anchorId || "?"} is not available.`);
  }
  if (!message) {
    return fail(req, 400, "empty_question", "Ask a question before sending.");
  }

  const mode = resolveMode(body.mode);
  const started = Date.now();

  try {
    const state = await readDemoState();
    const runId = state?.runId ?? 0;

    if (canGoLive(anchorId, mode)) {
      try {
        const raw = await analystQuery(anchorId, message);
        const envelope: AnalystEnvelope = {
          source: "live",
          anchor_id: anchorId,
          results: normalizeQueryResponse(raw.payload),
          session_id: null,
          trace_id: raw.traceId,
          latency_ms: raw.latencyMs,
        };
        return applyAppUserCookie(ok(req, envelope), actor.setCookie, actor.actorId);
      } catch (error) {
        if (mode === "live") {
          return fail(req, 502, "analyst_unavailable", describeError(error));
        }
        return applyAppUserCookie(
          ok(
            req,
            await fixtureEnvelope(
              anchorId,
              message,
              runId,
              started,
              fixtureFallbackReason(mode, { liveError: describeError(error) })
            )
          ),
          actor.setCookie,
          actor.actorId
        );
      }
    }

    if (mode === "live") {
      return fail(
        req,
        503,
        "analyst_not_configured",
        `No Aura Domain key is configured for anchor ${anchorId.toUpperCase()}.`
      );
    }

    return applyAppUserCookie(
      ok(
        req,
        await fixtureEnvelope(anchorId, message, runId, started, fixtureFallbackReason(mode))
      ),
      actor.setCookie,
      actor.actorId
    );
  } catch (error) {
    return fail(req, 503, "query_failed", describeError(error));
  }
}

async function fixtureEnvelope(
  anchorId: string,
  message: string,
  runId: number,
  started: number,
  reason: string
): Promise<AnalystEnvelope> {
  const state = await scenarioState(anchorId, runId);
  const fixture = await findFixture(anchorId, message, state);
  return {
    source: "fixture",
    anchor_id: anchorId,
    results: fixture ? fixture.results : fixtureUnavailableResult(message),
    session_id: null,
    trace_id: null,
    latency_ms: Date.now() - started,
    degraded_reason: reason,
    ...(fixture
      ? {
          fixture: {
            id: fixture.id,
            recorded_at: fixture.recorded_at,
            fixture_version: fixture.fixture_version,
            scenario_state: fixture.scenario_state,
          },
        }
      : {}),
  };
}
