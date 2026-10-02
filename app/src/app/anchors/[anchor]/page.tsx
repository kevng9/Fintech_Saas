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
import { useCallback, useEffect, useRef, useState } from "react";
import { AnalystWorkspace } from "@/components/a2/AnalystWorkspace";
import { ScenarioPanel } from "@/components/a2/ScenarioPanel";
import { SharedDrivers } from "@/components/anchors/SharedDrivers";
import { SharedKpiTile } from "@/components/anchors/SharedKpiTile";
import { SharedSeriesChart } from "@/components/anchors/SharedSeriesChart";
import { SharedTable } from "@/components/anchors/SharedTable";
import { SharedWhatChanged } from "@/components/anchors/SharedWhatChanged";
import { useDemoState } from "@/components/DemoStateProvider";
import { LiveUpdatesBanner } from "@/components/LiveUpdatesBanner";
import { Banner, Card, Pill, Skeleton } from "@/components/ui";
import { count, formatMetric, logicalTime } from "@/lib/format";
import type { SharedOverviewPayload } from "@/lib/apiTypes";

const DEFAULT_WINDOW_CHOICES = [15, 60, 180, 720];
const DIGITAL_WINDOW_CHOICES = [60, 720, 1440, 10080];

function windowLabel(minutes: number): string {
  if (minutes === 10080) return "7d";
  if (minutes === 1440) return "24h";
  return minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`;
}

export default function SharedAnchorOverviewPage() {
  const params = useParams<{ anchor: string }>();
  const anchorId = params.anchor?.toLowerCase() ?? "";
  const { envelope, config, presentationMode, busyAction, inject } = useDemoState();
  const [windowMinutes, setWindowMinutes] = useState(() => (anchorId === "a1" ? 10080 : 60));
  const [overview, setOverview] = useState<SharedOverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storyMessage, setStoryMessage] = useState<string | null>(null);
  const storyStartedRef = useRef(false);

  const anchorSummary = config?.anchors.find((item) => item.id === anchorId);
  const windowChoices = anchorId === "a1" ? DIGITAL_WINDOW_CHOICES : DEFAULT_WINDOW_CHOICES;

  useEffect(() => {
    setWindowMinutes(anchorId === "a1" ? 10080 : 60);
    storyStartedRef.current = false;
    setStoryMessage(null);
  }, [anchorId]);

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

  const scenarioId = overview?.anchor.primaryScenarioId ?? anchorSummary?.primaryScenarioId ?? null;
  const scenarioActive = (envelope?.executions ?? []).some(
    (execution) => execution.scenario_id === scenarioId && execution.status === "complete"
  );
  const startStory = useCallback(async () => {
    if (!scenarioId) return;
    setStoryMessage(null);
    const result = await inject(scenarioId);
    if (!result.ok) {
      setStoryMessage(result.message ?? "The decision moment could not be started.");
      return;
    }
    setStoryMessage("The change is now visible. Follow it from signal to evidence to the decision owner.");
  }, [inject, scenarioId]);

  useEffect(() => {
    if (storyStartedRef.current || !envelope?.state || scenarioActive || !scenarioId) return;
    if (new URLSearchParams(window.location.search).get("story") !== "decision") return;
    storyStartedRef.current = true;
    void startStory();
  }, [envelope?.state, scenarioActive, scenarioId, startStory]);

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

  const lowSample = overview?.kpis.some((kpi) => kpi.statusLabel === "Low sample") ?? false;
  const needsAttention =
    overview?.kpis.some((kpi) => {
      if (kpi.statusTone === "bad") return true;
      if (kpi.statusLabel) return false;
      if (kpi.delta === null) return false;
      const threshold = kpi.format === "percent" ? 0.0005 : 1;
      const adverse = (kpi.higherIsBetter ?? true) ? kpi.delta < 0 : kpi.delta > 0;
      return adverse && Math.abs(kpi.delta) > threshold;
    }) ?? false;
  const operatingLabel = scenarioActive
    ? "Operational change detected"
    : lowSample
      ? "Limited activity in selected window"
      : needsAttention
        ? "Performance needs attention"
        : "Current window stable";
  const operatingConcern = scenarioActive || lowSample || needsAttention;

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
                className={`h-2 w-2 rounded-full ${operatingConcern ? "bg-[#ffb45e]" : "bg-[var(--lime)]"}`}
              />
              <span
                className={`text-[10px] font-bold tracking-[0.1em] uppercase ${
                  operatingConcern ? "text-[#ffd09b]" : "text-[var(--lime)]"
                }`}
              >
                {operatingLabel}
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
              {windowChoices.map((choice) => (
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
                  {windowLabel(choice)}
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
      {overview && (
        <LiveUpdatesBanner
          leaderAlive={overview.state.leader_alive}
          streamStatus={overview.state.stream_status}
        />
      )}
      {presentationMode && scenarioId && (
        <Card
          title={scenarioActive ? "Decision moment" : `A decision for the ${anchorSummary?.jobTitle ?? "operating owner"}`}
          subtitle={overview?.anchor.criticalBusinessIssue ?? anchorSummary?.criticalBusinessIssue}
        >
          {scenarioActive && overview?.change ? (
            <div className="space-y-4">
              <p className="text-[18px] font-semibold tracking-[-0.025em]">{overview.change.segmentLabel}</p>
              {overview.change.narrative && (
                <p className="max-w-[82ch] text-[13px] leading-6 text-[var(--ink-soft)]">
                  {overview.change.narrative}
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {overview.change.rows.slice(0, 4).map((row) => (
                  <div key={row.key} className="rounded-[14px] bg-[var(--surface-sunk)] p-4">
                    <p className="label">{row.label}</p>
                    <p className="mt-2 text-[24px] font-semibold tracking-[-0.04em]">
                      {formatMetric(row.after, row.format)}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
                      {row.expected !== null
                        ? `Expected ${formatMetric(row.expected, row.format)}`
                        : `Compared with ${formatMetric(row.before, row.format)}`}
                    </p>
                  </div>
                ))}
              </div>
              {(overview.anchor.humanOwnership ?? anchorSummary?.humanOwnership) && (
                <p className="text-[13px] leading-6">
                  <span className="font-semibold">Who acts. </span>
                  {overview.anchor.humanOwnership ?? anchorSummary?.humanOwnership}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <p className="max-w-[76ch] text-[13px] leading-6 text-[var(--ink-soft)]">
                Reveal the controlled change for this role, then follow the evidence to the person
                who still owns the decision. All activity is synthetic.
              </p>
              <button
                type="button"
                className="btn btn-primary min-h-11 shrink-0 px-5"
                disabled={busyAction === `inject:${scenarioId}`}
                onClick={() => void startStory()}
              >
                {busyAction === `inject:${scenarioId}` ? "Starting…" : "Reveal the decision"}
              </button>
            </div>
          )}
          {storyMessage && <p className="mt-3 text-[12px] text-[var(--ink-soft)]">{storyMessage}</p>}
        </Card>
      )}

      {scenarioActive && overview && (
        <section className="space-y-3">
          <div>
            <p className="label">Aura Analyst</p>
            <h2 className="section-title mt-1">Ask what changed and inspect the evidence</h2>
          </div>
          <AnalystWorkspace
            anchorId={anchorId}
            guardrailText={overview.anchor.guardrailText}
            humanOwnership={overview.anchor.humanOwnership}
          />
        </section>
      )}

      <div>
        <p className="label">Key operating signals</p>
        <h2 className="section-title mt-1">Current operating picture</h2>
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

      {!presentationMode && anchorSummary && (
        <p className="text-[11px] text-[var(--ink-muted)]">
          <Pill tone="neutral">{anchorSummary.estimatedMinutes} min walkthrough</Pill>
        </p>
      )}
    </div>
  );
}
