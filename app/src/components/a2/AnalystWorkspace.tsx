"use client";

/**
 * Natural-language investigation panel.
 *
 * Everything the room needs to trust the answer is on screen: whether it came
 * from a live Aura Analyst call or a reviewed fixture, how long it took, the SQL
 * Analyst generated, and the guardrail that Analyst explains rather than
 * decides. The panel is additive: if it fails, the deterministic widgets above
 * still tell the whole story.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnalystChart } from "@/components/AnalystChart";
import { AnalystTable } from "@/components/AnalystTable";
import { useDemoState } from "@/components/DemoStateProvider";
import { Banner, Card, Pill, type Tone } from "@/components/ui";
import { readChatStream, type StreamItem } from "@/lib/analyst/chatStream";

interface Turn {
  id: string;
  question: string;
  items: StreamItem[];
  source: "live" | "fixture" | null;
  fixtureId: string | null;
  degradedReason: string | null;
  latencyMs: number | null;
  error: string | null;
  streaming: boolean;
}

const SOURCE_TONE: Record<string, Tone> = { live: "good", fixture: "warn" };

/** Presenter-facing caption for a fixture-sourced turn. */
function fixtureSourceCaption(reason: string | null, fixtureId: string | null): string {
  const id = fixtureId && fixtureId !== "none" ? ` (${fixtureId})` : "";
  if (!reason || reason === "fixture mode selected") {
    return `Reviewed fixture${id}`;
  }
  if (reason.startsWith("live call failed")) {
    const detail = reason.slice("live call failed: ".length);
    if (/cookie not found|session not found|unknown session/i.test(detail)) {
      return `Reviewed fixture · live session expired${id}`;
    }
    return `Reviewed fixture after live unavailable: ${detail}${id}`;
  }
  if (reason.includes("not keyed") || reason.includes("not configured")) {
    return `Reviewed fixture · live Domain not keyed${id}`;
  }
  return `Reviewed fixture · ${reason}${id}`;
}

function SqlBlock({ sql }: { sql: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        className="btn"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide generated SQL" : "Show generated SQL"}
      </button>
      {open && (
        <pre className="scroll-thin mono mt-2 max-h-64 overflow-auto rounded-[8px] border border-[var(--line)] bg-[var(--surface-sunk)] p-3 text-[11px] leading-5">
          {sql}
        </pre>
      )}
    </div>
  );
}

function TurnBody({ turn }: { turn: Turn }) {
  const prose = turn.items.filter((item) => item.kind === "text" && item.text.trim());
  const tables = turn.items.filter((item) => item.kind === "table" && item.table);
  const charts = turn.items.filter((item) => item.kind === "chart" && item.chart);
  const sql = turn.items.find((item) => item.sql)?.sql ?? null;

  return (
    <div className="space-y-3">
      {prose.map((item) => (
        <p key={item.id} className="whitespace-pre-wrap text-[13px] leading-6">
          {item.text}
        </p>
      ))}

      {charts.map((item) => (
        <div key={item.id} className="rounded-[8px] border border-[var(--line)] p-2">
          <AnalystChart data={item.chart!.data} layout={item.chart!.layout} />
        </div>
      ))}

      {tables.map((item) => (
        <AnalystTable
          key={item.id}
          columns={item.table!.columns}
          rows={item.table!.rows}
          truncated={item.table!.truncated}
        />
      ))}

      {turn.streaming && !turn.items.length && (
        <p className="text-[12px] text-[var(--ink-muted)]">Analyst is working…</p>
      )}

      {sql && <SqlBlock sql={sql} />}
    </div>
  );
}

