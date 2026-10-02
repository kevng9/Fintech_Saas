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
import { AnalystMarkdown } from "@/components/a2/AnalystMarkdown";
import { presentAnalystAnswer } from "@/lib/analyst/commentary";
import { useDemoState } from "@/components/DemoStateProvider";
import { Banner, Card, Pill, type Tone } from "@/components/ui";
import { readChatStream, type StreamItem } from "@/lib/analyst/chatStream";
import {
  contextualizeStarter,
  entityLabel,
  type AnalystPageContext,
} from "@/lib/analyst/pageContext";
import {
  isUnsupportedSinglestoreSqlError,
  SINGLESTORE_SQL_RETRY_HINT,
} from "@/lib/analyst/singlestoreSql";

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
    return `Reviewed stored answer${id}`;
  }
  if (reason.startsWith("live call failed")) {
    const detail = reason.slice("live call failed: ".length);
    if (/cookie not found|session not found|unknown session/i.test(detail)) {
      return `Reviewed stored answer · live session expired${id}`;
    }
    return `Reviewed stored answer after live unavailable: ${detail}${id}`;
  }
  if (reason.includes("not keyed") || reason.includes("not configured")) {
    return `Reviewed stored answer · live Domain not keyed${id}`;
  }
  return `Reviewed stored answer · ${reason}${id}`;
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
  const presented = presentAnalystAnswer({
    texts: prose.map((item) => item.text),
    tables: tables.map((item) => item.table!),
    streaming: turn.streaming,
  });

  return (
    <div className="space-y-3">
      {presented.prose && <AnalystMarkdown text={presented.prose} />}

      {charts.map((item) => (
        <div key={item.id} className="rounded-[8px] border border-[var(--line)] p-2">
          <AnalystChart data={item.chart!.data} layout={item.chart!.layout} />
        </div>
      ))}

      {presented.tables.map((table, index) => (
        <AnalystTable
          key={`${table.columns.join("|")}-${index}`}
          columns={table.columns}
          rows={table.rows}
          truncated={table.truncated}
        />
      ))}

      {turn.streaming && !turn.items.length && (
        <p className="text-[12px] text-[var(--ink-muted)]">Analyst is working…</p>
      )}

      {sql && <SqlBlock sql={sql} />}
    </div>
  );
}

function turnLooksLikeDialectError(items: StreamItem[], error: string | null): boolean {
  if (isUnsupportedSinglestoreSqlError(error)) return true;
  return items.some(
    (item) =>
      isUnsupportedSinglestoreSqlError(item.text) || isUnsupportedSinglestoreSqlError(item.sql)
  );
}

