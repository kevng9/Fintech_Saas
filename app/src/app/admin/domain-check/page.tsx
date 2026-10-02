"use client";

/**
 * Known-question suite runner.
 *
 * Run this after any change to a Domain's context, instructions or views. The
 * automatic checks are deliberately narrow — did rows come back, was SQL
 * generated, was an unsupported action refused — because the interesting part is
 * whether the answer is *right*, and that needs a human. The page therefore
 * records an explicit human verdict alongside the automatic result.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDemoState } from "@/components/DemoStateProvider";
import { AnalystMarkdown } from "@/components/a2/AnalystMarkdown";
import { presentAnalystAnswer } from "@/lib/analyst/commentary";
import { AnalystTable } from "@/components/AnalystTable";
import { Banner, Card, Empty, Pill, Skeleton, type Tone } from "@/components/ui";
import { readChatStream, type StreamItem } from "@/lib/analyst/chatStream";

type AutoCheck = "expects_rows" | "expects_no_rows" | "expects_sql" | "expects_refusal";

interface KnownQuestion {
  id: string;
  anchorId: string;
  question: string;
  category: string;
  expectation: string;
  autoChecks: AutoCheck[];
}

type Verdict = "unrun" | "pass" | "fail" | "review";

interface Outcome {
  status: "running" | "done" | "error";
  source: string | null;
  latencyMs: number | null;
  items: StreamItem[];
  error: string | null;
  autoResults: { check: AutoCheck; ok: boolean; detail: string }[];
  humanVerdict: Verdict;
}

const REFUSAL_MARKERS = [
  "cannot",
  "can't",
  "do not have the ability",
  "unable to",
  "not able to",
  "does not perform",
  "read-only",
  "i can analyse",
  "i can analyze",
];

function evaluate(
  question: KnownQuestion,
  items: StreamItem[]
): { check: AutoCheck; ok: boolean; detail: string }[] {
  const prose = items
    .filter((item) => item.kind === "text")
    .map((item) => item.text)
    .join(" ")
    .toLowerCase();
  const tables = items.filter((item) => item.kind === "table" && item.table);
  const rowCount = tables.reduce((sum, item) => sum + (item.table?.rows.length ?? 0), 0);
  const hasSql = items.some((item) => item.sql);

  return question.autoChecks.map((check) => {
    switch (check) {
      case "expects_rows":
        return { check, ok: rowCount > 0, detail: `${rowCount} rows returned` };
      case "expects_no_rows":
        return {
          check,
          ok: rowCount === 0,
          detail: rowCount === 0 ? "no rows, as required" : `${rowCount} rows returned`,
        };
      case "expects_sql":
        return { check, ok: hasSql, detail: hasSql ? "SQL present" : "no SQL in the answer" };
      case "expects_refusal": {
        const refused = REFUSAL_MARKERS.some((marker) => prose.includes(marker));
        return {
          check,
          ok: refused,
          detail: refused ? "answer declines the action" : "no refusal language found",
        };
      }
      default:
        return { check, ok: false, detail: "unknown check" };
    }
  });
}

const VERDICT_TONE: Record<Verdict, Tone> = {
  unrun: "neutral",
  pass: "good",
  fail: "bad",
  review: "warn",
};

export default function DomainCheckPage() {
  const { analystMode, tabId, config } = useDemoState();
  const [questions, setQuestions] = useState<KnownQuestion[] | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const a2Configured = config?.anchors.find((anchor) => anchor.id === "a2")?.analyst_configured;

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/v1/admin/known-questions", { cache: "no-store" });
        if (!response.ok) {
          setError(`Known questions unavailable (${response.status}).`);
          return;
        }
        const body = (await response.json()) as { questions: KnownQuestion[] };
        setQuestions(body.questions);
      } catch {
        setError("Cannot reach the demo API.");
      }
    })();
  }, []);

  const ask = useCallback(
    async (question: KnownQuestion) => {
      const startedAt = performance.now();
      setOutcomes((current) => ({
        ...current,
        [question.id]: {
          status: "running",
          source: null,
          latencyMs: null,
          items: [],
          error: null,
          autoResults: [],
          humanVerdict: current[question.id]?.humanVerdict ?? "unrun",
        },
      }));

      const patch = (changes: Partial<Outcome>) =>
        setOutcomes((current) => ({
          ...current,
          [question.id]: { ...current[question.id], ...changes } as Outcome,
        }));

      try {
        const response = await fetch("/api/v1/analyst/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-demo-tab-id": tabId },
          body: JSON.stringify({
            anchor: question.anchorId,
            message: question.question,
            mode: analystMode,
          }),
        });

        if (!response.ok || !response.body) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          patch({
            status: "error",
            error: body.error?.message ?? `Request failed (${response.status}).`,
            latencyMs: Math.round(performance.now() - startedAt),
          });
          return;
        }

        const source = response.headers.get("x-analyst-source");
        const final = await readChatStream(response.body, () => undefined);
        patch({
          status: final.error ? "error" : "done",
          source,
          items: final.items,
          error: final.error,
          latencyMs: Math.round(performance.now() - startedAt),
          autoResults: evaluate(question, final.items),
        });
      } catch (caught) {
        patch({
          status: "error",
          error: caught instanceof Error ? caught.message : "The Analyst call failed.",
          latencyMs: Math.round(performance.now() - startedAt),
        });
      }
    },
    [analystMode, tabId]
  );

  const runAll = useCallback(async () => {
    if (!questions) return;
    setRunning(true);
    // Sequential on purpose: the suite includes a follow-up question that only
    // makes sense against the session the previous question created.
    for (const question of questions) {
      await ask(question);
    }
    setRunning(false);
  }, [ask, questions]);

  const summary = useMemo(() => {
    const values = Object.values(outcomes);
    const autoFailures = values.filter(
      (outcome) => outcome.autoResults.length && outcome.autoResults.some((result) => !result.ok)
    ).length;
    return {
      run: values.filter((outcome) => outcome.status !== "running").length,
      errors: values.filter((outcome) => outcome.status === "error").length,
      autoFailures,
      humanFails: values.filter((outcome) => outcome.humanVerdict === "fail").length,
    };
  }, [outcomes]);

  return (
    <div className="space-y-4">
      {error && <Banner tone="bad">{error}</Banner>}

      <Card
        title="Known-question suite"
        subtitle="Run after any change to a Domain's views, context or instructions"
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void runAll()}
            disabled={running || !questions}
          >
            {running ? "Running…" : "Run all"}
          </button>
        }
        footnote="Automatic checks confirm shape, not correctness. A question is only signed off when a human marks the answer correct."
      >
        <div className="space-y-2">
          {analystMode === "fixture" && (
            <Banner tone="warn">
              Analyst mode is set to fixture, so this run validates the stored responses rather than
              the Domain. Switch to live mode to test the Domain itself.
            </Banner>
          )}
          {analystMode !== "fixture" && !a2Configured && (
            <Banner tone="warn">
              No Domain key is configured for A2, so answers will come from fixtures. Set
              ANALYST_A2_API_KEY to validate the Domain.
            </Banner>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Pill tone="neutral">{summary.run} run</Pill>
            <Pill tone={summary.errors ? "bad" : "good"}>{summary.errors} errors</Pill>
            <Pill tone={summary.autoFailures ? "bad" : "good"}>
              {summary.autoFailures} auto-check failures
            </Pill>
            <Pill tone={summary.humanFails ? "bad" : "neutral"}>
              {summary.humanFails} marked incorrect
            </Pill>
          </div>
        </div>
      </Card>

      {questions === null ? (
        <Card title="Questions">
          <Skeleton rows={5} />
        </Card>
      ) : (
        questions.map((question) => {
          const outcome = outcomes[question.id];
          const presented = presentAnalystAnswer({
            texts: (outcome?.items ?? [])
              .filter((item) => item.kind === "text" && item.text.trim())
              .map((item) => item.text),
            tables: (outcome?.items ?? [])
              .filter((item) => item.kind === "table" && item.table)
              .map((item) => item.table!),
            streaming: outcome?.status === "running",
          });
          const prose = presented.prose;
          const table = presented.tables[0];
          const sql = (outcome?.items ?? []).find((item) => item.sql)?.sql;

          return (
            <Card
              key={question.id}
              title={
                <span className="flex items-center gap-2">
                  <span className="mono text-[11px] uppercase text-[var(--ink-muted)]">
                    {question.anchorId}
                  </span>
                  {question.question}
                </span>
              }
              subtitle={`Category: ${question.category}. Expected: ${question.expectation}`}
              actions={
                <>
                  {outcome?.source && (
                    <Pill tone={outcome.source === "live" ? "good" : "warn"}>
                      {outcome.source}
                    </Pill>
                  )}
                  {outcome?.latencyMs !== null && outcome?.latencyMs !== undefined && (
                    <Pill tone="neutral">{outcome.latencyMs.toLocaleString()} ms</Pill>
                  )}
                  <button
                    type="button"
                    className="btn"
                    disabled={running || outcome?.status === "running"}
                    onClick={() => void ask(question)}
                  >
                    {outcome?.status === "running" ? "Asking…" : "Ask"}
                  </button>
                </>
              }
            >
              {!outcome ? (
                <Empty>Not run yet.</Empty>
              ) : outcome.status === "running" ? (
                <Skeleton rows={2} />
              ) : (
                <div className="space-y-3">
                  {outcome.error && <Banner tone="bad">{outcome.error}</Banner>}

                  {outcome.autoResults.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {outcome.autoResults.map((result) => (
                        <li key={result.check}>
                          <Pill tone={result.ok ? "good" : "bad"} title={result.detail}>
                            {result.check}: {result.detail}
                          </Pill>
                        </li>
                      ))}
                    </ul>
                  )}

                  {prose && (
                    <AnalystMarkdown
                      text={prose}
                      className="space-y-3 text-[12px] leading-5 text-[var(--ink-soft)]"
                    />
                  )}

                  {table && (
                    <AnalystTable
                      columns={table.columns}
                      rows={table.rows}
                      truncated={table.truncated}
                      maxHeight={200}
                    />
                  )}

                  {sql && (
                    <pre className="scroll-thin mono max-h-48 overflow-auto rounded-[8px] border border-[var(--line)] bg-[var(--surface-sunk)] p-2 text-[11px] leading-5">
                      {sql}
                    </pre>
                  )}

                  <div className="flex items-center gap-2 border-t border-[var(--line)] pt-2">
                    <span className="label">Human verdict</span>
                    {(["pass", "review", "fail"] as Verdict[]).map((verdict) => (
                      <button
                        key={verdict}
                        type="button"
                        className="btn"
                        style={
                          outcome.humanVerdict === verdict
                            ? { borderColor: "var(--accent)", color: "var(--accent-dark)" }
                            : undefined
                        }
                        onClick={() =>
                          setOutcomes((current) => ({
                            ...current,
                            [question.id]: { ...current[question.id], humanVerdict: verdict },
                          }))
                        }
                      >
                        {verdict === "pass"
                          ? "Correct"
                          : verdict === "review"
                            ? "Needs review"
                            : "Incorrect"}
                      </button>
                    ))}
                    <Pill tone={VERDICT_TONE[outcome.humanVerdict]}>{outcome.humanVerdict}</Pill>
                  </div>
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