export function AnalystWorkspace({
  anchorId,
  guardrailText,
  humanOwnership,
}: {
  anchorId: string;
  guardrailText: string;
  humanOwnership: string | null;
}) {
  const { analystMode, envelope, config, tabId, persona } = useDemoState();
  const [starters, setStarters] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const runId = envelope?.state.run_id ?? null;
  const anchorSummary = config?.anchors.find((anchor) => anchor.id === anchorId);
  const configured = anchorSummary?.analyst_configured ?? false;

  const pinTranscript = useCallback((force = false) => {
    const node = transcriptRef.current;
    if (!node) return;
    if (!force && !stickToBottom.current) return;
    node.scrollTop = node.scrollHeight;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/v1/analyst/starters/${anchorId}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const body = (await response.json()) as { curated: string[]; live: string[] };
        if (cancelled) return;
        setStarters([...new Set([...(body.curated ?? []), ...(body.live ?? [])])].slice(0, 6));
      } catch {
        // Curated prompts are also rendered from the anchor definition below.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [anchorId]);

  // A reset produces a new run, which invalidates the conversation: the data
  // behind the previous answers no longer exists.
  useEffect(() => {
    setTurns([]);
    if (runId === null) return;
    void fetch("/api/v1/analyst/session/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-demo-tab-id": tabId },
      body: JSON.stringify({ anchor: anchorId }),
    }).catch(() => undefined);
  }, [runId, anchorId, tabId]);

  // Keep the transcript pinned inside its own scroller. Never use
  // scrollIntoView — that scrolls the whole page and makes the layout bounce
  // while tokens stream in.
  useEffect(() => {
    pinTranscript();
  }, [turns, pinTranscript]);

  const ask = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const turnId = `turn-${Date.now()}`;
      const startedAt = performance.now();
      stickToBottom.current = true;
      setTurns((current) => [
        ...current,
        {
          id: turnId,
          question: trimmed,
          items: [],
          source: null,
          fixtureId: null,
          degradedReason: null,
          latencyMs: null,
          error: null,
          streaming: true,
        },
      ]);
      setQuestion("");
      setPending(true);
      requestAnimationFrame(() => pinTranscript(true));

      const patch = (changes: Partial<Turn>) =>
        setTurns((current) =>
          current.map((turn) => (turn.id === turnId ? { ...turn, ...changes } : turn))
        );

      try {
        const response = await fetch("/api/v1/analyst/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-demo-tab-id": tabId },
          body: JSON.stringify({ anchor: anchorId, message: trimmed, mode: analystMode }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          patch({
            streaming: false,
            error: body.error?.message ?? `Analyst request failed (${response.status}).`,
            latencyMs: Math.round(performance.now() - startedAt),
          });
          return;
        }

        patch({
          source: (response.headers.get("x-analyst-source") as "live" | "fixture") ?? null,
          fixtureId: response.headers.get("x-analyst-fixture-id"),
          degradedReason: response.headers.get("x-analyst-degraded-reason"),
        });

        const final = await readChatStream(
          response.body,
          (state) => patch({ items: state.items, error: state.error }),
          controller.signal
        );
        patch({
          items: final.items,
          error: final.error,
          streaming: false,
          latencyMs: Math.round(performance.now() - startedAt),
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        patch({
          streaming: false,
          error: error instanceof Error ? error.message : "The Analyst call failed.",
          latencyMs: Math.round(performance.now() - startedAt),
        });
      } finally {
        setPending(false);
      }
    },
    [analystMode, anchorId, pending, pinTranscript, tabId]
  );

  const modeNote = useMemo(() => {
    if (analystMode === "fixture") {
      return "Fixture mode: every answer is a reviewed stored response. Nothing is sent to Aura Analyst.";
    }
    if (!configured) {
      return "Live Domain not keyed for this anchor — answers are reviewed fixtures until ANALYST_A{N}_API_KEY is set.";
    }
    if (analystMode === "live") {
      return "Live mode: answers come from Aura Analyst, and a failure is shown rather than hidden.";
    }
    return "Auto mode: Aura Analyst is called first; if unavailable, a reviewed fixture is labelled on screen.";
  }, [analystMode, configured]);

  return (
    <Card
      title={`Ask about ${anchorSummary?.name ?? anchorId.toUpperCase()}`}
      subtitle={
        persona === "technical"
          ? modeNote
          : "Investigate the current business signals and supporting evidence in plain language."
      }
      actions={
        <>
          {persona === "technical" && (
            <Pill tone={configured ? "good" : "warn"}>
              {configured ? "domain keyed" : "fixture only"}
            </Pill>
          )}
          {turns.length > 0 && (
            <button type="button" className="btn" onClick={() => setTurns([])}>
              New conversation
            </button>
          )}
        </>
      }
      footnote={
        <span>
          {guardrailText}
          {humanOwnership ? ` ${humanOwnership}` : ""}
        </span>
      }
    >
      <div className="flex min-h-0 flex-col gap-3">
        {persona === "risk" && (
          <Banner tone="accent">
            Analyst reads only the curated views in this anchor&apos;s Domain. It cannot see raw
            control tables, and it cannot write.
          </Banner>
        )}

        <div className="flex flex-wrap gap-2">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-left text-[11px] font-medium leading-4 text-[var(--ink-soft)] transition-colors hover:border-[#adddca] hover:bg-[var(--accent-soft)]"
              disabled={pending}
              onClick={() => void ask(starter)}
            >
              {starter} <span className="text-[var(--accent)]">↗</span>
            </button>
          ))}
        </div>

        <div
          ref={transcriptRef}
          className="scroll-thin max-h-[560px] min-h-[180px] space-y-3 overflow-auto"
          onScroll={(event) => {
            const node = event.currentTarget;
            const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
            stickToBottom.current = distanceFromBottom < 64;
          }}
        >
          {turns.length === 0 && (
            <p className="rounded-[12px] border border-dashed border-[var(--line)] px-4 py-8 text-center text-[12px] text-[var(--ink-muted)]">
              Ask a starter or type a question. New answers stay pinned to the bottom of this panel.
            </p>
          )}
          {turns.map((turn) => (
            <article key={turn.id} className="card-sunk p-4">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-semibold">{turn.question}</p>
                <div className="flex items-center gap-1.5">
                  {turn.source && (
                    <Pill tone={SOURCE_TONE[turn.source] ?? "neutral"}>{turn.source}</Pill>
                  )}
                  {turn.latencyMs !== null && (
                    <Pill tone="neutral">{turn.latencyMs.toLocaleString()} ms</Pill>
                  )}
                </div>
              </header>

              {turn.source === "fixture" && (
                <p
                  className={`mt-1 text-[11px] ${
                    turn.degradedReason?.startsWith("live call failed")
                      ? "text-[var(--amber)]"
                      : "text-[var(--ink-muted)]"
                  }`}
                >
                  {fixtureSourceCaption(turn.degradedReason, turn.fixtureId)}
                </p>
              )}

              <div className="mt-2">
                {turn.error ? (
                  <Banner tone="bad">{turn.error}</Banner>
                ) : (
                  <TurnBody turn={turn} />
                )}
              </div>
            </article>
          ))}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void ask(question);
          }}
          className="sticky bottom-0 z-[1] flex gap-2 rounded-[14px] border border-[#cde5da] bg-[var(--accent-soft)] p-2 shadow-[0_-8px_24px_rgba(7,28,23,.04)]"
        >
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={`Ask a question about ${anchorSummary?.name ?? "this anchor"}…`}
            maxLength={config?.analyst.max_message_chars ?? 2000}
            className="flex-1 rounded-[10px] border border-transparent bg-[var(--surface)] px-4 py-3 text-[13px] shadow-sm outline-none focus:border-[var(--accent)]"
          />
          <button type="submit" className="btn btn-dark px-5" disabled={pending || !question.trim()}>
            {pending ? "Analyzing…" : "Ask"}
          </button>
        </form>
      </div>
    </Card>
  );
}
