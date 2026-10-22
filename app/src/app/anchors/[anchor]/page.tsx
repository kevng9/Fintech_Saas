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
import { OneQueryPanel } from "@/components/anchors/OneQueryPanel";
import { SharedKpiTile } from "@/components/anchors/SharedKpiTile";
import { SharedSeriesChart } from "@/components/anchors/SharedSeriesChart";
import { SharedTable } from "@/components/anchors/SharedTable";
import { SharedWhatChanged } from "@/components/anchors/SharedWhatChanged";
import { useDemoState } from "@/components/DemoStateProvider";
import { LiveUpdatesBanner } from "@/components/LiveUpdatesBanner";
import { Banner, Card, Pill, Skeleton } from "@/components/ui";
import { A3_PROOF_QUESTION } from "@/lib/anchors/a3";
import { count, formatMetric, logicalTime } from "@/lib/format";
import type { SharedOverviewPayload } from "@/lib/apiTypes";

const DEFAULT_WINDOW_CHOICES = [15, 60, 180, 720];
const DIGITAL_WINDOW_CHOICES = [60, 720, 1440, 10080];
const LIVE_DECISIONS = [
  {
    id: "A3_LIVE_CLEARS",
    label: "1. Step-up clears a false decline",
    body: "A card-not-present charge from an unfamiliar country scores high enough to stop. The customer approves that same payment from the phone registered to the account. The retry is approved. The case closes legitimate, and nothing is written off.",
    done: "Step-up recorded",
    action: "Show the step-up",
    started: "The charge was stopped, then the customer approved the same payment. The case is legitimate and nothing was written off.",
  },
  {
    id: "A3_LIVE_CONFIRMS",
    label: "2. Live velocity confirms card testing",
    body: "A $2 authorization is approved. Within a few minutes the same device sends security-code failures and a larger charge. Those later attempts are declined, and one case is opened for review. Confirmed loss waits for an investigator.",
    done: "Burst recorded",
    action: "Show the burst",
    started: "The first $2 authorization was approved. Later attempts from the same device were declined, and one case is open for review.",
  },
] as const;

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
  const [decisionMessage, setDecisionMessage] = useState<string | null>(null);
  const storyStartedRef = useRef(false);

  const anchorSummary = config?.anchors.find((item) => item.id === anchorId);
  const windowChoices = anchorId === "a1" ? DIGITAL_WINDOW_CHOICES : DEFAULT_WINDOW_CHOICES;

  const runId = envelope?.state.run_id ?? null;

  useEffect(() => {
    setWindowMinutes(anchorId === "a1" ? 10080 : 60);
    storyStartedRef.current = false;
    setStoryMessage(null);
    setDecisionMessage(null);
  }, [anchorId]);

  useEffect(() => {
    setStoryMessage(null);
    setDecisionMessage(null);
  }, [runId]);

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

  const scenarioComplete = useCallback(
    (id: string) =>
      (envelope?.executions ?? []).some(
        (execution) => execution.scenario_id === id && execution.status === "complete",
      ),
    [envelope?.executions],
  );

  const startNamed = useCallback(
    async (id: (typeof LIVE_DECISIONS)[number]["id"]) => {
      const decision = LIVE_DECISIONS.find((item) => item.id === id);
      setDecisionMessage(null);
      const result = await inject(id);
      if (!result.ok) {
        setDecisionMessage(result.message ?? "That decision could not be started.");
        return;
      }
      setDecisionMessage(decision?.started ?? "The decision is now visible.");
    },
    [inject],
  );

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

      {anchorId === "a3" && (
        <p className="text-[12px] text-[var(--ink-soft)]">
          <Link href="/anchors/a3/copy-path" className="font-semibold text-[var(--accent-dark)] hover:underline">
            Compare this burst on a copy path
          </Link>
        </p>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
      {overview && (
        <LiveUpdatesBanner
          leaderAlive={overview.state.leader_alive}
          streamStatus={overview.state.stream_status}
        />
      )}
      {presentationMode && scenarioId && anchorId === "a3" && (
        <Card
          title="One question, then the live cases arrive"
          subtitle="The same query reads the new activity. A warehouse loaded overnight would still show the first answer."
        >
          <ol className="grid gap-3 md:grid-cols-3">
            <li className="rounded-[14px] bg-[var(--surface-sunk)] p-4">
              <p className="label">1. Baseline</p>
              <p className="mt-2 text-[13px] leading-5">
                Analytics is on the last batch. Live transactions are not updated in real time. Ask
                the featured question. The answer is labeled Before live activity.
              </p>
            </li>
            <li className="rounded-[14px] bg-[var(--surface-sunk)] p-4">
              <p className="label">2. Live data</p>
              <p className="mt-2 text-[13px] leading-5">
                {scenarioActive
                  ? "Live transactions are now included in analytics. The clock is stopped at that moment."
                  : "The analytical picture is still the last batch. Start the feed to include the new transactions."}
              </p>
              <button
                type="button"
                className="btn btn-primary mt-3 min-h-11 px-4"
                disabled={scenarioActive || busyAction === `inject:${scenarioId}`}
                onClick={() => void startStory()}
              >
                {scenarioActive
                  ? "Live data included"
                  : busyAction === `inject:${scenarioId}`
                    ? "Starting…"
                    : "Start live data"}
              </button>
            </li>
            <li className="rounded-[14px] bg-[var(--surface-sunk)] p-4">
              <p className="label">3. Ask again</p>
              <p className="mt-2 text-[13px] leading-5">
                Use Ask again with current data. Similarity, reason codes, the 10-minute peak, loss,
                and false positives are recalculated together.
              </p>
            </li>
          </ol>
          {scenarioActive && overview?.change && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {overview.change.rows.slice(0, 4).map((row) => (
                <div key={row.key} className="rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-4">
                  <p className="label">{row.label}</p>
                  <p className="mt-2 text-[24px] font-semibold tracking-[-0.04em]">
                    {formatMetric(row.after, row.format)}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
                    Was {formatMetric(row.before, row.format)}
                  </p>
                </div>
              ))}
            </div>
          )}
          {storyMessage && <p className="mt-3 text-[12px] text-[var(--ink-soft)]">{storyMessage}</p>}
        </Card>
      )}
      {anchorId === "a3" && (
        <Card
          title="Two decisions that change while the attempts are still arriving"
          subtitle="These sit beside the card-testing loss cluster. A rule does not book a loss."
        >
          <div className="grid gap-3 md:grid-cols-2">
            {LIVE_DECISIONS.map((decision) => {
              const complete = scenarioComplete(decision.id);
              const starting = busyAction === `inject:${decision.id}`;
              return (
                <div key={decision.id} className="rounded-[14px] bg-[var(--surface-sunk)] p-4">
                  <p className="label">{decision.label}</p>
                  <p className="mt-2 text-[13px] leading-5">{decision.body}</p>
                  <button
                    type="button"
                    className="btn btn-primary mt-3 min-h-11 px-4"
                    disabled={complete || starting}
                    onClick={() => void startNamed(decision.id)}
                  >
                    {complete ? decision.done : starting ? "Starting…" : decision.action}
                  </button>
                </div>
              );
            })}
          </div>
          {decisionMessage && <p className="mt-3 text-[12px] text-[var(--ink-soft)]">{decisionMessage}</p>}
        </Card>
      )}
      {presentationMode && scenarioId && anchorId !== "a3" && (
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
                {busyAction === `inject:${scenarioId}` ? "Starting…" : "Start live data feed"}
              </button>
            </div>
          )}
          {storyMessage && <p className="mt-3 text-[12px] text-[var(--ink-soft)]">{storyMessage}</p>}
        </Card>
      )}

      {anchorId === "a3" && overview && <OneQueryPanel refreshKey={stateSignature} />}

      {(anchorId === "a3" || scenarioActive) && overview && (
        <section className="space-y-3">
          <div>
            <p className="label">Aura Analyst</p>
            <h2 className="section-title mt-1">
              {anchorId === "a3" && !scenarioActive
                ? "Ask while the operation is still quiet"
                : anchorId === "a3"
                  ? "Ask the same question on the data that just arrived"
                  : "Ask what changed and inspect the evidence"}
            </h2>
          </div>
          <AnalystWorkspace
            anchorId={anchorId}
            guardrailText={overview.anchor.guardrailText}
            humanOwnership={overview.anchor.humanOwnership}
            proofPhase={anchorId === "a3" ? (scenarioActive ? "after" : "before") : null}
            proofQuestion={anchorId === "a3" ? A3_PROOF_QUESTION : null}
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

      {anchorId === "a3" && (
        <Card
          title="Where would a late answer cost you?"
          subtitle="SingleStore runs in parallel for that workload. The systems that can wait a day stay where they are."
        >
          <p className="max-w-[78ch] text-[13px] leading-6">
            Which pipeline, read replica, or fraud system is expensive because its answer is late?
            That is the workload to run on SingleStore in parallel.
          </p>
        </Card>
      )}

      {!presentationMode && <ScenarioPanel anchorId={anchorId} />}

      {!presentationMode && anchorSummary && (
        <p className="text-[11px] text-[var(--ink-muted)]">
          <Pill tone="neutral">{anchorSummary.estimatedMinutes} min walkthrough</Pill>
        </p>
      )}
    </div>
  );
}
