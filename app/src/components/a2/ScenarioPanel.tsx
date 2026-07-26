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
      title="Create the visible story"
      subtitle="Choose a controlled event, say what the audience will see, then run it"
      footnote="Every event is deterministic and isolated to synthetic data. Restore clean demo returns to normal operations."
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
            <div
              key={scenario.scenario_id}
              className="rounded-[16px] border border-[var(--line-strong)] bg-[var(--surface-raised)] p-4 sm:p-5"
            >
              <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[16px] font-semibold tracking-[-0.02em]">
                      {scenario.name}
                    </h3>
                    {history.length > 0 && <Pill tone="warn">already shown</Pill>}
                  </div>
                  <p className="mt-2 text-[10px] font-bold tracking-[0.09em] text-[var(--accent-dark)] uppercase">
                    What the audience will see
                  </p>
                  <p className="mt-1 max-w-[78ch] text-[13px] leading-6 text-[var(--ink-soft)]">
                    {scenario.expected_deltas?.narrative ?? scenario.description}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Pill tone="neutral">{scenario.metric_window}</Pill>
                    {scenario.expected_deltas?.segment && (
                      <Pill tone="accent">
                        {Object.values(scenario.expected_deltas.segment).join(" / ")}
                      </Pill>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary min-h-12 w-full justify-center px-6 text-[14px] lg:w-auto"
                  disabled={!isAdmin || busyAction !== null || !scenario.enabled}
                  onClick={() => void fire(scenario.scenario_id)}
                >
                  {busy ? "Starting story…" : history.length ? "Story already shown" : "Run this story"}
                </button>
              </div>

              <div className="mt-3">
                <ExpectedTable scenario={scenario} />
              </div>

              {last && (
                <p className="mt-2 text-[11px] text-[var(--ink-muted)]">
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
