"use client";

/**
 * Generic "what changed" callout for A1 and A3-A8, mirroring
 * `components/a2/WhatChanged.tsx`'s determinism proof but reading the
 * self-describing `SharedChangePayload` row list instead of a fixed metric
 * set, so it renders whatever rows a given anchor's scenario publishes.
 */

import { Empty, Pill } from "@/components/ui";
import { formatMetric, logicalTime } from "@/lib/format";
import type { SharedChangePayload } from "@/lib/apiTypes";

export function SharedWhatChanged({ comparison }: { comparison: SharedChangePayload | null }) {
  if (!comparison) {
    return (
      <Empty>
        No operational event is active yet. Run the scenario injection to compare this anchor before
        and during the event.
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-5 text-[var(--ink-soft)]">
        {comparison.segmentLabel} from <span className="mono">{logicalTime(comparison.windowStart)}</span>{" "}
        to <span className="mono">{logicalTime(comparison.windowEnd)}</span>.
        {comparison.narrative ? ` ${comparison.narrative}` : ""}
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
          {comparison.rows.map((row) => {
            const hasExpectation = row.expected !== null;
            const allowed = row.tolerance ?? (hasExpectation ? Math.abs(row.expected!) * 0.0001 : 0);
            const matches =
              hasExpectation && row.after !== null ? Math.abs(row.after - row.expected!) <= allowed : null;
            return (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td className="num mono">{formatMetric(row.before, row.format)}</td>
                <td className="num mono font-semibold">{formatMetric(row.after, row.format)}</td>
                <td className="num mono">{hasExpectation ? formatMetric(row.expected, row.format) : "—"}</td>
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
