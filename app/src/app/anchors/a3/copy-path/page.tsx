"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Banner, Pill } from "@/components/ui";

type Mode = "current" | "singlestore";
type Kind = "alert" | "disposition";

type FraudEvent = {
  at: string;
  minute: number;
  caseId: string;
  deviceId: string;
  kind: Kind;
  loss: number;
  detail: string;
};

/** The same seeded card-testing burst, in commit order. Loss moves only on a human disposition. */
const EVENTS: FraudEvent[] = [
  { at: "09:01", minute: 1, caseId: "FCASE-A3LC-003", deviceId: "DEV-0008", kind: "alert", loss: 0, detail: "Alert opened · velocity_breach" },
  { at: "09:02", minute: 2, caseId: "FCASE-A3LC-001", deviceId: "DEV-0008", kind: "alert", loss: 0, detail: "Alert opened · velocity_breach" },
  { at: "09:03", minute: 3, caseId: "FCASE-A3LC-002", deviceId: "DEV-0008", kind: "alert", loss: 0, detail: "Alert opened · velocity_breach" },
  { at: "09:03", minute: 3, caseId: "FCASE-A3LC-005", deviceId: "DEV-0011", kind: "alert", loss: 0, detail: "Alert opened · geo_anomaly" },
  { at: "09:04", minute: 4, caseId: "FCASE-A3LC-004", deviceId: "DEV-0008", kind: "alert", loss: 0, detail: "Alert opened · velocity_breach" },
  { at: "09:05", minute: 5, caseId: "FCASE-A3LC-000", deviceId: "DEV-0008", kind: "alert", loss: 0, detail: "Alert opened · velocity_breach" },
  { at: "09:06", minute: 6, caseId: "FCASE-A3LC-006", deviceId: "DEV-0014", kind: "alert", loss: 0, detail: "Alert opened · geo_anomaly" },
  { at: "09:06", minute: 6, caseId: "FCASE-A3LC-007", deviceId: "DEV-0018", kind: "alert", loss: 0, detail: "Alert opened · geo_anomaly" },
  { at: "09:07", minute: 7, caseId: "FCASE-A3LC-008", deviceId: "DEV-0021", kind: "alert", loss: 0, detail: "Alert opened · geo_anomaly" },
  { at: "09:07", minute: 7, caseId: "FCASE-A3LC-009", deviceId: "DEV-0022", kind: "alert", loss: 0, detail: "Alert opened · geo_anomaly" },
  { at: "09:08", minute: 8, caseId: "FCASE-A3LC-010", deviceId: "DEV-0024", kind: "alert", loss: 0, detail: "Alert opened · geo_anomaly" },
  { at: "09:08", minute: 8, caseId: "FCASE-A3LC-011", deviceId: "DEV-0027", kind: "alert", loss: 0, detail: "Alert opened · geo_anomaly" },
  { at: "09:08", minute: 8, caseId: "FCASE-A3LC-003", deviceId: "DEV-0008", kind: "disposition", loss: 601.22, detail: "Investigator: confirmed fraud" },
  { at: "09:09", minute: 9, caseId: "FCASE-A3LC-001", deviceId: "DEV-0008", kind: "disposition", loss: 538.9, detail: "Investigator: confirmed fraud" },
  { at: "09:09", minute: 9, caseId: "FCASE-A3LC-002", deviceId: "DEV-0008", kind: "disposition", loss: 487.15, detail: "Investigator: confirmed fraud" },
  { at: "09:09", minute: 9, caseId: "FCASE-A3LC-004", deviceId: "DEV-0008", kind: "disposition", loss: 460.36, detail: "Investigator: confirmed fraud" },
  { at: "09:09", minute: 9, caseId: "FCASE-A3LC-000", deviceId: "DEV-0008", kind: "disposition", loss: 412.37, detail: "Investigator: confirmed fraud" },
  { at: "09:10", minute: 10, caseId: "FCASE-A3LC-005", deviceId: "DEV-0011", kind: "disposition", loss: 0, detail: "Investigator: legitimate" },
  { at: "09:10", minute: 10, caseId: "FCASE-A3LC-006", deviceId: "DEV-0014", kind: "disposition", loss: 0, detail: "Investigator: legitimate" },
  { at: "09:10", minute: 10, caseId: "FCASE-A3LC-007", deviceId: "DEV-0018", kind: "disposition", loss: 0, detail: "Investigator: legitimate" },
  { at: "09:10", minute: 10, caseId: "FCASE-A3LC-008", deviceId: "DEV-0021", kind: "disposition", loss: 0, detail: "Investigator: legitimate" },
  { at: "09:10", minute: 10, caseId: "FCASE-A3LC-009", deviceId: "DEV-0022", kind: "disposition", loss: 0, detail: "Investigator: legitimate" },
  { at: "09:10", minute: 10, caseId: "FCASE-A3LC-010", deviceId: "DEV-0024", kind: "disposition", loss: 0, detail: "Investigator: legitimate" },
  { at: "09:10", minute: 10, caseId: "FCASE-A3LC-011", deviceId: "DEV-0027", kind: "disposition", loss: 0, detail: "Investigator: legitimate" },
];

