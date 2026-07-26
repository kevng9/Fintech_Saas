"use client";

/**
 * Scenario injection for the current anchor.
 *
 * The published expected deltas are shown before injection so the room knows
 * what to look for, and the same numbers can be checked against the widgets
 * afterwards. Injection is idempotent per run and scenario, so a double click
 * cannot produce two bursts.
 */

import { useState } from "react";
import { useDemoState } from "@/components/DemoStateProvider";
import { Banner, Card, Empty, Pill } from "@/components/ui";
import { logicalTime, milliseconds, percent } from "@/lib/format";
import type { ExecutionPayload, ScenarioPayload } from "@/lib/apiTypes";

function ExpectedTable({ scenario }: { scenario: ScenarioPayload }) {
  const expected = scenario.expected_deltas ?? {};
  const before = expected.baseline ?? {};
  const after = expected.after ?? {};
  const rows: { label: string; key: string; render: (value: unknown) => string }[] = [
    { label: "Approval rate", key: "approval_rate", render: (v) => percent(Number(v)) },
    {
      label: "Timeout declines",
      key: "timeout_decline_rate",
      render: (v) => percent(Number(v)),
    },
    { label: "p95 latency", key: "p95_latency_ms", render: (v) => milliseconds(Number(v)) },
    { label: "Attempts", key: "attempts", render: (v) => String(v) },
  ];

  const present = rows.filter((row) => row.key in before || row.key in after);
  if (!present.length) return null;

  return (
    <table className="grid mt-2">
      <thead>
        <tr>
          <th>Affected lane</th>
          <th className="num">Baseline</th>
          <th className="num">During burst</th>
        </tr>
      </thead>
      <tbody>
        {present.map((row) => (
          <tr key={row.key}>
            <td>{row.label}</td>
            <td className="num mono">
              {row.key in before ? row.render(before[row.key]) : "—"}
            </td>
            <td className="num mono">{row.key in after ? row.render(after[row.key]) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ScenarioPanel({ anchorId }: { anchorId: string }) {
  const { envelope, config, busyAction, inject } = useDemoState();
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const isAdmin = (envelope?.role ?? config?.role) === "demo_administrator";
  const scenarios = (envelope?.scenarios ?? []).filter(
    (scenario) => scenario.anchor_id === anchorId
  );
  const executions = envelope?.executions ?? [];

  async function fire(scenarioId: string) {
    const result = await inject(scenarioId);
    if (result.ok) {
      const replayed = (result.body as { replayed?: boolean } | undefined)?.replayed;
      setMessage({
        tone: "good",
        text: replayed
          ? "This drill already ran in the current environment. The earlier impact is unchanged."
          : "Drill started. The affected payment window is now visible in the operating metrics.",
      });
      return;
    }
    setMessage({
      tone: "bad",
      text:
        result.status === 409
          ? "The environment moved on, or this drill already ran. Refresh and try again."
          : result.message ?? "Could not start the drill.",
    });
  }

  if (!scenarios.length) {
    return (
      <Card title="Operational drill" subtitle="Test the response to a controlled payment event">
        <Empty>No operational drill is available for this environment.</Empty>
      </Card>
    );
  }

  return (
    <Card
      title="Run an operational drill"
      subtitle="Introduce a controlled processor disruption and watch the impact propagate"
      footnote="The event is deterministic and isolated to this synthetic environment. Reset restores normal operations."
    >
      <div className="space-y-4">
        {message && <Banner tone={message.tone}>{message.text}</Banner>}

        {scenarios.map((scenario) => {
          const history: ExecutionPayload[] = executions.filter(
            (execution) => execution.scenario_id === scenario.scenario_id
          );
          const last = history[0];
          const busy = busyAction === `inject:${scenario.scenario_id}`;
          return (
            <div key={scenario.scenario_id} className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-[13px] font-semibold">{scenario.name}</h3>
                  <p className="mt-0.5 max-w-[70ch] text-[12px] leading-5 text-[var(--ink-soft)]">
                    {scenario.description}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Pill tone="neutral">{scenario.metric_window}</Pill>
                    {scenario.expected_deltas?.segment && (
                      <Pill tone="accent">
                        {Object.values(scenario.expected_deltas.segment).join(" / ")}
                      </Pill>
                    )}
                    {history.length > 0 && <Pill tone="warn">active in this environment</Pill>}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary shrink-0"
                  disabled={!isAdmin || busyAction !== null || !scenario.enabled}
                  onClick={() => void fire(scenario.scenario_id)}
                >
                  {busy ? "Starting drill…" : history.length ? "Drill complete" : "Start drill"}
                </button>
              </div>

              {scenario.expected_deltas?.narrative && (
                <p className="text-[12px] leading-5 text-[var(--ink-soft)]">
                  {scenario.expected_deltas.narrative}
                </p>
              )}

              <ExpectedTable scenario={scenario} />

              {last && (
                <p className="text-[11px] text-[var(--ink-muted)]">
                  Impact window{" "}
                  <span className="mono">
                    {logicalTime(last.window_start)} → {logicalTime(last.window_end)}
                  </span>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
