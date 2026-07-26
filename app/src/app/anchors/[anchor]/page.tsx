"use client";

/**
 * Shared anchor overview for A1 and A3-A8.
 *
 * The static `/anchors/a2` route takes priority for A2's bespoke page,
 * so this dynamic route renders every other available anchor from the
 * generic `SharedOverviewPayload` returned by the metrics registry. One
 * page renders all seven anchors: headline KPIs, a trend if the anchor
 * publishes one, ranked drivers, a determinism proof for the anchor's
 * scenario, and the natural-language workspace.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ScenarioPanel } from "@/components/a2/ScenarioPanel";
import { SharedDrivers } from "@/components/anchors/SharedDrivers";
import { SharedKpiTile } from "@/components/anchors/SharedKpiTile";
import { SharedSeriesChart } from "@/components/anchors/SharedSeriesChart";
import { SharedTable } from "@/components/anchors/SharedTable";
import { SharedWhatChanged } from "@/components/anchors/SharedWhatChanged";
import { useDemoState } from "@/components/DemoStateProvider";
import { Banner, Card, Pill, Skeleton } from "@/components/ui";
import { count, logicalTime } from "@/lib/format";
import type { SharedOverviewPayload } from "@/lib/apiTypes";

const WINDOW_CHOICES = [15, 60, 180, 720];

export default function SharedAnchorOverviewPage() {
  const params = useParams<{ anchor: string }>();
  const anchorId = params.anchor?.toLowerCase() ?? "";
  const { envelope, config, presentationMode } = useDemoState();
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [overview, setOverview] = useState<SharedOverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const anchorSummary = config?.anchors.find((item) => item.id === anchorId);

  const stateSignature = envelope
    ? `${envelope.state.run_id}:${envelope.state.logical_time}:${envelope.state.state_version}`
    : "none";

  const load = useCallback(async () => {
    if (!anchorId) return;
    try {
      const response = await fetch(`/api/v1/anchors/${anchorId}/overview?window=${windowMinutes}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(body.error?.message ?? `Overview unavailable (${response.status}).`);
        return;
      }
      setOverview((await response.json()) as SharedOverviewPayload);
      setError(null);
    } catch {
      setError("Cannot reach the demo API.");
    }
  }, [anchorId, windowMinutes]);

  useEffect(() => {
    void load();
  }, [load, stateSignature]);

  if (config && !anchorSummary) {
    return (
      <Card title="Unknown anchor">
        <p className="text-[13px]">
          There is no anchor <span className="mono">{anchorId}</span> in this build.{" "}
          <Link href="/" className="text-[var(--accent-dark)] hover:underline">
            Return to the launchpad
          </Link>
          .
        </p>
      </Card>
    );
  }

  const scenarioActive = (envelope?.executions ?? []).some(
    (execution) =>
      execution.scenario_id === (overview?.anchor.primaryScenarioId ?? anchorSummary?.primaryScenarioId) &&
      execution.status === "complete"
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--ink-muted)]">
        <Link href="/" className="hover:text-[var(--accent-dark)]">
          Overview
        </Link>
        <span>/</span>
        <span className="text-[var(--ink)]">{anchorSummary?.name ?? anchorId.toUpperCase()}</span>
      </div>

      <header className="business-hero px-7 py-7 lg:px-9">
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-7">
          <div className="max-w-[760px]">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${scenarioActive ? "bg-[#ff8c9b]" : "bg-[var(--lime)]"}`}
              />
              <span
                className={`text-[10px] font-bold tracking-[0.1em] uppercase ${
                  scenarioActive ? "text-[#ffb5bf]" : "text-[var(--lime)]"
                }`}
              >
                {scenarioActive ? "Operational change detected" : "Nominal"}
              </span>
            </div>
            <h1 className="mt-3 text-[34px] font-semibold tracking-[-0.05em]">
              {overview?.anchor.name ?? anchorSummary?.name}
            </h1>
            <p className="mt-2 max-w-[68ch] text-[13px] leading-6 text-white/58">
              {overview?.anchor.criticalBusinessIssue ?? anchorSummary?.criticalBusinessIssue}
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
              Latest event{" "}
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
          Live updates are paused. Open Demo controls to resume the environment.
        </Banner>
      )}
      {(overview?.anchor.humanOwnership ?? anchorSummary?.humanOwnership) && (
        <Banner tone="accent">{overview?.anchor.humanOwnership ?? anchorSummary?.humanOwnership}</Banner>
      )}

      <div>
        <p className="label">Key operating signals</p>
        <h2 className="section-title mt-1">This anchor at a glance</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {overview ? (
          overview.kpis.map((kpi) => <SharedKpiTile key={kpi.id} kpi={kpi} />)
        ) : (
          <div className="card p-4 sm:col-span-2 xl:col-span-4">
            <Skeleton rows={3} />
          </div>
        )}
      </div>

      {overview?.series && (
        <Card
          title={overview.series.title}
          subtitle={overview.series.subtitle}
          footnote={overview.anchor.criticalBusinessIssue}
        >
          <SharedSeriesChart data={overview.series} />
        </Card>
      )}

      {overview?.drivers && (
        <Card title={overview.drivers.title} subtitle={overview.drivers.subtitle}>
          <SharedDrivers data={overview.drivers} anchorId={anchorId} />
        </Card>
      )}

      {overview?.tables && (
        <Card title={overview.tables.title} subtitle={overview.tables.subtitle}>
          <SharedTable data={overview.tables} anchorId={anchorId} />
        </Card>
      )}

      <Card
        title="Change impact"
        subtitle="Before-and-after evidence for the affected window"
        footnote="Measured values are compared with the expected operating impact."
      >
        {overview ? <SharedWhatChanged comparison={overview.change} /> : <Skeleton rows={4} />}
      </Card>

      {!presentationMode && <ScenarioPanel anchorId={anchorId} />}

      {anchorSummary && (
        <p className="text-[11px] text-[var(--ink-muted)]">
          <Pill tone="neutral">{anchorSummary.estimatedMinutes} min walkthrough</Pill>
        </p>
      )}
    </div>
  );
}
