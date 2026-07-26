import { NextResponse } from "next/server";
import { ANCHORS } from "@/lib/anchors";
import { isAnchorConfigured } from "@/lib/analyst/client";
import { loadFixtures } from "@/lib/analyst/fixtures";
import { sessionCount } from "@/lib/analyst/sessionStore";
import { pingDatabase } from "@/lib/db";
import { listExecutions, parseJsonColumn, readDemoState } from "@/lib/demoState";
import { dataWatermark } from "@/lib/metrics/a2";
import { analystConfig, demoConfig } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Demo readiness in one call: the checks a presenter needs five minutes before
 * a session. Everything here is safe to show on a screen share.
 */
export async function GET() {
  const database = await pingDatabase();
  const state = database.ok ? await readDemoState().catch(() => null) : null;
  const watermark = state ? await dataWatermark().catch(() => null) : null;
  const executions = state ? await listExecutions(state.runId).catch(() => []) : [];

  const anchors = await Promise.all(
    ANCHORS.map(async (anchor) => ({
      anchor_id: anchor.id,
      name: anchor.name,
      status: anchor.status,
      analyst_configured: isAnchorConfigured(anchor.id),
      fixture_count: (await loadFixtures(anchor.id)).length,
    }))
  );

  const available = anchors.filter((a) => a.status === "available");
  const allLiveDomains = available.every((a) => a.analyst_configured);
  const fixturesPresent = available.every((a) => a.fixture_count > 0);
  const liveMode = analystConfig.mode === "live";

  const checks = [
    { id: "database", ok: database.ok, detail: database.error ?? `${database.latencyMs} ms` },
    {
      id: "active_run",
      ok: Boolean(state && state.run && state.run.status !== "template"),
      detail: state ? `run ${state.runId} (${state.run?.status ?? "unknown"})` : "no active run",
    },
    {
      id: "simulator_leader",
      ok: Boolean(state?.leaderAlive),
      detail: state?.leaderAlive
        ? `${state.leaderId}, heartbeat ${state.leaderAgeSeconds}s ago`
        : "no live simulator lease: run python -m fintech_demo run",
    },
    {
      id: "baseline_checksum_recorded",
      ok: Boolean(state?.run?.baseline_checksum),
      detail: state?.run?.baseline_checksum?.slice(0, 12) ?? "missing",
    },
    {
      id: "all_live_domains",
      ok: allLiveDomains,
      detail: available.length
        ? available
            .map((a) => `${a.anchor_id}:${a.analyst_configured ? "published+keyed" : "not-keyed"}`)
            .join(", ")
        : "no available anchors",
    },
    {
      id: "fixtures_present_for_available_anchors",
      ok: fixturesPresent,
      detail: available.map((a) => `${a.anchor_id}:${a.fixture_count}`).join(", "),
    },
  ];

  // Fixture/auto can present without live Domains. Live mode requires every
  // available anchor to be published and keyed before demo_ready.
  const ready = checks.every((check) => {
    if (check.id === "all_live_domains") return liveMode ? check.ok : true;
    return check.ok;
  });
  return NextResponse.json(
    {
      status: ready ? "demo_ready" : "attention_required",
      checked_at: new Date().toISOString(),
      checks,
      live_domains_complete: allLiveDomains,
      state: state
        ? {
            run_id: state.runId,
            logical_time: state.logicalTime,
            stream_status: state.streamStatus,
            speed_multiplier: state.speedMultiplier,
            state_version: state.stateVersion,
            analyst_mode: state.analystMode,
            row_counts: parseJsonColumn<Record<string, number>>(state.run?.row_counts, {}),
          }
        : null,
      data: watermark,
      scenario_executions: executions.length,
      analyst: { mode: analystConfig.mode, sessions_in_memory: sessionCount() },
      fixture: { seed: demoConfig.seed, epoch: demoConfig.epoch },
      anchors,
    },
    { status: ready ? 200 : 503 }
  );
}
