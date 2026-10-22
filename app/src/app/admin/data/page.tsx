"use client";

/**
 * Data inspector.
 *
 * Answers "is the data really there, and is it really moving" without opening a
 * SQL client: live row counts against the counts recorded at seed time, the
 * event watermark, how many rows each scenario contributed, and the newest
 * events.
 */

import { useCallback, useEffect, useState } from "react";
import { Banner, Card, Empty, Pill, Skeleton } from "@/components/ui";
import { count, logicalTime, milliseconds } from "@/lib/format";

interface DataPayload {
  run: {
    run_id: number;
    seed: number | null;
    fixture_version: string | null;
    logical_epoch: string | null;
    baseline_from: string | null;
    baseline_checksum: string | null;
    recorded_row_counts: Record<string, number>;
  };
  clock: {
    logical_time: string;
    stream_status: string;
    speed_multiplier: number;
    minute_cursor: number;
  };
  live_row_counts: Record<string, number>;
  watermark: { last_event_time: string | null; events: number };
  scenario_rows: { scenario_id: string; rows_total: number }[];
  recent_events: {
    sequence_no: number;
    anchor_id: string;
    event_type: string;
    logical_event_time: string;
    source_scenario: string | null;
  }[];
  recent_payments: {
    payment_id: string;
    event_time: string;
    processor_id: string;
    card_network: string;
    issuer_country: string;
    response_code: string;
    approved: number;
    latency_ms: number;
    scenario_id: string | null;
  }[];
}

export default function AdminDataPage() {
  const [data, setData] = useState<DataPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/admin/data", { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setError(body.error?.message ?? `Data unavailable (${response.status}).`);
        setData(null);
        return;
      }
      setData((await response.json()) as DataPayload);
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

  const tables = data
    ? [...new Set([...Object.keys(data.live_row_counts), ...Object.keys(data.run.recorded_row_counts)])]
    : [];

  return (
    <div className="space-y-4">
      {error && <Banner tone="bad">{error}</Banner>}

      <Card
        title="Active run"
        subtitle="Identity and reproducibility of the data on screen"
        actions={
          <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
            {loading ? "Reading…" : "Refresh"}
          </button>
        }
      >
        {data ? (
          <dl className="grid gap-x-8 gap-y-1.5 text-[12px] sm:grid-cols-2">
            {[
              ["Run", String(data.run.run_id)],
              ["Seed", String(data.run.seed ?? "—")],
              ["Fixture version", data.run.fixture_version ?? "—"],
              ["Logical epoch", logicalTime(data.run.logical_epoch)],
              ["Baseline from", logicalTime(data.run.baseline_from)],
              ["Baseline checksum", data.run.baseline_checksum ?? "—"],
              ["Logical time", logicalTime(data.clock.logical_time)],
              ["Stream", `${data.clock.stream_status} at ${data.clock.speed_multiplier}x`],
              ["Minute cursor", count(data.clock.minute_cursor)],
              ["Last event", logicalTime(data.watermark.last_event_time)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b border-[var(--line)] pb-1">
                <dt className="text-[var(--ink-muted)]">{label}</dt>
                <dd className="mono break-all text-right">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <Skeleton rows={5} />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Row counts"
          subtitle="Live count against the count recorded when the baseline was verified"
          footnote="payment_event grows as the simulator runs, so a higher live count is expected. Dimension tables must match exactly."
        >
          {data ? (
            <table className="grid">
              <thead>
                <tr>
                  <th>Table</th>
                  <th className="num">Live</th>
                  <th className="num">Recorded</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {tables.map((table) => {
                  const live = data.live_row_counts[table] ?? 0;
                  const recorded = data.run.recorded_row_counts[table] ?? 0;
                  const grows = table === "payment_event";
                  const consistent = grows ? live >= recorded : live === recorded;
                  return (
                    <tr key={table}>
                      <td className="mono">{table}</td>
                      <td className="num mono">{count(live)}</td>
                      <td className="num mono">{count(recorded)}</td>
                      <td>
                        {consistent ? (
                          <Pill tone="good">{grows ? `+${count(live - recorded)}` : "match"}</Pill>
                        ) : (
                          <Pill tone="bad">unexpected</Pill>
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

        <Card
          title="Scenario contribution"
          subtitle="Rows tagged with the scenario that produced them"
          footnote="Scenario rows are tagged, so every injected event can be separated from the baseline stream."
        >
          {data ? (
            data.scenario_rows.length ? (
              <table className="grid">
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th className="num">Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {data.scenario_rows.map((row) => (
                    <tr key={row.scenario_id}>
                      <td className="mono">{row.scenario_id}</td>
                      <td className="num mono">{count(row.rows_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>No scenario has been injected on this run.</Empty>
            )
          ) : (
            <Skeleton rows={3} />
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Newest authorization attempts" subtitle="From the curated Domain view">
          {data ? (
            data.recent_payments.length ? (
              <div className="scroll-thin max-h-[380px] overflow-auto">
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Payment</th>
                      <th>Lane</th>
                      <th>Response</th>
                      <th className="num">Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_payments.map((payment) => (
                      <tr key={payment.payment_id}>
                        <td className="mono">{logicalTime(payment.event_time).slice(11)}</td>
                        <td className="mono">
                          {payment.payment_id}
                          {payment.scenario_id && (
                            <span className="ml-1.5">
                              <Pill tone="accent">scenario</Pill>
                            </span>
                          )}
                        </td>
                        <td className="mono text-[11px]">
                          {payment.processor_id} · {payment.card_network} · {payment.issuer_country}
                        </td>
                        <td className="mono">
                          <span
                            style={{
                              color: payment.approved ? "var(--good)" : "var(--danger)",
                            }}
                          >
                            {payment.approved ? "APPROVED" : payment.response_code}
                          </span>
                        </td>
                        <td className="num mono">{milliseconds(payment.latency_ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>No events yet.</Empty>
            )
          ) : (
            <Skeleton rows={5} />
          )}
        </Card>

        <Card title="Event log" subtitle="Simulator activity, newest first">
          {data ? (
            data.recent_events.length ? (
              <div className="scroll-thin max-h-[380px] overflow-auto">
                <table className="grid">
                  <thead>
                    <tr>
                      <th className="num">Sequence</th>
                      <th>Anchor</th>
                      <th>Type</th>
                      <th>Logical time</th>
                      <th>Scenario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_events.map((event) => (
                      <tr key={event.sequence_no}>
                        <td className="num mono">{count(event.sequence_no)}</td>
                        <td className="mono uppercase">{event.anchor_id}</td>
                        <td className="mono">{event.event_type}</td>
                        <td className="mono">{logicalTime(event.logical_event_time)}</td>
                        <td className="mono text-[11px]">{event.source_scenario ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>No simulator events logged yet.</Empty>
            )
          ) : (
            <Skeleton rows={5} />
          )}
        </Card>
      </div>
    </div>
  );
}
