"use client";

/** Business-facing overview for the synthetic payments operation. */

import Link from "next/link";
import { useDemoState } from "@/components/DemoStateProvider";
import { Banner, Pill, Skeleton } from "@/components/ui";
import { count, logicalTime } from "@/lib/format";
import type { AnchorSummaryPayload } from "@/lib/apiTypes";

const CAPABILITY_ICON: Record<string, string> = {
  a1: "↗",
  a2: "◉",
  a3: "⌁",
  a4: "◎",
  a5: "⇄",
  a6: "≋",
  a7: "◇",
  a8: "✦",
};

function CapabilityCard({ anchor }: { anchor: AnchorSummaryPayload }) {
  const available = anchor.status === "available";
  const cardClass = `group rounded-[15px] border p-4 transition-all ${
    available
      ? "border-[var(--line)] bg-white shadow-[var(--shadow-sm)] hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(7,28,23,.1)]"
      : "border-[var(--line)] bg-[var(--surface-raised)]"
  }`;
  const content = (
    <div className="flex items-start gap-3">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[16px] ${
          available
            ? "bg-[var(--accent-soft)] text-[var(--accent-dark)]"
            : "bg-[var(--surface-sunk)] text-[var(--ink-muted)]"
        }`}
      >
        {CAPABILITY_ICON[anchor.id] ?? "•"}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[13px] font-semibold">{anchor.name}</h3>
          {available && <Pill tone="good">Live</Pill>}
        </div>
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--ink-muted)]">
          {anchor.takeaway}
        </p>
      </div>
    </div>
  );

  if (!available) {
    return <div className={cardClass}>{content}</div>;
  }

  return (
    <Link href={`/anchors/${anchor.id}`} className={cardClass}>
      {content}
    </Link>
  );
}

export default function LaunchpadPage() {
  const { config, envelope } = useDemoState();
  const state = envelope?.state;
  const run = envelope?.run;
  const availableAnchor = config?.anchors.find((anchor) => anchor.status === "available");
  const paymentEvents = run?.row_counts.payment_event;
  const totalRows = run
    ? Object.values(run.row_counts).reduce((sum, rows) => sum + Number(rows), 0)
    : null;

  return (
    <div className="space-y-8">
      {!state && (
        <Banner tone="bad">
          The payments environment is not connected. Open Demo controls for operator details.
        </Banner>
      )}

      <section className="business-hero grid min-h-[360px] gap-8 px-8 py-9 lg:grid-cols-[1.25fr_.75fr] lg:px-12 lg:py-12">
        <div className="relative z-10 flex max-w-[720px] flex-col items-start justify-center">
          <div className="mb-5 flex items-center gap-2 text-[10px] font-bold tracking-[0.12em] text-[var(--lime)] uppercase">
            <span className="h-px w-6 bg-[var(--lime)]" />
            Payment operations
          </div>
          <h1 className="max-w-[680px] text-[42px] leading-[1.04] font-semibold tracking-[-0.055em] sm:text-[54px]">
            See revenue risk before customers feel it.
          </h1>
          <p className="mt-5 max-w-[620px] text-[15px] leading-6 text-white/64">
            Monitor every authorization, find the lane driving a decline, and move from signal to
            evidence in minutes.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/anchors/a2"
              className="inline-flex items-center gap-2 rounded-[11px] bg-[var(--lime)] px-5 py-3 text-[13px] font-bold text-[var(--navy)] transition-transform hover:-translate-y-0.5"
            >
              Open payment operations
              <span aria-hidden>→</span>
            </Link>
            <span className="text-[11px] text-white/45">Live synthetic authorization network</span>
          </div>
        </div>

        <div className="relative z-10 flex items-center">
          <div className="w-full rounded-[20px] border border-white/10 bg-white/[0.055] p-5 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-white/50">Authorization network</p>
                <p className="mt-1 text-[15px] font-semibold">Operating normally</p>
              </div>
              <span className="flex items-center gap-2 rounded-full bg-[var(--lime)]/10 px-3 py-1.5 text-[10px] font-bold text-[var(--lime)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--lime)]" />
                LIVE
              </span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="glass-stat p-4">
                <p className="text-[10px] font-semibold tracking-[0.08em] text-white/40 uppercase">
                  Authorizations
                </p>
                <p className="mt-2 text-[27px] font-semibold tracking-[-0.04em]">
                  {count(paymentEvents)}
                </p>
                <p className="mt-1 text-[10px] text-white/40">in active business run</p>
              </div>
              <div className="glass-stat p-4">
                <p className="text-[10px] font-semibold tracking-[0.08em] text-white/40 uppercase">
                  Intelligence
                </p>
                <p className="mt-2 text-[27px] font-semibold tracking-[-0.04em]">Always on</p>
                <p className="mt-1 text-[10px] text-white/40">deterministic + Analyst</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-4 text-[10px] text-white/40">
              <span>{config?.fixture.baseline_days ?? 7}-day operating baseline</span>
              <span>{state ? logicalTime(state.logical_time) : "Connecting…"}</span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="label">Today&apos;s focus</p>
            <h2 className="section-title mt-1">Protect payment revenue</h2>
          </div>
          <Link
            href="/anchors/a2"
            className="text-[12px] font-semibold text-[var(--accent-dark)] hover:underline"
          >
            View operations →
          </Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Link
            href="/anchors/a2"
            className="card group overflow-hidden p-6 transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(7,28,23,.1)]"
          >
            <div className="flex h-full flex-col sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-[620px]">
                <div className="flex items-center gap-2">
                  <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-[var(--accent-soft)] text-xl text-[var(--accent-dark)]">
                    ◉
                  </span>
                  <Pill tone="good">Monitoring live</Pill>
                </div>
                <h3 className="mt-5 text-[23px] font-semibold tracking-[-0.035em]">
                  Payment Pulse
                </h3>
                <p className="mt-2 max-w-[58ch] text-[13px] leading-6 text-[var(--ink-soft)]">
                  {availableAnchor?.criticalBusinessIssue ??
                    "Keep approval rates high and latency inside contracted thresholds across every payment lane."}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {["Approval health", "Processor performance", "Decline intelligence"].map(
                    (label) => (
                      <span
                        key={label}
                        className="rounded-full border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1.5 text-[10px] font-semibold text-[var(--ink-soft)]"
                      >
                        {label}
                      </span>
                    )
                  )}
                </div>
              </div>
              <span className="mt-6 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--navy)] text-white transition-transform group-hover:translate-x-1 sm:mt-0">
                →
              </span>
            </div>
          </Link>

          <div className="card p-6">
            <p className="label">Operating context</p>
            {run ? (
              <dl className="mt-4 space-y-4">
                <div className="flex items-end justify-between border-b border-[var(--line)] pb-3">
                  <dt className="text-[12px] text-[var(--ink-muted)]">Business records</dt>
                  <dd className="text-[18px] font-semibold tracking-[-0.03em]">{count(totalRows)}</dd>
                </div>
                <div className="flex items-end justify-between border-b border-[var(--line)] pb-3">
                  <dt className="text-[12px] text-[var(--ink-muted)]">Baseline depth</dt>
                  <dd className="text-[14px] font-semibold">
                    {config?.fixture.baseline_days ?? 7} days
                  </dd>
                </div>
                <div className="flex items-end justify-between">
                  <dt className="text-[12px] text-[var(--ink-muted)]">Scenario status</dt>
                  <dd className="text-[12px] font-semibold text-[var(--good)]">
                    {envelope?.executions.length ? "Event active" : "Normal operations"}
                  </dd>
                </div>
              </dl>
            ) : (
              <div className="mt-4">
                <Skeleton rows={4} />
              </div>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4">
          <p className="label">Intelligence suite</p>
          <h2 className="section-title mt-1">One view across the financial journey</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(config?.anchors ?? []).map((anchor) => (
            <CapabilityCard key={anchor.id} anchor={anchor} />
          ))}
          {!config && <Skeleton rows={6} />}
        </div>
      </section>
    </div>
  );
}
