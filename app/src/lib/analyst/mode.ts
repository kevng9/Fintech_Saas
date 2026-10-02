/**
 * Resolves how a given Analyst request should be served: live, or from a
 * reviewed fixture. Presenters can force fixture mode before a risky network;
 * "auto" tries live first and falls back visibly.
 */

import { getAnchor } from "../anchors";
import { latestExecution } from "../demoState";
import { analystConfig, type AnalystMode } from "../env";
import { isAnchorConfigured } from "./client";

export function resolveMode(requested: string | undefined): AnalystMode {
  // Live is fail-closed: a browser cannot request a stored answer or an
  // automatic fixture fallback while the server is configured for live Aura.
  if (analystConfig.mode === "live") return "live";
  const candidate = (requested ?? "").toLowerCase();
  if (candidate === "live" || candidate === "fixture" || candidate === "auto") {
    return candidate;
  }
  return analystConfig.mode;
}

export function canGoLive(anchorId: string, mode: AnalystMode): boolean {
  return mode !== "fixture" && isAnchorConfigured(anchorId);
}

/**
 * Reason surfaced on fixture responses. Expected presenter paths (fixture mode
 * or auto without a Domain key) get a clear, non-alarming label. Unexpected
 * live failures keep the upstream error text.
 */
export function fixtureFallbackReason(
  mode: AnalystMode,
  options?: { liveError?: string }
): string {
  if (options?.liveError) {
    return `live call failed: ${options.liveError}`;
  }
  if (mode === "fixture") {
    return "fixture mode selected";
  }
  return "live Domain not keyed; using reviewed fixture";
}

/** Fixtures are recorded per demo state, so the answer matches the dashboard. */
export async function scenarioState(
  anchorId: string,
  runId: number
): Promise<"baseline" | "after_injection"> {
  const anchor = getAnchor(anchorId);
  if (!anchor?.primaryScenarioId) return "baseline";
  const execution = await latestExecution(runId, anchor.primaryScenarioId);
  return execution ? "after_injection" : "baseline";
}
