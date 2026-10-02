"use client";

/**
 * Scenario catalog and history.
 *
 * The full published contract for each scenario is shown here rather than
 * summarized, because these are the numbers a technical viewer will check
 * against the widgets after an injection.
 */

import { useCallback, useEffect, useState } from "react";
import { useDemoState } from "@/components/DemoStateProvider";
import { Banner, Card, Empty, Pill, Skeleton } from "@/components/ui";
import { count, logicalTime } from "@/lib/format";
import type { ExecutionPayload, ScenarioPayload } from "@/lib/apiTypes";

interface ScenarioWithHistory extends ScenarioPayload {
  executions: ExecutionPayload[];
}

function ValueGrid({ values }: { values: Record<string, unknown> }) {
  const entries = Object.entries(values);
  if (!entries.length) return <Empty>Not published.</Empty>;
  return (
    <dl className="space-y-1 text-[12px]">
      {entries.map(([key, value]) => (
        <div key={key} className="flex justify-between gap-3">
          <dt className="mono text-[var(--ink-muted)]">{key}</dt>
          <dd className="mono">{typeof value === "number" ? value : String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function AdminScenariosPage() {
  const { busyAction, inject, envelope, config } = useDemoState();
  const [scenarios, setScenarios] = useState<ScenarioWithHistory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isAdmin = (envelope?.role ?? config?.role) === "demo_administrator";

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/scenarios", { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setError(body.error?.message ?? `Scenarios unavailable (${response.status}).`);
        return;
      }
      const body = (await response.json()) as { scenarios: ScenarioWithHistory[] };
      setScenarios(body.scenarios);
      setError(null);
    } catch {
      setError("Cannot reach the demo API.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function fire(scenarioId: string) {
    const result = await inject(scenarioId);
    setNotice(
      result.ok
        ? "Injection accepted. Reload to see the recorded execution."
        : result.message ?? "Injection failed."
    );
    await load();
  }

  return (
    <div className="space-y-4">
      {error && <Banner tone="bad">{error}</Banner>}
      {notice && <Banner tone="accent">{notice}</Banner>}

      {scenarios === null ? (
        <Card title="Scenarios">
          <Skeleton rows={5} />
        </Card>
      ) : scenarios.length === 0 ? (
        <Card title="Scenarios">
          <Empty>
            No scenarios are registered. They are written to the database by{" "}
            <span className="mono">python -m fintech_demo bootstrap</span>.
          </Empty>
        </Card>
      ) : (
        scenarios.map((scenario) => (
          <Card
            key={scenario.scenario_id}
            title={
              <span className="flex items-center gap-2">
                <span className="mono uppercase text-[var(--ink-muted)]">{scenario.anchor_id}</span>
                {scenario.name}
              </span>
            }
            subtitle={scenario.description}
            actions={
              <>
                <Pill tone={scenario.enabled ? "good" : "neutral"}>
                  {scenario.enabled ? "enabled" : "disabled"}
                </Pill>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!isAdmin || !scenario.enabled || busyAction !== null}
                  onClick={() => void fire(scenario.scenario_id)}
                >
                  {busyAction === `inject:${scenario.scenario_id}` ? "Injecting…" : "Inject"}
                </button>
              </>
            }
            footnote={
              <span>
                <span className="mono">{scenario.scenario_id}</span> · window{" "}
                {scenario.metric_window}
              </span>
            }
          >
            <div className="space-y-3">
              {scenario.expected_deltas?.narrative && (
                <p className="text-[12px] leading-5 text-[var(--ink-soft)]">
                  {scenario.expected_deltas.narrative}
                </p>
              )}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="label">Affected segment</p>
                  <ValueGrid values={scenario.expected_deltas?.segment ?? {}} />
                </div>
                <div>
                  <p className="label">Published baseline</p>
                  <ValueGrid values={scenario.expected_deltas?.baseline ?? {}} />
                </div>
                <div>
                  <p className="label">Published after</p>
                  <ValueGrid values={scenario.expected_deltas?.after ?? {}} />
                </div>
                <div>
                  <p className="label">Tolerance</p>
                  <ValueGrid values={scenario.expected_deltas?.tolerance ?? {}} />
                </div>
              </div>

              <div>
                <p className="label mb-1">Execution history on this run</p>
                {scenario.executions.length ? (
                  <table className="grid">
                    <thead>
                      <tr>
                        <th>Requested</th>
                        <th>Status</th>
                        <th>Window</th>
                        <th>Rows inserted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scenario.executions.map((execution) => (
                        <tr key={execution.execution_id}>
                          <td className="mono">{logicalTime(execution.requested_at)}</td>
                          <td>
                            {execution.status === "complete" ? (
                              <Pill tone="good">{execution.status}</Pill>
                            ) : (
                              <Pill tone="warn">{execution.status}</Pill>
                            )}
                          </td>
                          <td className="mono text-[11px]">
                            {logicalTime(execution.window_start)} →{" "}
                            {logicalTime(execution.window_end)}
                          </td>
                          <td className="mono text-[11px]">
                            {Object.entries(execution.rows_inserted ?? {})
                              .map(([table, rows]) => `${table} ${count(rows)}`)
                              .join(" · ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <Empty>Not injected on this run.</Empty>
                )}
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
