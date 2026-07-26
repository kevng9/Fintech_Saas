import { NextRequest } from "next/server";
import { describeError, fail, ok } from "@/lib/api";
import { requireAvailableAnchor, toSummary } from "@/lib/anchors";
import { readDemoState } from "@/lib/demoState";
import {
  baselineWindowMetrics,
  dataWatermark,
  declineMix,
  hourlySeries,
  laneComparison,
  recentWindowMetrics,
  whatChanged,
} from "@/lib/metrics/a2";
import { buildOverview, buildWatermark } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const DEFAULT_WINDOW_MINUTES = 60;

/**
 * Deterministic anchor overview. Every number here comes from SQL against
 * SingleStore, so the page renders with or without Aura Analyst.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ anchor: string }> }
) {
  const { anchor: anchorId } = await params;
  const anchor = requireAvailableAnchor(anchorId);
  if (!anchor) {
    return fail(
      req,
      404,
      "anchor_unavailable",
      `Anchor ${anchorId.toUpperCase()} is not part of this build yet.`
    );
  }

  const requestedWindow = Number(req.nextUrl.searchParams.get("window") ?? DEFAULT_WINDOW_MINUTES);
  const windowMinutes =
    Number.isInteger(requestedWindow) && requestedWindow > 0 && requestedWindow <= 24 * 60
      ? requestedWindow
      : DEFAULT_WINDOW_MINUTES;

  try {
    const state = await readDemoState();
    if (!state) {
      return fail(
        req,
        503,
        "demo_not_initialised",
        "No active demo run. Run the seeder: python -m fintech_demo bootstrap."
      );
    }

    if (anchorId !== "a2") {
      const data = await buildOverview(anchorId, windowMinutes);
      if (!data) {
        return fail(req, 404, "anchor_unavailable", `No metrics registered for ${anchorId.toUpperCase()}.`);
      }
      const watermark = (await buildWatermark(anchorId)) ?? { last_event_time: null, events: 0 };
      return ok(req, {
        anchor: toSummary(anchor),
        window_minutes: windowMinutes,
        state: {
          run_id: state.runId,
          logical_time: state.logicalTime,
          stream_status: state.streamStatus,
          speed_multiplier: state.speedMultiplier,
          state_version: state.stateVersion,
          leader_alive: state.leaderAlive,
        },
        data: { last_event_time: watermark.last_event_time, events_in_run: watermark.events },
        ...data,
      });
    }

    const [recent, baseline, hourly, lanes, mix, watermark, changed] = await Promise.all([
      recentWindowMetrics(windowMinutes),
      baselineWindowMetrics(windowMinutes),
      hourlySeries(24),
      laneComparison(windowMinutes),
      declineMix(windowMinutes),
      dataWatermark(),
      anchor.primaryScenarioId ? whatChanged(state.runId, anchor.primaryScenarioId) : null,
    ]);

    const widgetMeta = Object.fromEntries(
      anchor.overviewWidgets.map((widget) => [widget.id, widget])
    );

    return ok(req, {
      anchor: toSummary(anchor),
      window_minutes: windowMinutes,
      state: {
        run_id: state.runId,
        logical_time: state.logicalTime,
        stream_status: state.streamStatus,
        speed_multiplier: state.speedMultiplier,
        state_version: state.stateVersion,
        leader_alive: state.leaderAlive,
      },
      data: {
        last_event_time: watermark.last_event_time,
        events_in_run: watermark.events,
      },
      widgets: {
        authorization_rate: {
          meta: widgetMeta.authorization_rate,
          value: recent.approval_rate,
          baseline: baseline.approval_rate,
          delta:
            recent.approval_rate !== null && baseline.approval_rate !== null
              ? recent.approval_rate - baseline.approval_rate
              : null,
          attempts: recent.attempts,
        },
        p95_latency: {
          meta: widgetMeta.p95_latency,
          value: recent.p95_latency_ms,
          baseline: baseline.p95_latency_ms,
          delta:
            recent.p95_latency_ms !== null && baseline.p95_latency_ms !== null
              ? recent.p95_latency_ms - baseline.p95_latency_ms
              : null,
          avg_latency_ms: recent.avg_latency_ms,
        },
        timeout_share: {
          meta: widgetMeta.timeout_share,
          value: recent.timeout_decline_rate,
          baseline: baseline.timeout_decline_rate,
          delta:
            recent.timeout_decline_rate !== null && baseline.timeout_decline_rate !== null
              ? recent.timeout_decline_rate - baseline.timeout_decline_rate
              : null,
          timeout_declines: recent.timeout_declines,
        },
        declined_value: {
          meta: widgetMeta.declined_value,
          value: recent.declined_amount,
          baseline: null,
          delta: null,
          declines: recent.declines,
        },
        hourly_performance: { meta: widgetMeta.hourly_performance, points: hourly },
        lane_drivers: { meta: widgetMeta.lane_drivers, lanes },
        decline_mix: { meta: widgetMeta.decline_mix, rows: mix },
        what_changed: { meta: widgetMeta.what_changed, comparison: changed },
      },
    });
  } catch (error) {
    return fail(req, 503, "query_failed", describeError(error));
  }
}
