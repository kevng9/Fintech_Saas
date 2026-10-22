"use client";

/**
 * A2 Payment Performance Management.
 *
 * The page is ordered the way the story is told: headline metrics, the trend
 * that shows when it moved, the ranked lanes that show where, the decline mix
 * that shows why, and only then the natural-language workspace. Every widget on
 * this page is computed by SQL against SingleStore, so the anchor holds up even
 * if Aura Analyst is unavailable.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnalystWorkspace } from "@/components/a2/AnalystWorkspace";
import { KpiTile } from "@/components/a2/KpiTile";
import { LaneTable } from "@/components/a2/LaneTable";
import { ScenarioPanel } from "@/components/a2/ScenarioPanel";
import { WhatChanged } from "@/components/a2/WhatChanged";
import { DivergingBars, DualAxisChart } from "@/components/charts";
import { useDemoState } from "@/components/DemoStateProvider";
import { LiveUpdatesBanner } from "@/components/LiveUpdatesBanner";
import { Banner, Card, Empty, Skeleton } from "@/components/ui";
import { count, logicalTime, milliseconds, percent, points, usd } from "@/lib/format";
import type { OverviewPayload } from "@/lib/apiTypes";

const WINDOW_CHOICES = [15, 60, 180, 720];
const ANCHOR_ID = "a2";

export default function PaymentPerformancePage() {
  const { envelope, persona, presentationMode, busyAction, inject } = useDemoState();
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storyMessage, setStoryMessage] = useState<string | null>(null);
  const [selectedLane, setSelectedLane] = useState<string | null>(null);
  const storyStartedRef = useRef(false);

  // Re-reading on every state poll keeps the widgets in step with the logical
  // clock, and makes a pause visibly freeze the page.
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
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load, envelope?.state.run_id, envelope?.state.state_version]);

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
  const totalDeclines = Number(widgets?.declined_value.declines ?? 0);
  const displayedDeclines = declineRows.reduce((sum, row) => sum + Number(row.declines), 0);
  const scenarioActive = (envelope?.executions ?? []).some(
    (execution) => execution.scenario_id === "A2_PROCESSOR_TIMEOUT" && execution.status === "complete"
  );
  const incidentBusy = busyAction === "inject:A2_PROCESSOR_TIMEOUT";
  const comparison = widgets?.what_changed.comparison ?? null;
  const incidentDeclinedValue = comparison?.after.declined_amount ?? null;
  const incidentApproval = comparison?.after.approval_rate ?? null;
  const incidentApprovalDelta =
    comparison?.after.approval_rate !== null &&
    comparison?.after.approval_rate !== undefined &&
    comparison?.baseline.approval_rate !== null
      ? comparison.after.approval_rate - comparison.baseline.approval_rate
      : null;
  const incidentLatency = comparison?.after.p95_latency_ms ?? null;
  const incidentAttempts = comparison?.after.attempts ?? null;

  const startIncident = useCallback(async () => {
    setStoryMessage(null);
    const result = await inject("A2_PROCESSOR_TIMEOUT");
    if (!result.ok) {
      setStoryMessage(result.message ?? "The controlled incident could not be started.");
      return;
    }
    setStoryMessage("The incident is now visible. Follow the change from signal to cause to action.");
  }, [inject]);

  useEffect(() => {
    if (storyStartedRef.current || !envelope?.state || scenarioActive) return;
    if (new URLSearchParams(window.location.search).get("story") !== "incident") return;
    storyStartedRef.current = true;
    void startIncident();
  }, [envelope?.state, scenarioActive, startIncident]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--ink-muted)]">
        <Link href="/" className="hover:text-[var(--accent-dark)]">
          Overview
        </Link>
        <span>/</span>
        <span className="text-[var(--ink)]">
          {overview?.anchor.businessDecision ?? "Payment Performance Management"}
        </span>
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
            <h1 className="mt-3 text-[34px] font-semibold tracking-[-0.05em]">
              {overview?.anchor.name ?? "Payment Performance Management"}
            </h1>
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
      {overview && (
        <LiveUpdatesBanner
          leaderAlive={overview.state.leader_alive}
          streamStatus={overview.state.stream_status}
          label="Live payment updates"
        />
      )}

      {presentationMode && (
        <Card
          title={scenarioActive ? "Revenue-risk incident detected" : "See the decision moment"}
          subtitle={
            scenarioActive
              ? "Aura and the operating view use the same current payment foundation"
              : "Start a controlled processor timeout to see the signal, cause, evidence, and accountable action"
          }
        >
          {scenarioActive ? (
            <div className="space-y-4">
              <div>
                <p className="text-[18px] font-semibold tracking-[-0.025em]">
                  {comparison?.lane ?? "One payment route"} is the decision lane.
                </p>
                <p className="mt-2 max-w-[78ch] text-[13px] leading-6 text-[var(--ink-soft)]">
                  These values use the controlled two-minute incident window. Network-wide
                  60-minute context remains below.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Incident approval", percent(incidentApproval), points(incidentApprovalDelta)],
                  ["Incident p95", milliseconds(incidentLatency), "affected route"],
                  ["Incident attempts", count(incidentAttempts), "same bounded window"],
                  ["Declined value", usd(incidentDeclinedValue), "observed in incident"],
                ].map(([label, value, detail]) => (
                  <div key={label} className="rounded-[14px] bg-[var(--danger-soft)] p-4">
                    <p className="label">{label}</p>
                    <p className="mt-2 text-[26px] font-semibold tracking-[-0.04em] text-[var(--danger)]">
                      {value}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--ink-muted)]">{detail}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <p className="max-w-[76ch] text-[13px] leading-6 text-[var(--ink-soft)]">
                Watch a route degrade, quantify the exposure, identify the cause, and ask Aura for
                an inspectable explanation. All activity is synthetic; people retain payment actions.
              </p>
              <button
                type="button"
                className="btn btn-primary min-h-11 shrink-0 px-5"
                disabled={incidentBusy}
                onClick={() => void startIncident()}
              >
                {incidentBusy ? "Starting incident…" : "Reveal the incident"}
              </button>
            </div>
          )}
          {storyMessage && (
            <p className="mt-3 text-[12px] text-[var(--ink-soft)]">{storyMessage}</p>
          )}
        </Card>
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

      {scenarioActive && overview && (
        <Card
          title="From evidence to accountable action"
          subtitle="The operating team sees what changed, why it matters, and what remains theirs to decide"
        >
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[14px] bg-[var(--surface-sunk)] p-4">
              <p className="label">What changed</p>
              <p className="mt-2 text-[13px] leading-5">
                Approval fell and timeout latency increased on{" "}
                <span className="font-semibold">{comparison?.lane ?? "the affected route"}</span>.
              </p>
            </div>
            <div className="rounded-[14px] bg-[var(--surface-sunk)] p-4">
              <p className="label">Why it matters</p>
              <p className="mt-2 text-[13px] leading-5">
                The affected route produced {usd(incidentDeclinedValue)} in declined value during
                the controlled incident window.
              </p>
            </div>
            <div className="rounded-[14px] bg-[var(--surface-sunk)] p-4">
              <p className="label">Who acts</p>
              <p className="mt-2 text-[13px] leading-5">
                Payments operations validates the evidence and chooses the response. Aura explains;
                it does not reroute or retry payments.
              </p>
            </div>
          </div>
        </Card>
      )}

      {scenarioActive && overview && (
        <section className="space-y-3">
          <div>
            <p className="label">Aura Analyst</p>
            <h2 className="section-title mt-1">Ask what changed and inspect the evidence</h2>
            <p className="mt-2 max-w-[80ch] text-[13px] leading-6 text-[var(--ink-soft)]">
              Ask in business language, continue the investigation, and open the generated SQL.
              The answer uses governed payment context; your team owns the operational decision.
            </p>
          </div>
          <AnalystWorkspace
            anchorId={ANCHOR_ID}
            guardrailText={overview.anchor.guardrailText}
            humanOwnership={overview.anchor.humanOwnership}
          />
        </section>
      )}

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
          subtitle={`${count(displayedDeclines)} of ${count(totalDeclines)} declines grouped by business reason`}
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
