"use client";

/**
 * The architecture story, for the technical half of the room.
 *
 * It answers the three questions that decide a technical evaluation: what runs
 * where, what Aura Analyst is allowed to see, and how the demo stays
 * reproducible.
 */

import Link from "next/link";
import { useDemoState } from "@/components/DemoStateProvider";
import { Card, Pill } from "@/components/ui";
import { count } from "@/lib/format";

const LAYERS = [
  {
    name: "Browser",
    detail: "Next.js App Router pages. No API key, no database credential, no direct Aura call.",
    items: ["Anchor pages", "Presenter controls", "Analyst chat panel"],
  },
  {
    name: "Next.js server",
    detail:
      "Route handlers own every secret. Widget SQL, the Aura proxy, role checks and the control plane writer all run here.",
    items: [
      "/api/v1/anchors/* deterministic widget SQL",
      "/api/v1/analyst/* Aura proxy and SSE relay",
      "/api/v1/simulator/*, /api/v1/demo/reset control commands",
    ],
  },
  {
    name: "SingleStore",
    detail:
      "One engine holds the synthetic world, the curated views Aura reads, and the control tables the simulator and app coordinate through.",
    items: [
      "payment_event, dim_* synthetic data",
      "aa_* curated views, the only surface a Domain sees",
      "demo_active_run, demo_command, demo_audit control plane",
    ],
  },
  {
    name: "Python simulator",
    detail:
      "A single leader process advances the logical clock, emits events, and executes queued commands. It never talks to the browser.",
    items: ["Deterministic generator", "Scenario injection", "Reset by cloning the template run"],
  },
  {
    name: "Aura Analyst",
    detail:
      "A separate workspace attached read-only. Each anchor gets its own Domain and its own Domain-scoped key.",
    items: ["/query for one-shot answers", "/chat for conversation", "Generated SQL shown on demand"],
  },
];

const GUARANTEES = [
  {
    title: "Determinism",
    body: "Every value is derived from a seeded hash of (seed, run, minute, position), so the same seed and epoch reproduce the same rows in the same order regardless of how the run is paced or restarted.",
  },
  {
    title: "Logical time",
    body: "Widgets and views filter on demo_active_run.logical_time rather than the wall clock. Pausing the simulator genuinely freezes every number on screen.",
  },
  {
    title: "Atomic scenarios",
    body: "An injection pauses the stream, writes its window in one transaction with the affected lane suppressed from background generation, then resumes. An idempotency key makes a retry a no-op.",
  },
  {
    title: "Fast reset",
    body: "A verified template run is seeded once. Reset clones it with INSERT ... SELECT and repoints the active run, so recovery is a copy rather than a regeneration.",
  },
  {
    title: "Safe concurrency",
    body: "Control calls carry the state version they were rendered from. A click made against a stale view is rejected with 409 instead of applied to a run that has moved on.",
  },
  {
    title: "Boundaries",
    body: "Aura sees only aa_* views scoped to the active run and the logical clock. It cannot read control tables, and it cannot write anything.",
  },
];

export default function ArchitecturePage() {
  const { config, envelope } = useDemoState();
  const run = envelope?.run;

  return (
    <div className="space-y-5">
      <header>
        <p className="label">Analytics Governance · Analytics Integration Architecture</p>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Architecture</h1>
        <p className="mt-1 max-w-[85ch] text-[13px] leading-6 text-[var(--ink-soft)]">
          One engine, one Analyst deployment, one deterministic data generator. The demo is modular
          in the sense that matters: adding an anchor means adding views, a generator segment, a
          scenario and a Domain, and nothing else changes. For buyer-facing differentiation and AI
          cost talk tracks, open{" "}
          <Link href="/value" className="font-semibold text-[var(--accent-dark)] hover:underline">
            Value stories
          </Link>
          .
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-5">
        {LAYERS.map((layer, index) => (
          <Card key={layer.name} title={`${index + 1}. ${layer.name}`}>
            <p className="text-[12px] leading-5 text-[var(--ink-soft)]">{layer.detail}</p>
            <ul className="mt-2 space-y-1">
              {layer.items.map((item) => (
                <li key={item} className="mono text-[11px] leading-4 text-[var(--ink-muted)]">
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Card
        title="Request path for one question"
        subtitle="Nothing in the browser ever holds a credential"
      >
        <ol className="space-y-2 text-[12px] leading-5">
          {[
            "The browser posts the question to /api/v1/analyst/chat with the anchor id and the selected mode.",
            "The route resolves the mode, then reads the Domain-scoped key for that anchor from the server environment.",
            "Aura Analyst plans, generates SQL, and runs it against the curated views in that anchor's Domain.",
            "The response streams back through the route untouched; the app taps only the session id so a follow-up question keeps context.",
            "If the call fails and mode is auto, a reviewed fixture is replayed as the same event sequence and the panel says so on screen.",
          ].map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="mono shrink-0 text-[var(--accent)]">{index + 1}</span>
              <span className="text-[var(--ink-soft)]">{step}</span>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {GUARANTEES.map((guarantee) => (
          <Card key={guarantee.title} title={guarantee.title}>
            <p className="text-[12px] leading-5 text-[var(--ink-soft)]">{guarantee.body}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="This run" subtitle="The reproducibility contract, instantiated">
          <dl className="space-y-1.5 text-[12px]">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--ink-muted)]">Seed</dt>
              <dd className="mono">{config?.fixture.seed ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--ink-muted)]">Logical epoch</dt>
              <dd className="mono">{config?.fixture.epoch ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--ink-muted)]">Baseline days</dt>
              <dd className="mono">{config?.fixture.baseline_days ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--ink-muted)]">Baseline checksum</dt>
              <dd className="mono break-all text-right">{run?.baseline_checksum ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--ink-muted)]">Rows</dt>
              <dd className="mono text-right">
                {run
                  ? Object.entries(run.row_counts)
                      .map(([table, rows]) => `${table} ${count(rows)}`)
                      .join(" · ")
                  : "—"}
              </dd>
            </div>
          </dl>
        </Card>

        <Card
          title="Domain surface"
          subtitle="Everything Aura Analyst can see for A2, and nothing else"
        >
          <ul className="space-y-2 text-[12px]">
            {[
              {
                view: "aa_payment_performance_hourly",
                purpose: "Hourly attempts, approvals, timeouts, latency by lane",
              },
              {
                view: "aa_payment_decline_mix",
                purpose: "Declines by merchant category and response code",
              },
              {
                view: "aa_payment_event_sample",
                purpose: "Bounded sample of individual attempts for drill-down",
              },
            ].map((entry) => (
              <li key={entry.view} className="flex items-start justify-between gap-3">
                <span className="mono">{entry.view}</span>
                <span className="text-right text-[var(--ink-muted)]">{entry.purpose}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Pill tone="good">read-only attachment</Pill>
            <Pill tone="good">run-scoped</Pill>
            <Pill tone="good">logical-clock filtered</Pill>
            <Pill tone="bad">no control tables</Pill>
          </div>
        </Card>
      </div>
    </div>
  );
}
