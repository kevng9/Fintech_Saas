"use client";

import Link from "next/link";
import { Pill } from "@/components/ui";
import { count, milliseconds, millisecondsDelta, percent, points } from "@/lib/format";
import type { LanePayload } from "@/lib/apiTypes";

/**
 * Lane detail behind the ranked bars.
 *
 * Each row compares a processor / network / issuer-country lane against its own
 * prior seven-day baseline, and flags a lane whose p95 has crossed its
 * contracted SLA, which is the operational trigger a payments lead acts on.
 */
export function LaneTable({ lanes, anchorId }: { lanes: LanePayload[]; anchorId: string }) {
  if (!lanes.length) {
    return <p className="py-4 text-[12px] text-[var(--ink-muted)]">No lane activity in this window.</p>;
  }

  return (
    <div className="scroll-thin max-h-[420px] overflow-auto">
      <table className="grid">
        <thead>
          <tr>
            <th>Lane</th>
            <th className="num">Attempts</th>
            <th className="num">Approval</th>
            <th className="num">vs baseline</th>
            <th className="num">Timeouts</th>
            <th className="num">p95</th>
            <th className="num">vs baseline</th>
            <th>SLA</th>
          </tr>
        </thead>
        <tbody>
          {lanes.map((lane) => {
            const breached =
              lane.recent_p95_latency_ms !== null &&
              lane.recent_p95_latency_ms > lane.contracted_sla_ms;
            const dropped = (lane.approval_rate_change ?? 0) < -0.005;
            return (
              <tr key={lane.lane_key}>
                <td>
                  <Link
                    href={`/anchors/${anchorId}/segment/${encodeURIComponent(lane.lane_key)}`}
                    className="font-medium text-[var(--accent-dark)] hover:underline"
                  >
                    {lane.processor_name}
                  </Link>
                  <span className="mono ml-1.5 text-[11px] text-[var(--ink-muted)]">
                    {lane.card_network} · {lane.issuer_country} · {lane.rail}
                  </span>
                </td>
                <td className="num mono">{count(lane.recent_attempts)}</td>
                <td className="num mono">{percent(lane.recent_approval_rate)}</td>
                <td
                  className="num mono"
                  style={{ color: dropped ? "var(--danger)" : "var(--ink-soft)" }}
                >
                  {points(lane.approval_rate_change)}
                </td>
                <td className="num mono">{percent(lane.recent_timeout_rate)}</td>
                <td className="num mono">{milliseconds(lane.recent_p95_latency_ms)}</td>
                <td
                  className="num mono"
                  style={{
                    color:
                      (lane.p95_latency_change_ms ?? 0) > 25 ? "var(--danger)" : "var(--ink-soft)",
                  }}
                >
                  {millisecondsDelta(lane.p95_latency_change_ms)}
                </td>
                <td>
                  {breached ? (
                    <Pill tone="bad">over {lane.contracted_sla_ms} ms</Pill>
                  ) : (
                    <span className="mono text-[11px] text-[var(--ink-muted)]">
                      {lane.contracted_sla_ms} ms
                    </span>
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
