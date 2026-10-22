"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Banner, Card, Skeleton } from "@/components/ui";
import { SQL_JOBS } from "@/lib/analyst/sqlProof";
import { formatMetric } from "@/lib/format";
import type { OneQueryResult, QueryJob } from "@/lib/metrics/a3OneQuery";

const TYPICAL_STACK: { system: string; holds: string; job: QueryJob }[] = [
  { system: "Case database", holds: "Cases, dispositions, investigator notes", job: "relational" },
  { system: "Document store", holds: "Alert payloads and reason codes as JSON", job: "document" },
  { system: "Vector database", holds: "Note embeddings for similar-case search", job: "vector" },
  { system: "Time-series database", holds: "Peak alerts in any rolling 10-minute interval", job: "timeseries" },
  { system: "Data warehouse", holds: "Loss and false-positive reporting, loaded overnight", job: "analytics" },
  { system: "ETL and streaming jobs", holds: "Copies data between the systems above", job: "live" },
];

function FlowArrow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
      <span className="h-px flex-1 bg-[var(--line-strong)]" aria-hidden />
      <span>{label}</span>
      <span className="h-px flex-1 bg-[var(--line-strong)]" aria-hidden />
    </div>
  );
}

function SystemBox({ title, detail, color }: { title: string; detail: string; color: string }) {
  return (
    <div
      className="rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      <p className="text-[12px] font-semibold leading-4" style={{ color }}>
        {title}
      </p>
      <p className="mt-0.5 text-[11px] leading-4 text-[var(--ink-soft)]">{detail}</p>
    </div>
  );
}

const ADDED_LAYER: Record<QueryJob, string> = {
  vector: "Compare stored note vectors for this decision",
  document: "Read JSON reason codes for this decision",
  timeseries: "Read the rolling 10-minute peak for this decision",
  relational: "Join cases, merchants, and devices for this decision",
  analytics: "Total loss and false positives for this decision",
  live: "Use the current logical time for this decision",
};

/** Before: a copy path. After: SingleStore added beside the systems that stay. */
function StackDiagram() {
  const sources = TYPICAL_STACK.slice(0, 4);
  const warehouse = TYPICAL_STACK[4];
  const movement = TYPICAL_STACK[5];

  return (
    <figure className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr]">
      <figcaption className="sr-only">
        Before, a fraud question crosses a case database, a document store, a vector database, a
        time-series database, ETL jobs, and a warehouse loaded overnight. After, those systems stay,
        and SingleStore is added so this decision can read current data without waiting for the copy.
      </figcaption>

      <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-sunk)] p-4">
        <p className="label">Before</p>
        <p className="mt-1 text-[13px] font-semibold leading-5">Six systems, then a copy</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {sources.map((item) => (
            <SystemBox
              key={item.system}
              title={item.system}
              detail={item.holds}
              color={SQL_JOBS[item.job].color}
            />
          ))}
        </div>
        <FlowArrow label="Copy" />
        <SystemBox title={movement.system} detail={movement.holds} color={SQL_JOBS[movement.job].color} />
        <FlowArrow label="Load overnight" />
        <SystemBox
          title={warehouse.system}
          detail={warehouse.holds}
          color={SQL_JOBS[warehouse.job].color}
        />
        <p className="mt-3 text-[11px] leading-4 text-[var(--ink-muted)]">
          The investigator asks each system, or waits for the warehouse copy.
        </p>
      </div>

      <div className="flex items-center justify-center lg:flex-col" aria-hidden>
        <span className="rounded-full border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
          Same question
        </span>
      </div>

      <div className="rounded-[14px] border border-[var(--accent)] bg-[var(--accent-soft)] p-4">
        <p className="label">After</p>
        <p className="mt-1 text-[13px] font-semibold leading-5">SingleStore added beside them</p>
        <div className="mt-3 rounded-[12px] border border-[var(--accent)] bg-[var(--surface)] p-3">
          <p className="text-[12px] font-semibold text-[var(--accent-dark)]">SingleStore</p>
          <p className="mt-0.5 text-[11px] leading-4 text-[var(--ink-soft)]">
            For the decision that cannot wait for a copy.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(Object.keys(SQL_JOBS) as QueryJob[]).map((job) => (
              <SystemBox
                key={job}
                title={SQL_JOBS[job].label}
                detail={ADDED_LAYER[job]}
                color={SQL_JOBS[job].color}
              />
            ))}
          </div>
        </div>
        <FlowArrow label="One SQL query" />
        <div className="rounded-[10px] border border-[var(--accent)] bg-[var(--surface)] px-3 py-2">
          <p className="text-[12px] font-semibold leading-4 text-[var(--accent-dark)]">
            The other systems stay
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-[var(--ink-soft)]">
            The ledger, case system, and warehouse remain. A report that can wait a day can stay on the warehouse.
          </p>
        </div>
      </div>
    </figure>
  );
}

