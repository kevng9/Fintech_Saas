"use client";

/**
 * A2 Payment Pulse.
 *
 * The page is ordered the way the story is told: headline metrics, the trend
 * that shows when it moved, the ranked lanes that show where, the decline mix
 * that shows why, and only then the natural-language workspace. Every widget on
 * this page is computed by SQL against SingleStore, so the anchor holds up even
 * if Aura Analyst is unavailable.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiTile } from "@/components/a2/KpiTile";
import { LaneTable } from "@/components/a2/LaneTable";
import { ScenarioPanel } from "@/components/a2/ScenarioPanel";
import { WhatChanged } from "@/components/a2/WhatChanged";
import { DivergingBars, DualAxisChart } from "@/components/charts";
import { useDemoState } from "@/components/DemoStateProvider";
import { Banner, Card, Empty, Skeleton } from "@/components/ui";
import { count, logicalTime, milliseconds, percent, points, usd } from "@/lib/format";
import type { OverviewPayload } from "@/lib/apiTypes";

const WINDOW_CHOICES = [15, 60, 180, 720];
const ANCHOR_ID = "a2";

export default function PaymentPulsePage() {
  const { envelope, persona, presentationMode } = useDemoState();
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedLane, setSelectedLane] = useState<string | null>(null);

  // Re-reading on every state poll keeps the widgets in step with the logical
  // clock, and makes a pause visibly freeze the page.
  const stateSignature = envelope
    ? `${envelope.state.run_id}:${envelope.state.logical_time}:${envelope.state.state_version}`
    : "none";

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/v1/anchors/${ANCHOR_ID}/overview?window=${windowMinutes}`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setError(body.error?.message ?? `Overview unavailable (${response.status}).`);
        return;
      }
      setOverview((await response.json()) as OverviewPayload);
      setError(null);
    } catch {
      setError("Cannot reach the demo API.");
    }
  }, [windowMinutes]);

  useEffect(() => {
    void load();
  }, [load, stateSignature]);

  const widgets = overview?.widgets;

  const seriesPoints = useMemo(
    () =>
      (widgets?.hourly_performance.points ?? []).map((point) => ({
        label: logicalTime(point.hour_start).slice(11, 16),
        rate: Number(point.approval_rate),
        latency: Number(point.p95_latency_ms),
        attempts: Number(point.attempts),
      })),
    [widgets]
  );

  const worstHourIndex = useMemo(() => {
    if (!seriesPoints.length) return null;
    let index = 0;
    for (let i = 1; i < seriesPoints.length; i += 1) {
      if (seriesPoints[i].rate < seriesPoints[index].rate) index = i;
    }
    return index;
  }, [seriesPoints]);

  const laneBars = useMemo(
    () =>
      (widgets?.lane_drivers.lanes ?? []).slice(0, 8).map((lane) => ({
        key: lane.lane_key,
        label: `${lane.processor_id} · ${lane.card_network} · ${lane.issuer_country}`,
        value: lane.approval_rate_change,
        detail: points(lane.approval_rate_change),
      })),
    [widgets]
  );

  const declineRows = widgets?.decline_mix.rows ?? [];
  const totalDeclines = declineRows.reduce((sum, row) => sum + Number(row.declines), 0);
  const scenarioActive = (envelope?.executions ?? []).some(
    (execution) => execution.scenario_id === "A2_PROCESSOR_TIMEOUT" && execution.status === "complete"
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--ink-muted)]">
        <Link href="/" className="hover:text-[var(--accent-dark)]">
          Overview
        </Link>
        <span>/</span>
        <span className="text-[var(--ink)]">Payment operations</span>
      </div>

      <header className="business-hero px-7 py-7 lg:px-9">
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-7">
          <div className="max-w-[760px]">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  scenarioActive ? "bg-[#ff8c9b]" : "bg-[var(--lime)]"
                }`}
              />
              <span
                className={`text-[10px] font-bold tracking-[0.1em] uppercase ${
                  scenarioActive ? "text-[#ffb5bf]" : "text-[var(--lime)]"
                }`}
              >
                {scenarioActive ? "Operational change detected" : "Authorization network healthy"}
              </span>
            </div>
            <h1 className="mt-3 text-[34px] font-semibold tracking-[-0.05em]">Payment Pulse</h1>
            <p className="mt-2 max-w-[68ch] text-[13px] leading-6 text-white/58">
              {overview?.anchor.criticalBusinessIssue ??
                "Protect payment revenue and customer experience by keeping approval rates and latency within acceptable thresholds."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-[0.08em] text-white/40 uppercase">
              Time range
            </span>
            <div className="flex overflow-hidden rounded-[10px] border border-white/15 bg-white/[0.06]">
              {WINDOW_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setWindowMinutes(choice)}
                  className="px-3 py-2 text-[11px] font-semibold transition-colors"
                  style={{
                    background: choice === windowMinutes ? "var(--lime)" : "transparent",
                    color: choice === windowMinutes ? "var(--navy)" : "rgba(255,255,255,.6)",
                  }}
                >
                  {choice >= 60 ? `${choice / 60}h` : `${choice}m`}
                </button>
              ))}
            </div>
          </div>
        </div>
        {overview && (
          <div className="relative z-10 mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-4 text-[10px] text-white/40">
            <span>
              Latest authorization{" "}
              <strong className="font-semibold text-white/65">
                {logicalTime(overview.data.last_event_time)}
              </strong>
            </span>
            <span>
              Business run volume{" "}
              <strong className="font-semibold text-white/65">
                {count(overview.data.events_in_run)}
              </strong>
            </span>
            <span>
              Decision support{" "}
              <strong className="font-semibold text-white/65">Aura Analyst</strong>
            </span>
          </div>
        )}
      </header>

      {error && <Banner tone="bad">{error}</Banner>}
      {overview && !overview.state.leader_alive && (
        <Banner tone="warn">
          Live payment updates are paused. Open Demo controls to resume the environment.
        </Banner>
      )}

      <div>
        <p className="label">Network health</p>
        <h2 className="section-title mt-1">Key operating signals</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {widgets ? (
          <>
            <KpiTile
              widget={widgets.authorization_rate}
              higherIsBetter
              detail={`${count(widgets.authorization_rate.attempts)} attempts`}
              showProvenance={persona === "technical"}
            />
            <KpiTile
              widget={widgets.p95_latency}
              higherIsBetter={false}
              detail={`avg ${milliseconds(widgets.p95_latency.avg_latency_ms)}`}
              showProvenance={persona === "technical"}
            />
            <KpiTile
              widget={widgets.timeout_share}
              higherIsBetter={false}
              detail={`${count(widgets.timeout_share.timeout_declines)} timeouts`}
              showProvenance={persona === "technical"}
            />
            <KpiTile
              widget={widgets.declined_value}
              higherIsBetter={false}
              detail={`${count(widgets.declined_value.declines)} declines`}
              showProvenance={persona === "technical"}
            />
          </>
        ) : (
          <div className="card p-4 sm:col-span-2 xl:col-span-4">
            <Skeleton rows={3} />
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Authorization performance"
          subtitle="Approval rate and p95 latency across the last 24 business hours"
          footnote={
            persona === "technical"
              ? `Source: ${widgets?.hourly_performance.meta.sourceTables.join(", ") ?? "payment_event"} · hour buckets on the logical clock`
              : widgets?.hourly_performance.meta.expectedScenarioDelta
          }
        >
          {widgets ? (
            <DualAxisChart points={seriesPoints} highlightIndex={worstHourIndex} />
          ) : (
            <Skeleton rows={5} />
          )}
        </Card>

        <Card
          title="Lane movement"
          subtitle="Approval change against each route's operating baseline"
          footnote="Select a lane to continue the investigation."
        >
          {widgets ? (
            laneBars.length ? (
              <DivergingBars
                rows={laneBars}
                selectedKey={selectedLane}
                onSelect={setSelectedLane}
              />
            ) : (
              <Empty>No lane activity in this window.</Empty>
            )
          ) : (
            <Skeleton rows={6} />
          )}
        </Card>
      </div>

      <Card
        title="Change impact"
        subtitle="Before-and-after evidence for the affected payment window"
        footnote="Measured values are compared with the expected operating impact."
      >
        {widgets ? <WhatChanged comparison={widgets.what_changed.comparison} /> : <Skeleton rows={4} />}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card
          title="Payment routes"
          subtitle="Processor, network and market against the prior seven days"
        >
          {widgets ? (
            <LaneTable lanes={widgets.lane_drivers.lanes} anchorId={ANCHOR_ID} />
          ) : (
            <Skeleton rows={6} />
          )}
        </Card>

        <Card
          title="Why payments declined"
          subtitle={`${count(totalDeclines)} declines grouped by business reason`}
        >
          {widgets ? (
            declineRows.length ? (
              <div className="scroll-thin max-h-[420px] overflow-auto">
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Merchant category</th>
                      <th>Response code</th>
                      <th className="num">Declines</th>
                      <th className="num">Share</th>
                      <th className="num">Value</th>
                      <th className="num">Avg latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {declineRows.map((row) => (
                      <tr key={`${row.merchant_category}-${row.response_code}`}>
                        <td>{row.merchant_category}</td>
                        <td className="mono">
                          {row.response_code === "TIMEOUT" ? (
                            <span style={{ color: "var(--danger)", fontWeight: 600 }}>
                              {row.response_code}
                            </span>
                          ) : (
                            row.response_code
                          )}
                        </td>
                        <td className="num mono">{count(row.declines)}</td>
                        <td className="num mono">
                          {totalDeclines ? percent(Number(row.declines) / totalDeclines, 1) : "—"}
                        </td>
                        <td className="num mono">{usd(row.declined_amount)}</td>
                        <td className="num mono">{milliseconds(row.avg_latency_ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>No declines in this window.</Empty>
            )
          ) : (
            <Skeleton rows={6} />
          )}
        </Card>
      </div>

      {!presentationMode && <ScenarioPanel anchorId={ANCHOR_ID} />}

      {selectedLane && (
        <p className="text-[12px]">
          <Link
            href={`/anchors/${ANCHOR_ID}/segment/${encodeURIComponent(selectedLane)}`}
            className="font-medium text-[var(--accent-dark)] hover:underline"
          >
            Open lane detail for {selectedLane.split("|").join(" · ")}
          </Link>
        </p>
      )}
    </div>
  );
}
