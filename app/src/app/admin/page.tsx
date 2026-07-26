"use client";

/**
 * Pre-flight health.
 *
 * The list is deliberately blunt: a check either passes or it names the command
 * that fixes it, so a presenter five minutes from a session knows exactly what
 * to do.
 */

import { useCallback, useEffect, useState } from "react";
import { Banner, Card, Empty, Pill, Skeleton } from "@/components/ui";
import { count, logicalTime } from "@/lib/format";
import type { HealthPayload } from "@/lib/apiTypes";

const REMEDY: Record<string, string> = {
  database:
    "Check DEMO_DB_HOST, DEMO_DB_USER and DEMO_DB_PASSWORD in app/.env.local, and that the workspace is resumed.",
  active_run: "Run: python -m fintech_demo bootstrap",
  simulator_leader: "Run: python -m fintech_demo run",
  baseline_checksum_recorded: "Run: python -m fintech_demo seed --update-baseline",
  analyst_configured_for_available_anchors:
    "Publish each Aura Domain, create a Domain-scoped key, and set ANALYST_A{N}_API_KEY in app/.env.local (or present with ANALYST_MODE=fixture / auto fixture fallback).",
  all_live_domains:
    "Publish each Aura Domain, create a Domain-scoped key, and set ANALYST_A1_API_KEY … ANALYST_A8_API_KEY in app/.env.local. Fixture/auto presentation does not require this.",
  fixtures_present_for_available_anchors:
    "Add reviewed responses under fixtures/analyst/<anchor>/ so auto and fixture modes have answers.",
};

interface AuditEntry {
  occurred_at: string;
  actor_id: string;
  actor_role: string;
  action: string;
  run_id: number | null;
  state_version: number | null;
  outcome: string;
  detail: string | null;
}

