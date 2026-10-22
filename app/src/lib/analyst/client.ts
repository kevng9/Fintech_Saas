/**
 * Server-side Aura Analyst client.
 *
 * The browser never talks to Aura. Every call is proxied here so the
 * Domain-scoped key stays on the server, requests carry a timeout, and upstream
 * errors are translated into neutral, redacted messages.
 */

import { analystConfig, analystDomain, redact } from "../env";

export class AnalystNotConfiguredError extends Error {}
export class AnalystTimeoutError extends Error {}

export class AnalystUpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly traceId: string | null
  ) {
    super(message);
  }
}

export const TRACE_HEADER = "singlestore-trace-id";

function endpoint(anchorId: string, path: string): { url: string; apiKey: string } {
  const domain = analystDomain(anchorId);
  if (!domain.configured) {
    throw new AnalystNotConfiguredError(
      `No Aura Domain credentials configured for anchor ${anchorId.toUpperCase()}.`
    );
  }
  return { url: `${domain.baseUrl}${path}`, apiKey: domain.apiKey };
}

export function isAnchorConfigured(anchorId: string): boolean {
  return analystDomain(anchorId).configured;
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), analystConfig.timeoutSeconds * 1000);
  try {
    return await run(controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AnalystTimeoutError(
        `Aura Analyst did not respond within ${analystConfig.timeoutSeconds} seconds.`
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export interface RawAnalystResponse {
  payload: unknown;
  traceId: string | null;
  latencyMs: number;
}

export async function analystQuery(
  anchorId: string,
  message: string
): Promise<RawAnalystResponse> {
  const { url, apiKey } = endpoint(anchorId, "/query");
  const started = Date.now();
  return withTimeout(async (signal) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ message }),
      signal,
      cache: "no-store",
    });
    const traceId = response.headers.get(TRACE_HEADER);
    if (!response.ok) {
      const body = await response.text();
      throw new AnalystUpstreamError(
        redact(`Aura Analyst returned ${response.status}: ${body.slice(0, 400)}`),
        response.status,
        traceId
      );
    }
    return {
      payload: await response.json(),
      traceId,
      latencyMs: Date.now() - started,
    };
  });
}

/** Aura returns this while the agent container is still booting. */
export function isInitializingContainerError(error: unknown): boolean {
  if (!(error instanceof AnalystUpstreamError) || error.status < 500) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("app is initializing") ||
    message.includes("container initialization failed") ||
    message.includes("initializenovacontainer")
  );
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Aura returns this when a prior chat session_id is stale or unknown. */
export function isStaleChatSessionError(error: unknown): boolean {
  if (!(error instanceof AnalystUpstreamError)) return false;
  if (error.status !== 400 && error.status !== 404) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("cookie not found") ||
    message.includes("session not found") ||
    message.includes("session_id") ||
    message.includes("unknown session")
  );
}

async function postChat(
  url: string,
  apiKey: string,
  message: string,
  sessionId: string | null,
  includedEvents: string[],
  signal: AbortSignal
): Promise<Response> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      message,
      included_events: includedEvents,
      ...(sessionId ? { session_id: sessionId } : {}),
    }),
    signal,
    cache: "no-store",
  });
  if (!response.ok || !response.body) {
    const body = response.body ? await response.text() : "";
    throw new AnalystUpstreamError(
      redact(`Aura Analyst chat returned ${response.status}: ${body.slice(0, 400)}`),
      response.status,
      response.headers.get(TRACE_HEADER)
    );
  }
  return response;
}

export async function analystChat(
  anchorId: string,
  message: string,
  sessionId: string | null,
  includedEvents: string[]
): Promise<Response> {
  const { url, apiKey } = endpoint(anchorId, "/chat");
  let sawInitializing = false;
  try {
    return await withTimeout(async (signal) => {
      let session = sessionId;
      for (;;) {
        try {
          return await postChat(url, apiKey, message, session, includedEvents, signal);
        } catch (error) {
          // A stale Aura conversation cookie/session must not poison the demo.
          if (session && isStaleChatSessionError(error)) {
            session = null;
            continue;
          }
          // The Nova container often 500s for a short window after the first
          // question. Keep the presenter on "working" and try again.
          if (!isInitializingContainerError(error)) throw error;
          sawInitializing = true;
          await delay(4000, signal);
        }
      }
    });
  } catch (error) {
    if (sawInitializing && error instanceof AnalystTimeoutError) {
      throw new AnalystUpstreamError(
        "Aura is still starting its workspace. Wait a few seconds and ask again.",
        500,
        null
      );
    }
    throw error;
  }
}

export async function conversationStarters(anchorId: string): Promise<RawAnalystResponse> {
  const { url, apiKey } = endpoint(anchorId, "/conversation-starters");
  const started = Date.now();
  return withTimeout(async (signal) => {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal,
      cache: "no-store",
    });
    const traceId = response.headers.get(TRACE_HEADER);
    if (!response.ok) {
      throw new AnalystUpstreamError(
        `Aura Analyst returned ${response.status} for conversation starters.`,
        response.status,
        traceId
      );
    }
    return { payload: await response.json(), traceId, latencyMs: Date.now() - started };
  });
}