/** One live SQL statement, with each part labeled by the job a separate system would usually do. */
export function OneQueryPanel({ refreshKey }: { refreshKey: string }) {
  const [result, setResult] = useState<OneQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [running, setRunning] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async (reveal: boolean) => {
    const id = ++requestId.current;
    if (reveal) setRunning(true);
    const search = selected ? `?case=${encodeURIComponent(selected)}` : "";
    try {
      const response = await fetch(`/api/v1/anchors/a3/one-query${search}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as OneQueryResult & {
        error?: { message?: string };
      };
      if (id !== requestId.current) return;
      if (!response.ok) {
        setError(body.error?.message ?? `Query unavailable (${response.status}).`);
        return;
      }
      setResult(body);
      setError(null);
      if (reveal) setRevealed(true);
    } catch {
      if (id !== requestId.current) return;
      setError("Cannot reach the demo API.");
    } finally {
      if (reveal && id === requestId.current) setRunning(false);
    }
  }, [selected]);

  useEffect(() => {
    setRevealed(false);
  }, [selected]);

  useEffect(() => {
    if (revealed || running) return;
    void load(false);
  }, [load, refreshKey, revealed, running]);

  const first = result?.matches[0];

  return (
    <Card
      title="Add a layer for the decision that cannot wait"
      subtitle="The ledger, case system, and warehouse stay. SingleStore answers this question on current data."
      footnote="Investigator notes were embedded when the cases were loaded. This query compares those stored vectors with DOT_PRODUCT. It does not create them. The 10-minute figure is the exact peak in any rolling interval through the logical clock, from aa_fraud_device_velocity, not a fixed clock bucket. Only observed behavior is embedded, never the case outcome."
    >
      {result && (
        <label className="mb-4 flex flex-wrap items-center gap-2 text-[11px] text-[var(--ink-muted)]">
          Find cases like
          <select
            className="max-w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 py-1 text-[11px] text-[var(--ink)]"
            value={result.reference_case}
            onChange={(event) => setSelected(event.target.value)}
          >
            {result.candidates.map((option) => (
              <option key={option.case_id} value={option.case_id}>
                {option.case_id} · {option.fraud_type} ·{" "}
                {option.human_disposition === "open"
                  ? "open"
                  : formatMetric(option.confirmed_loss_usd, "currency")}
              </option>
            ))}
          </select>
        </label>
      )}
      <StackDiagram />
      {error && (
        <div className="mt-5">
          <Banner tone="bad">{error}</Banner>
        </div>
      )}
      {!result && !error && (
        <div className="mt-5">
          <Skeleton rows={6} />
        </div>
      )}
      {result && (
        <div className="mt-5 space-y-5">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="label">The query</p>
              <button
                type="button"
                className="btn btn-primary min-h-11 px-4"
                disabled={running || !result}
                onClick={() => void load(true)}
              >
                {running ? "Running…" : "Run query"}
              </button>
            </div>
            <pre className="scroll-thin mt-2 overflow-auto rounded-[12px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 text-[11.5px] leading-[1.7]">
              <code className="mono">
                {result.parts.map((part, index) =>
                  part.job ? (
                    <mark
                      key={index}
                      title={`${SQL_JOBS[part.job].label}: usually ${SQL_JOBS[part.job].usually}`}
                      className="rounded-[4px] px-0.5"
                      style={{ background: SQL_JOBS[part.job].tint, color: SQL_JOBS[part.job].color }}
                    >
                      {part.text}
                    </mark>
                  ) : (
                    <span key={index}>{part.text}</span>
                  )
                )}
              </code>
            </pre>
            <p className="mt-2 text-[11px] text-[var(--ink-muted)]">
              <span className="mono">aa_fraud_device_velocity</span> supplies the exact peak in any
              rolling 10-minute interval through <span className="mono">through_logical_time</span>.
              The other views join cases, JSON reason codes, merchants, and devices.
              {revealed ? (
                <>
                  {" "}
                  Ran in <strong>{result.elapsed_ms} ms</strong> on data committed up to the current
                  logical time.
                </>
              ) : (
                <> Run the statement to read all of that together.</>
              )}
            </p>
          </div>

          {revealed && (
          <div>
            <p className="label">Past cases describing the same behavior as {result.reference_case}</p>
            {result.reference_note && (
              <p className="mt-1 text-[12px] italic leading-5 text-[var(--ink-soft)]">
                “{result.reference_note}”
              </p>
            )}
            {first && (
              <p className="mt-2 text-[12px] leading-5">
                Across these {result.matches.length} cases:{" "}
                <strong>{formatMetric(first.loss_across_matches, "currency")}</strong> confirmed loss and{" "}
                <strong>{first.false_positives_across_matches}</strong> false positives. Similar
                behavior does not decide a case; check whether the device is shared and how fast its
                alerts arrived.
              </p>
            )}
            {result.matches.length === 0 ? (
              <p className="mt-3 rounded-[12px] border border-[var(--line)] bg-[var(--surface-sunk)] px-4 py-5 text-[13px] leading-5 text-[var(--ink-soft)]">
                The statement ran, but no similar cases joined for this reference. Restore a clean
                demo and run the query again.
              </p>
            ) : (
            <div className="scroll-thin mt-3 max-h-[420px] overflow-auto">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Disposition</th>
                    <th className="num">Behavior similarity</th>
                    <th>velocity_breach</th>
                    <th>Device</th>
                    <th className="num">Alerts on device</th>
                    <th className="num">Peak per 10 min</th>
                    <th className="num">Confirmed loss</th>
                    <th>Investigator note</th>
                  </tr>
                </thead>
                <tbody>
                  {result.matches.map((row) => (
                    <tr key={row.case_id}>
                      <td>
                        <Link
                          href={`/anchors/a3/case/${encodeURIComponent(row.case_id)}`}
                          className="font-medium text-[var(--accent-dark)] hover:underline"
                        >
                          {row.case_id}
                        </Link>
                      </td>
                      <td>{row.human_disposition}</td>
                      <td className="num mono">{row.note_similarity.toFixed(2)}</td>
                      <td>{row.velocity_breach ? "yes" : "no"}</td>
                      <td className="mono">{row.device_id ?? "—"}</td>
                      <td className="num mono">{row.device_alert_count}</td>
                      <td className="num mono">{row.peak_device_alerts_10m}</td>
                      <td className="num mono">{formatMetric(row.confirmed_loss_usd, "currency")}</td>
                      <td className="min-w-[280px] text-[11px] leading-4 text-[var(--ink-soft)]">
                        {row.notes ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>
          )}
        </div>
      )}
    </Card>
  );
}
