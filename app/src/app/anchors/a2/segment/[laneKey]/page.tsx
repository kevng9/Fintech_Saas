"use client";

/**
 * Lane detail: the drill-down target from the overview.
 *
 * The point of this page is to end the "is the aggregate hiding something"
 * question. It shows the lane's own window against its own baseline, its hourly
 * shape, and the individual synthetic authorization attempts that produced the
 * numbers, with scenario-injected rows marked as such.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Sparkline } from "@/components/charts";
import { useDemoState } from "@/components/DemoStateProvider";
import { Banner, Card, Empty, Pill, Skeleton } from "@/components/ui";
import {
  count,
  localAmount,
  logicalTime,
  milliseconds,
  millisecondsDelta,
  percent,
  points,
  usd,
} from "@/lib/format";
import type { SegmentDetailPayload, WindowMetricsPayload } from "@/lib/apiTypes";

const METRIC_ROWS: {
  label: string;
  read: (metrics: WindowMetricsPayload) => number | null;
  format: (value: number | null) => string;
  delta: (value: number | null) => string;
  higherIsBetter: boolean;
}[] = [
  {
    label: "Approval rate",
    read: (m) => m.approval_rate,
    format: percent,
    delta: points,
    higherIsBetter: true,
  },
  {
    label: "Timeout declines",
    read: (m) => m.timeout_decline_rate,
    format: percent,
    delta: points,
    higherIsBetter: false,
  },
  {
    label: "p95 latency",
    read: (m) => m.p95_latency_ms,
    format: milliseconds,
    delta: millisecondsDelta,
    higherIsBetter: false,
  },
  {
    label: "Average latency",
    read: (m) => m.avg_latency_ms,
    format: milliseconds,
    delta: millisecondsDelta,
    higherIsBetter: false,
  },
  {
    label: "Attempts",
    read: (m) => m.attempts,
    format: (value) => count(value),
    delta: (value) => (value === null ? "—" : `${value >= 0 ? "+" : "−"}${count(Math.abs(value))}`),
    higherIsBetter: true,
  },
  {
    label: "Declined value",
    read: (m) => m.declined_amount,
    format: (value) => usd(value),
    delta: (value) => (value === null ? "—" : `${value >= 0 ? "+" : "−"}${usd(Math.abs(value))}`),
    higherIsBetter: false,
  },
];

export default function SegmentDetailPage() {
  const params = useParams<{ laneKey: string }>();
  const laneKey = decodeURIComponent(params.laneKey);
  const { envelope } = useDemoState();
  const [detail, setDetail] = useState<SegmentDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyScenario, setOnlyScenario] = useState(false);

  const stateSignature = envelope
    ? `${envelope.state.run_id}:${envelope.state.logical_time}`
    : "none";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `/api/v1/anchors/a2/entities/segment/${encodeURIComponent(laneKey)}?window=60`,
          { cache: "no-store" }
        );
        if (cancelled) return;
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          setError(body.error?.message ?? `Lane detail unavailable (${response.status}).`);
          return;
        }
        setDetail((await response.json()) as SegmentDetailPayload);
        setError(null);
      } catch {
        if (!cancelled) setError("Cannot reach the demo API.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [laneKey, stateSignature]);

  const segment = detail?.segment;
  const events = useMemo(
    () => (onlyScenario ? (segment?.events ?? []).filter((e) => e.is_scenario_event) : segment?.events ?? []),
    [segment, onlyScenario]
  );
  const scenarioCount = (segment?.events ?? []).filter((event) => event.is_scenario_event).length;

  return (
    <div className="space-y-5">
      <nav className="text-[12px] text-[var(--ink-muted)]">
        <Link href="/anchors/a2" className="hover:underline">
          A2 Payment Pulse
        </Link>
        <span className="mx-1.5">/</span>
        <span className="mono">{laneKey.split("|").join(" · ")}</span>
      </nav>

      {error && <Banner tone="bad">{error}</Banner>}

      {!segment ? (
        <Card title="Lane detail">
          <Skeleton rows={6} />
        </Card>
      ) : (
        <>
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight">
                {segment.processor_name}
              </h1>
              <p className="mt-1 text-[13px] text-[var(--ink-soft)]">
                <span className="mono">{segment.card_network}</span> ·{" "}
                <span className="mono">{segment.rail}</span> · issuer{" "}
                <span className="mono">{segment.issuer_country}</span>
                {segment.issuer_country_name ? ` (${segment.issuer_country_name})` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Pill
                tone={
                  segment.window.p95_latency_ms !== null &&
                  segment.window.p95_latency_ms > segment.contracted_sla_ms
                    ? "bad"
                    : "good"
                }
              >
                contracted SLA {segment.contracted_sla_ms} ms
              </Pill>
              {scenarioCount > 0 && <Pill tone="accent">{scenarioCount} drill events</Pill>}
            </div>
          </header>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card
              className="xl:col-span-2"
              title="This lane against its own baseline"
              subtitle={`Last ${detail.window_minutes} minutes vs the preceding seven days`}
            >
              <table className="grid">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th className="num">Window</th>
                    <th className="num">Baseline</th>
                    <th className="num">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {METRIC_ROWS.map((row) => {
                    const current = row.read(segment.window);
                    const baseline = row.read(segment.baseline);
                    const delta =
                      current !== null && baseline !== null ? current - baseline : null;
                    const bad =
                      delta !== null && (row.higherIsBetter ? delta < 0 : delta > 0);
                    return (
                      <tr key={row.label}>
                        <td>{row.label}</td>
                        <td className="num mono font-semibold">{row.format(current)}</td>
                        <td className="num mono">{row.format(baseline)}</td>
                        <td
                          className="num mono"
                          style={{ color: bad ? "var(--danger)" : "var(--ink-soft)" }}
                        >
                          {row.delta(delta)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>

            <Card title="Hourly shape" subtitle="Last 24 hours for this route">
              {segment.hourly.length ? (
                <div className="space-y-3">
                  <div>
                    <p className="label">Approval rate</p>
                    <Sparkline
                      values={segment.hourly.map((point) => Number(point.approval_rate))}
                      width={260}
                      height={40}
                    />
                  </div>
                  <div>
                    <p className="label">p95 latency</p>
                    <Sparkline
                      values={segment.hourly.map((point) => Number(point.p95_latency_ms))}
                      width={260}
                      height={40}
                      tone="var(--amber)"
                    />
                  </div>
                  <div>
                    <p className="label">Attempts</p>
                    <Sparkline
                      values={segment.hourly.map((point) => Number(point.attempts))}
                      width={260}
                      height={40}
                      tone="var(--ink-muted)"
                    />
                  </div>
                </div>
              ) : (
                <Empty>No hourly history yet for this lane.</Empty>
              )}
            </Card>
          </div>

          <Card
            title="Authorization attempts"
            subtitle="Most recent synthetic events for this lane"
            actions={
              <label className="flex items-center gap-1.5 text-[12px] text-[var(--ink-soft)]">
                <input
                  type="checkbox"
                  checked={onlyScenario}
                  onChange={(event) => setOnlyScenario(event.target.checked)}
                />
                Scenario events only
              </label>
            }
            footnote="Every row is synthetic. Amounts are shown in the issuer currency with the normalised USD value used by the widgets."
          >
            {events.length ? (
              <div className="scroll-thin max-h-[520px] overflow-auto">
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Payment</th>
                      <th>Merchant</th>
                      <th className="num">Amount</th>
                      <th className="num">USD</th>
                      <th>Response</th>
                      <th className="num">Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.payment_id}>
                        <td className="mono">{logicalTime(event.event_time).slice(11)}</td>
                        <td>
                          <Link
                            href={`/anchors/a2/payment/${encodeURIComponent(event.payment_id)}`}
                            className="mono text-[var(--accent-dark)] hover:underline"
                          >
                            {event.payment_id}
                          </Link>
                          {event.is_scenario_event ? (
                            <span className="ml-1.5">
                              <Pill tone="accent">scenario</Pill>
                            </span>
                          ) : null}
                        </td>
                        <td>
                          {event.merchant_name}
                          <span className="ml-1.5 text-[11px] text-[var(--ink-muted)]">
                            {event.merchant_category}
                          </span>
                        </td>
                        <td className="num mono">
                          {localAmount(event.amount, event.currency)}
                        </td>
                        <td className="num mono">{usd(event.amount_usd, true)}</td>
                        <td className="mono">
                          {event.approved ? (
                            <span style={{ color: "var(--good)" }}>APPROVED</span>
                          ) : (
                            <span style={{ color: "var(--danger)" }}>{event.response_code}</span>
                          )}
                        </td>
                        <td className="num mono">{milliseconds(event.latency_ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>
                {onlyScenario
                  ? "No scenario events in this sample. Inject the scenario from the anchor page."
                  : "No events for this lane yet."}
              </Empty>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
