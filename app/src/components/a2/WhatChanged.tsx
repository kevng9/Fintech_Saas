"use client";

/**
 * The "what changed" callout.
 *
 * This is the demo's proof of determinism: the measured before/after for the
 * affected lane is shown next to the values the scenario published in advance,
 * and each row is marked as matching or not. If a row does not match, the demo
 * says so on screen rather than glossing over it.
 */

import { Empty, Pill } from "@/components/ui";
import { logicalTime, milliseconds, percent, usd } from "@/lib/format";
import type { WhatChangedPayload, WindowMetricsPayload } from "@/lib/apiTypes";

type Extractor = (metrics: WindowMetricsPayload) => number | null;

interface Row {
  label: string;
  read: Extractor;
  expectedKey: string;
  toleranceKey: string;
  format: (value: number | null) => string;
}

const ROWS: Row[] = [
  {
    label: "Approval rate",
    read: (metrics) => metrics.approval_rate,
    expectedKey: "approval_rate",
    toleranceKey: "approval_rate",
    format: (value) => percent(value),
  },
  {
    label: "Timeout declines",
    read: (metrics) => metrics.timeout_decline_rate,
    expectedKey: "timeout_decline_rate",
    toleranceKey: "timeout_decline_rate",
    format: (value) => percent(value),
  },
  {
    label: "p95 latency",
    read: (metrics) => metrics.p95_latency_ms,
    expectedKey: "p95_latency_ms",
    toleranceKey: "p95_latency_ms",
    format: (value) => milliseconds(value),
  },
  {
    label: "Attempts",
    read: (metrics) => metrics.attempts,
    expectedKey: "attempts",
    toleranceKey: "attempts",
    format: (value) => (value === null ? "—" : value.toLocaleString()),
  },
  {
    label: "Declined value",
    read: (metrics) => metrics.declined_amount,
    expectedKey: "__none__",
    toleranceKey: "__none__",
    format: (value) => usd(value),
  },
];

export function WhatChanged({ comparison }: { comparison: WhatChangedPayload | null }) {
  if (!comparison) {
    return (
      <Empty>
        No operational event is active yet. Start the processor timeout drill to compare a payment
        route before and during the disruption.
      </Empty>
    );
  }

  const expectedAfter = (comparison.expected?.after ?? {}) as Record<string, number>;
  const tolerance = (comparison.expected?.tolerance ?? {}) as Record<string, number>;

  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-5 text-[var(--ink-soft)]">
        Route <span className="mono font-medium">{comparison.lane}</span> from{" "}
        <span className="mono">{logicalTime(comparison.windowStart)}</span> to{" "}
        <span className="mono">{logicalTime(comparison.windowEnd)}</span>, compared with the same
        route&apos;s recent baseline.
      </p>

      <table className="grid">
        <thead>
          <tr>
            <th>Metric</th>
            <th className="num">Before</th>
            <th className="num">During</th>
            <th className="num">Expected</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const measured = row.read(comparison.after);
            const expected = expectedAfter[row.expectedKey];
            const hasExpectation = typeof expected === "number";
            const allowed = tolerance[row.toleranceKey] ?? 0;
            const matches =
              hasExpectation && measured !== null
                ? Math.abs(measured - expected) <= (allowed || Math.abs(expected) * 0.0001)
                : null;
            return (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td className="num mono">{row.format(row.read(comparison.baseline))}</td>
                <td className="num mono font-semibold">{row.format(measured)}</td>
                <td className="num mono">{hasExpectation ? row.format(expected) : "—"}</td>
                <td>
                  {matches === null ? (
                    <span className="text-[11px] text-[var(--ink-muted)]">observed only</span>
                  ) : matches ? (
                    <Pill tone="good">confirmed</Pill>
                  ) : (
                    <Pill tone="bad">outside plan</Pill>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