export default function AdminHealthPage() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [healthResponse, auditResponse] = await Promise.all([
        fetch("/api/health/demo", { cache: "no-store" }),
        fetch("/api/v1/admin/audit", { cache: "no-store" }),
      ]);
      // A 503 still carries the full check list; that is the interesting case.
      setHealth((await healthResponse.json()) as HealthPayload);
      if (auditResponse.ok) {
        const body = (await auditResponse.json()) as { entries: AuditEntry[] };
        setAudit(body.entries);
      } else {
        setAudit([]);
      }
      setError(null);
    } catch {
      setError("Cannot reach the demo API.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const liveMode = health?.analyst?.mode === "live";
  const blockingFails = (health?.checks ?? []).filter(
    (check) => !check.ok && (check.id !== "all_live_domains" || liveMode)
  );
  const liveDomainsIncomplete = (health?.checks ?? []).some(
    (check) => check.id === "all_live_domains" && !check.ok
  );

  return (
    <div className="space-y-4">
      {error && <Banner tone="bad">{error}</Banner>}

      {health && (
        <Banner tone={blockingFails.length ? "bad" : "good"}>
          {blockingFails.length
            ? `${blockingFails.length} of ${health.checks.length} checks need attention before presenting.`
            : liveDomainsIncomplete
              ? "Demo can present with reviewed fixtures. Live Domains are not all published and keyed yet."
              : "All checks pass. The demo is ready to present."}
        </Banner>
      )}

      <Card
        title="Pre-flight checks"
        subtitle={health ? `Checked ${health.checked_at}` : "Loading"}
        actions={
          <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
            {loading ? "Checking…" : "Re-check"}
          </button>
        }
      >
        {health ? (
          <table className="grid">
            <thead>
              <tr>
                <th>Check</th>
                <th>Detail</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {health.checks.map((check) => {
                const informational =
                  check.id === "all_live_domains" && !check.ok && !liveMode;
                return (
                  <tr key={check.id}>
                    <td className="mono">{check.id}</td>
                    <td className="text-[var(--ink-soft)]">
                      {check.detail}
                      {!check.ok && REMEDY[check.id] && (
                        <div
                          className={`mt-0.5 text-[11px] ${
                            informational ? "text-[var(--amber)]" : "text-[var(--danger)]"
                          }`}
                        >
                          {REMEDY[check.id]}
                        </div>
                      )}
                    </td>
                    <td>
                      {check.ok ? (
                        <Pill tone="good">pass</Pill>
                      ) : informational ? (
                        <Pill tone="warn">fixture ok</Pill>
                      ) : (
                        <Pill tone="bad">fail</Pill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <Skeleton rows={5} />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Stream" subtitle="Current logical position">
          {health?.state ? (
            <dl className="space-y-1.5 text-[12px]">
              {[
                ["Run", String(health.state.run_id)],
                ["Logical time", logicalTime(String(health.state.logical_time))],
                ["Status", String(health.state.stream_status)],
                ["Speed", `${health.state.speed_multiplier}x`],
                ["State version", String(health.state.state_version)],
                ["Last event", logicalTime(health.data?.last_event_time ?? null)],
                ["Events", count(health.data?.events ?? 0)],
                ["Scenario runs", count(health.scenario_executions)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-[var(--ink-muted)]">{label}</dt>
                  <dd className="mono">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <Empty>No active run.</Empty>
          )}
        </Card>

        <Card title="Anchors" subtitle="Build status and Analyst readiness">
          {health ? (
            <table className="grid">
              <thead>
                <tr>
                  <th>Anchor</th>
                  <th>Status</th>
                  <th className="num">Fixtures</th>
                  <th>Key</th>
                </tr>
              </thead>
              <tbody>
                {health.anchors.map((anchor) => (
                  <tr key={anchor.anchor_id}>
                    <td className="mono uppercase">{anchor.anchor_id}</td>
                    <td>
                      {anchor.status === "available" ? (
                        <Pill tone="good">ready</Pill>
                      ) : (
                        <span className="text-[11px] text-[var(--ink-muted)]">planned</span>
                      )}
                    </td>
                    <td className="num mono">{anchor.fixture_count}</td>
                    <td>
                      {anchor.status !== "available" ? (
                        <span className="text-[11px] text-[var(--ink-muted)]">—</span>
                      ) : anchor.analyst_configured ? (
                        <Pill tone="good">set</Pill>
                      ) : (
                        <Pill tone="warn">missing</Pill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Skeleton rows={5} />
          )}
        </Card>

        <Card title="Analyst" subtitle="Proxy configuration">
          {health ? (
            <dl className="space-y-1.5 text-[12px]">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--ink-muted)]">Configured mode</dt>
                <dd className="mono">{health.analyst.mode}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--ink-muted)]">Sessions in memory</dt>
                <dd className="mono">{health.analyst.sessions_in_memory}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--ink-muted)]">Seed</dt>
                <dd className="mono">{health.fixture.seed}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--ink-muted)]">Epoch</dt>
                <dd className="mono">{health.fixture.epoch}</dd>
              </div>
            </dl>
          ) : (
            <Skeleton rows={4} />
          )}
        </Card>
      </div>

      <Card title="Audit trail" subtitle="Recent control actions, newest first">
        {audit === null ? (
          <Skeleton rows={4} />
        ) : audit.length ? (
          <div className="scroll-thin max-h-[360px] overflow-auto">
            <table className="grid">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th className="num">Run</th>
                  <th className="num">Version</th>
                  <th>Outcome</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((entry, index) => (
                  <tr key={`${entry.occurred_at}-${index}`}>
                    <td className="mono">{logicalTime(entry.occurred_at)}</td>
                    <td>
                      <span className="mono">{entry.actor_id}</span>
                      <span className="ml-1.5 text-[11px] text-[var(--ink-muted)]">
                        {entry.actor_role}
                      </span>
                    </td>
                    <td className="mono">{entry.action}</td>
                    <td className="num mono">{entry.run_id ?? "—"}</td>
                    <td className="num mono">{entry.state_version ?? "—"}</td>
                    <td>
                      {entry.outcome === "success" ? (
                        <Pill tone="good">{entry.outcome}</Pill>
                      ) : (
                        <Pill tone="bad">{entry.outcome}</Pill>
                      )}
                    </td>
                    <td className="text-[11px] text-[var(--ink-muted)]">{entry.detail ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No control actions recorded on this run yet.</Empty>
        )}
      </Card>
    </div>
  );
}