const BATCH_STEP = EVENTS.length + 1;

function usd(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function clockFor(step: number): string {
  if (step <= 0) return "09:00";
  if (step >= BATCH_STEP) return "09:10";
  return EVENTS[step - 1]?.at ?? "09:00";
}

function minuteFor(step: number): number {
  if (step <= 0) return 0;
  if (step >= BATCH_STEP) return 10;
  return EVENTS[step - 1]?.minute ?? 0;
}

function happened(step: number): FraudEvent[] {
  return EVENTS.slice(0, Math.min(step, EVENTS.length));
}

function visibleToAnalytics(mode: Mode, step: number): FraudEvent[] {
  const committed = happened(step);
  if (mode === "singlestore") return committed;
  return step >= BATCH_STEP ? committed : [];
}

function rollingPeak(events: FraudEvent[], deviceId: string): number {
  const minutes = events
    .filter((event) => event.kind === "alert" && event.deviceId === deviceId)
    .map((event) => event.minute);
  let best = 0;
  for (const start of minutes) {
    const count = minutes.filter((minute) => minute >= start && minute < start + 10).length;
    if (count > best) best = count;
  }
  return best;
}

function summarize(events: FraudEvent[]) {
  const alerts = events.filter((event) => event.kind === "alert");
  const dispositions = events.filter((event) => event.kind === "disposition");
  return {
    alerts: alerts.length,
    peak: rollingPeak(events, "DEV-0008"),
    loss: dispositions.reduce((sum, event) => sum + event.loss, 0),
    falsePositives: dispositions.filter((event) => event.loss === 0).length,
  };
}

export default function FraudCopyPathPage() {
  const [mode, setMode] = useState<Mode>("current");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    if (step >= BATCH_STEP) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setStep((current) => Math.min(BATCH_STEP, current + 1)), 850);
    return () => window.clearTimeout(timer);
  }, [playing, step]);

  const operational = useMemo(() => happened(step), [step]);
  const currentAnalytics = useMemo(() => visibleToAnalytics("current", step), [step]);
  const liveAnalytics = useMemo(() => visibleToAnalytics("singlestore", step), [step]);
  const analytics = mode === "current" ? currentAnalytics : liveAnalytics;
  const stats = summarize(analytics);
  const operationalClock = clockFor(step);
  const analyticsClock = mode === "current" ? (step >= BATCH_STEP ? "09:10" : "09:00") : operationalClock;
  const lag = mode === "current" && step < BATCH_STEP ? minuteFor(step) : 0;
  const waiting = operational.length - analytics.length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[760px]">
          <p className="label">Fraud strategy · separate comparison</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.045em]">
            The same burst, two answers
          </h1>
          <p className="mt-2 max-w-[68ch] text-[13px] leading-6 text-[var(--ink-soft)]">
            Twelve card-testing alerts and their investigator outcomes commit on one clock. The
            copied analytical path keeps yesterday’s answer until the batch finishes. SingleStore
            is added beside the ledger and warehouse, so this decision can read each commit now.
          </p>
        </div>
        <Link href="/anchors/a3" className="text-[12px] font-semibold text-[var(--accent-dark)] hover:underline">
          Back to Fraud Strategy
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-1" role="tablist">
          {(
            [
              ["current", "Current state"],
              ["singlestore", "With SingleStore"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              className="min-h-11 rounded-[9px] px-4 text-[13px] font-semibold"
              style={{
                background: mode === id ? "var(--navy)" : "transparent",
                color: mode === id ? "#fff" : "var(--ink-soft)",
              }}
              onClick={() => setMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-primary min-h-11 px-4"
          onClick={() => {
            if (step >= BATCH_STEP) {
              setStep(0);
              setPlaying(true);
              return;
            }
            setPlaying((value) => !value);
          }}
        >
          {playing ? "Pause" : step >= BATCH_STEP ? "Replay" : "Play"}
        </button>
        <button
          type="button"
          className="btn min-h-11 px-4"
          onClick={() => {
            setPlaying(false);
            setStep(0);
          }}
        >
          Start over
        </button>
        <label className="ml-auto flex min-w-[220px] flex-1 items-center gap-3 text-[11px] text-[var(--ink-muted)]">
          <span className="mono">{operationalClock}</span>
          <input
            type="range"
            min={0}
            max={BATCH_STEP}
            value={step}
            aria-label="Replay position"
            className="w-full"
            onChange={(event) => {
              setPlaying(false);
              setStep(Number(event.target.value));
            }}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ComparisonFact
          label="Current state"
          asOf={step >= BATCH_STEP ? "09:10" : "09:00"}
          behind={step > 0 && step < BATCH_STEP ? minuteFor(step) : 0}
          active={mode === "current"}
        />
        <ComparisonFact
          label="With SingleStore"
          asOf={operationalClock}
          behind={0}
          active={mode === "singlestore"}
        />
      </div>

      <section className="grid items-start gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="label">{mode === "current" ? "Copy / batch path" : "Committed events"}</p>
              <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.03em]">
                Operational clock {operationalClock}
              </h2>
            </div>
            <Pill tone={waiting > 0 ? "warn" : "good"}>
              {waiting > 0 ? `${waiting} waiting for copy` : "Nothing waiting"}
            </Pill>
          </div>
          <ul className="scroll-thin mt-3 max-h-[520px] space-y-2 overflow-auto">
            {operational.length === 0 && (
              <li className="rounded-[12px] border border-dashed border-[var(--line)] px-3 py-8 text-center text-[12px] text-[var(--ink-muted)]">
                No new card-testing activity yet. Press Play.
              </li>
            )}
            {operational
              .slice()
              .reverse()
              .map((event, index) => {
                const copied = analytics.some(
                  (item) => item.caseId === event.caseId && item.kind === event.kind
                );
                return (
                  <li
                    key={`${event.caseId}-${event.kind}-${index}`}
                    className="flex items-start justify-between gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2"
                  >
                    <div>
                      <p className="text-[12px] font-semibold">
                        <span className="mono text-[var(--ink-muted)]">{event.at}</span> {event.caseId}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-4 text-[var(--ink-soft)]">
                        {event.detail} · {event.deviceId}
                        {event.loss > 0 ? ` · ${usd(event.loss)}` : ""}
                      </p>
                    </div>
                    <Pill tone={copied ? "good" : "warn"}>{copied ? "In analytics" : "Not copied"}</Pill>
                  </li>
                );
              })}
          </ul>
        </div>

        <div className="card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="label">Analytics</p>
              <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.03em]">
                Answer as of {analyticsClock}
              </h2>
            </div>
            <Pill tone={lag > 0 ? "bad" : "good"}>{lag > 0 ? `${lag} min behind` : "Current"}</Pill>
          </div>
          {mode === "current" && step > 0 && step < BATCH_STEP && (
            <Banner tone="warn">
              The operational clock is {operationalClock}. Analytics is still as of 09:00.{" "}
              {waiting} events are waiting for the copy. The overnight batch has not run.
            </Banner>
          )}
          {mode === "current" && step >= BATCH_STEP && (
            <Banner tone="good">
              The batch finished at 09:10 and copied every event at once. Analytics jumps from 09:00 to 09:10.
            </Banner>
          )}
          {mode === "singlestore" && step > 0 && (
            <Banner tone="accent">
              Each commit is queryable at {operationalClock}. There is no copy waiting to catch up.
            </Banner>
          )}
          <p className="mt-3 text-[13px] leading-6">
            {stats.alerts === 0
              ? "No card-testing cluster is visible. The prior answer still stands."
              : stats.loss === 0 && stats.falsePositives === 0
                ? `DEV-0008 shows ${stats.peak} alerts in any 10-minute window. Confirmed loss is still ${usd(0)} because investigator outcomes are not in analytics yet.`
                : `DEV-0008 shows ${stats.peak} alerts in any 10-minute window. Confirmed loss is ${usd(stats.loss)}. False positives: ${stats.falsePositives}.`}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric label="Alerts in view" value={String(stats.alerts)} />
            <Metric label="DEV-0008 peak / 10 min" value={String(stats.peak)} />
            <Metric label="Confirmed loss" value={usd(stats.loss)} />
            <Metric label="False positives" value={String(stats.falsePositives)} />
          </div>
          <p className="mt-4 text-[11px] leading-4 text-[var(--ink-muted)]">
            Confirmed loss and false positives change only when an investigator disposition commits.
            Alert count and the rolling device peak can move as soon as analytics can see the alert.
            The ledger and warehouse stay in both views.
          </p>
        </div>
      </section>
    </div>
  );
}

function ComparisonFact({
  label,
  asOf,
  behind,
  active,
}: {
  label: string;
  asOf: string;
  behind: number;
  active: boolean;
}) {
  return (
    <div
      className="rounded-[14px] border px-4 py-3"
      style={{
        borderColor: active ? "var(--accent)" : "var(--line)",
        background: active ? "var(--accent-soft)" : "var(--surface)",
      }}
    >
      <p className="label">{label}</p>
      <p className="mt-1 text-[13px] font-semibold">
        Analytics as of {asOf}
        {behind > 0 ? ` · ${behind} min behind` : " · current"}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-[var(--surface-sunk)] px-3 py-3">
      <p className="label">{label}</p>
      <p className="mt-1 text-[22px] font-semibold tracking-[-0.04em]">{value}</p>
    </div>
  );
}
