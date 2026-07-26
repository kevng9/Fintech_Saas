import { NextRequest, NextResponse } from "next/server";
import { clampString, describeError, fail, originAllowed, readJson, requestId } from "@/lib/api";
import { applyAppUserCookie, getOrCreateAppUserId, tabId } from "@/lib/appUser";
import { requireAvailableAnchor } from "@/lib/anchors";
import {
  analystChat,
  isStaleChatSessionError,
  TRACE_HEADER,
} from "@/lib/analyst/client";
import { findFixture, fixtureUnavailableResult } from "@/lib/analyst/fixtures";
import { canGoLive, fixtureFallbackReason, resolveMode, scenarioState } from "@/lib/analyst/mode";
import { clearSession, getSession, rememberSession } from "@/lib/analyst/sessionStore";
import { fixtureStream, tapSessionId } from "@/lib/analyst/sse";
import { readDemoState } from "@/lib/demoState";
import { analystConfig } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SOURCE_HEADER = "x-analyst-source";

/**
 * Conversational Analyst proxy.
 *
 * Live answers stream straight through; fixture answers are replayed as the
 * same event sequence, so the chat panel has one rendering path. The response
 * always declares its source in a header the UI surfaces as a badge.
 */
export async function POST(req: NextRequest) {
  if (!originAllowed(req)) {
    return fail(req, 403, "cross_origin_blocked", "Request origin is not allowed.");
  }

  const { appUserId, setCookie } = getOrCreateAppUserId(req);
  const body = await readJson<{
    anchor?: string;
    message?: string;
    mode?: string;
    included_events?: string[];
  }>(req);

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
  const includedEvents = Array.isArray(body.included_events)
    ? body.included_events.slice(0, 8).map((item) => String(item).slice(0, 32))
    : ["summary", "data"];

  const state = await readDemoState().catch(() => null);
  const runId = state?.runId ?? 0;
  const tab = tabId(req);
  const existingSession = getSession(appUserId, tab, anchorId, runId);

  if (canGoLive(anchorId, mode)) {
    try {
      const upstream = await analystChat(
        anchorId,
        message,
        existingSession?.sessionId ?? null,
        includedEvents
      );
      const stream = tapSessionId(upstream.body as ReadableStream<Uint8Array>, (sessionId) =>
        rememberSession(appUserId, tab, anchorId, runId, sessionId)
      );
      const response = new NextResponse(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          [SOURCE_HEADER]: "live",
          "x-demo-request-id": requestId(req),
          ...(upstream.headers.get(TRACE_HEADER)
            ? { [TRACE_HEADER]: upstream.headers.get(TRACE_HEADER) as string }
            : {}),
        },
      });
      return applyAppUserCookie(response, setCookie, appUserId);
    } catch (error) {
      if (isStaleChatSessionError(error)) {
        clearSession(appUserId, tab, anchorId);
      }
      if (mode === "live") {
        return fail(req, 502, "analyst_unavailable", describeError(error));
      }
      return applyAppUserCookie(
        await fixtureResponse(
          req,
          anchorId,
          message,
          runId,
          fixtureFallbackReason(mode, { liveError: describeError(error) })
        ),
        setCookie,
        appUserId
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
    await fixtureResponse(req, anchorId, message, runId, fixtureFallbackReason(mode)),
    setCookie,
    appUserId
  );
}

async function fixtureResponse(
  req: NextRequest,
  anchorId: string,
  message: string,
  runId: number,
  reason: string
): Promise<NextResponse> {
  const state = await scenarioState(anchorId, runId);
  const fixture = await findFixture(anchorId, message, state);
  const stream = fixtureStream({
    sessionId: `fixture-${anchorId}-${runId}`,
    results: fixture ? fixture.results : fixtureUnavailableResult(message),
    fixtureId: fixture?.id ?? "none",
    recordedAt: fixture?.recorded_at ?? "",
  });
  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      [SOURCE_HEADER]: "fixture",
      "x-analyst-fixture-id": fixture?.id ?? "none",
      "x-analyst-fixture-recorded-at": fixture?.recorded_at ?? "",
      "x-analyst-degraded-reason": reason.slice(0, 200),
      "x-demo-request-id": requestId(req),
    },
  });
}