export function AnalystWorkspace({
  anchorId,
  guardrailText,
  humanOwnership,
  pageContext = null,
}: {
  anchorId: string;
  guardrailText: string;
  humanOwnership: string | null;
  pageContext?: AnalystPageContext | null;
}) {
  const { analystMode, envelope, config, tabId, persona } = useDemoState();
  const [curatedStarters, setCuratedStarters] = useState<string[]>([]);
  const [additionalStarters, setAdditionalStarters] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const runId = envelope?.state.run_id ?? null;
  const anchorSummary = config?.anchors.find((anchor) => anchor.id === anchorId);
  const configured = anchorSummary?.analyst_configured ?? false;
  const contextKey = pageContext ? `${pageContext.entityType}:${pageContext.entityId}` : "";

  const displayCuratedStarters = useMemo(
    () =>
      (curatedStarters.length ? curatedStarters : (anchorSummary?.starterPrompts ?? []))
        .slice(0, 3)
        .map((starter) => contextualizeStarter(starter, pageContext)),
    [anchorSummary?.starterPrompts, curatedStarters, pageContext]
  );
  const displayAdditionalStarters = useMemo(
    () => additionalStarters.map((starter) => contextualizeStarter(starter, pageContext)),
    [additionalStarters, pageContext]
  );

  const pinTranscript = useCallback((force = false) => {
    const node = transcriptRef.current;
    if (!node) return;
    if (!force && !stickToBottom.current) return;
    node.scrollTop = node.scrollHeight;
  }, []);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const response = await fetch(`/api/v1/analyst/starters/${anchorId}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const body = (await response.json()) as { curated: string[]; live: string[] };
        if (canceled) return;
        const curated = [...new Set(body.curated ?? [])].slice(0, 3);
        const curatedSet = new Set(curated);
        setCuratedStarters(curated);
        setAdditionalStarters(
          [...new Set(body.live ?? [])].filter((starter) => !curatedSet.has(starter)).slice(0, 3)
        );
      } catch {
        // Curated prompts are also rendered from the anchor definition below.
      }
    })();
    return () => {
      canceled = true;
    };
  }, [anchorId]);

  // A reset produces a new run, which invalidates the conversation: the data
  // behind the previous answers no longer exists. Changing the open entity
  // also starts a fresh thread so prior answers do not imply the wrong id.
  useEffect(() => {
    setTurns([]);
    if (runId === null) return;
    void fetch("/api/v1/analyst/session/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-demo-tab-id": tabId },
      body: JSON.stringify({ anchor: anchorId }),
    }).catch(() => undefined);
  }, [runId, anchorId, tabId, contextKey]);

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

      const runOnce = async (
        outbound: string,
        modeOverride: "live" | "fixture" | "auto" = analystMode,
        timeoutMs = 0
      ) => {
        const attemptController = new AbortController();
        const abortAttempt = () => attemptController.abort();
        controller.signal.addEventListener("abort", abortAttempt, { once: true });
        const timeout = timeoutMs
          ? window.setTimeout(() => attemptController.abort("analyst-timeout"), timeoutMs)
          : null;
        const cleanupAttempt = () => {
          if (timeout !== null) window.clearTimeout(timeout);
          controller.signal.removeEventListener("abort", abortAttempt);
        };
        let response: Response;
        try {
          response = await fetch("/api/v1/analyst/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-demo-tab-id": tabId },
            body: JSON.stringify({
              anchor: anchorId,
              message: outbound,
              mode: modeOverride,
              page_context: pageContext,
            }),
            signal: attemptController.signal,
          });
        } catch (error) {
          const timedOut = timeoutMs > 0 && !controller.signal.aborted;
          cleanupAttempt();
          return {
            ok: false as const,
            source: null as "live" | "fixture" | null,
            error: timedOut
              ? "Aura Analyst exceeded the 30-second response budget."
              : error instanceof Error
                ? error.message
                : "The Analyst call failed.",
            items: [] as StreamItem[],
            timedOut,
          };
        }

        if (!response.ok || !response.body) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          cleanupAttempt();
          return {
            ok: false as const,
            source: null as "live" | "fixture" | null,
            error: body.error?.message ?? `Analyst request failed (${response.status}).`,
            items: [] as StreamItem[],
            timedOut: false,
          };
        }

        const source =
          (response.headers.get("x-analyst-source") as "live" | "fixture" | null) ?? null;
        patch({
          source,
          fixtureId: response.headers.get("x-analyst-fixture-id"),
          degradedReason: response.headers.get("x-analyst-degraded-reason"),
        });

        let final;
        try {
          final = await readChatStream(
            response.body,
            (state) => patch({ items: state.items, error: state.error }),
            attemptController.signal
          );
        } catch (error) {
          const timedOut = timeoutMs > 0 && !controller.signal.aborted;
          cleanupAttempt();
          return {
            ok: false as const,
            source,
            error: timedOut
              ? "Aura Analyst exceeded the 30-second response budget."
              : error instanceof Error
                ? error.message
                : "The Analyst stream failed.",
            items: [] as StreamItem[],
            timedOut,
          };
        }
        const timedOut = timeoutMs > 0 && attemptController.signal.aborted && !controller.signal.aborted;
        cleanupAttempt();
        if (timedOut) {
          return {
            ok: false as const,
            source,
            error: "Aura Analyst exceeded the 30-second response budget.",
            items: [] as StreamItem[],
            timedOut: true,
          };
        }
        return {
          ok: true as const,
          source,
          error: final.error,
          items: final.items,
          timedOut: false,
        };
      };

      try {
        const liveOnly = analystMode === "live" || config?.analyst.mode === "live";
        let result = await runOnce(trimmed, liveOnly ? "live" : analystMode, !liveOnly && analystMode === "auto" ? 30_000 : 0);
        if (!result.ok && result.timedOut && !liveOnly && analystMode === "auto") {
          result = await runOnce(trimmed, "fixture");
          patch({ degradedReason: "live answer exceeded 30 seconds; showing reviewed answer" });
        }
        if (!result.ok) {
          patch({
            streaming: false,
            error: result.error,
            latencyMs: Math.round(performance.now() - startedAt),
          });
          return;
        }

        // Aura sometimes emits MySQL GROUP_CONCAT shapes SingleStore rejects
        // (error 1706). Retry once on the same turn with an explicit SQL constraint.
        if (result.source === "live" && turnLooksLikeDialectError(result.items, result.error)) {
          patch({ items: [], error: null, streaming: true });
          result = await runOnce(
            `${trimmed}\n\n${SINGLESTORE_SQL_RETRY_HINT}`,
            liveOnly ? "live" : analystMode,
            !liveOnly && analystMode === "auto" ? 30_000 : 0
          );
          if (!result.ok && result.timedOut && !liveOnly && analystMode === "auto") {
            result = await runOnce(trimmed, "fixture");
            patch({ degradedReason: "live retry exceeded 30 seconds; showing reviewed answer" });
          }
          if (!result.ok) {
            patch({
              streaming: false,
              error: result.error,
              latencyMs: Math.round(performance.now() - startedAt),
            });
            return;
          }
        }

        patch({
          items: result.items,
          error: result.error,
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
    [analystMode, anchorId, config, pageContext, pending, pinTranscript, tabId]
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
    return "Auto mode: Aura Analyst is called first; if unavailable, a reviewed fixture is labeled on screen.";
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
        {pageContext && (
          <Banner tone="accent">
            Looking at {entityLabel(pageContext.entityType)}{" "}
            <span className="font-semibold">{pageContext.entityId}</span>. Questions about the
            selected record use this id automatically.
          </Banner>
        )}

        {persona === "risk" && (
          <Banner tone="accent">
            Use a reviewed question below for the clearest regulatory story. Analyst reads only
            curated views, cannot write, and never makes the human decision.
          </Banner>
        )}

        <div className="grid gap-2">
          {displayCuratedStarters.map((starter) => (
            <button
              key={starter}
              type="button"
              className="min-h-11 rounded-[10px] border border-[#cde5da] bg-[var(--surface)] px-3 py-2.5 text-left text-[12px] font-semibold leading-5 text-[var(--ink-soft)] shadow-sm transition-colors hover:border-[#8bcdb5] hover:text-[var(--accent-dark)]"
              disabled={pending}
              onClick={() => void ask(starter)}
            >
              {starter} <span className="text-[var(--accent)]">↗</span>
            </button>
          ))}
        </div>
        {displayAdditionalStarters.length > 0 && (
          <details>
            <summary className="cursor-pointer text-[10px] font-semibold text-[var(--ink-muted)]">
              More suggested questions
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {displayAdditionalStarters.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  className="rounded-[9px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-left text-[11px] leading-4 text-[var(--ink-soft)]"
                  disabled={pending}
                  onClick={() => void ask(starter)}
                >
                  {starter}
                </button>
              ))}
            </div>
          </details>
        )}

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
              Choose a reviewed question above. New answers stay pinned to the bottom of this panel.
            </p>
          )}
          {turns.map((turn) => (
            <article key={turn.id} className="card-sunk p-4">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-semibold">{turn.question}</p>
                <div className="flex items-center gap-1.5">
                  {turn.source && (
                    <Pill tone={SOURCE_TONE[turn.source] ?? "neutral"}>
                      {turn.source === "fixture" ? "reviewed answer" : "live Analyst"}
                    </Pill>
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

        <details className="sticky bottom-0 z-[1] rounded-[14px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_-8px_24px_rgba(7,28,23,.04)]">
          <summary className="cursor-pointer px-4 py-3 text-[11px] font-semibold text-[var(--ink-soft)]">
            Ask your own question
          </summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void ask(question);
            }}
            className="flex gap-2 border-t border-[var(--line)] bg-[var(--surface-raised)] p-2"
          >
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={`Ask about ${anchorSummary?.name ?? "this story"}…`}
              maxLength={config?.analyst.max_message_chars ?? 2000}
              className="min-w-0 flex-1 rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-3 text-[13px] shadow-sm outline-none focus:border-[var(--accent)]"
            />
            <button
              type="submit"
              className="btn btn-dark px-5"
              disabled={pending || !question.trim()}
            >
              {pending ? "Analyzing…" : "Ask"}
            </button>
          </form>
        </details>
      </div>
    </Card>
  );
}
