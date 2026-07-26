"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDemoState } from "@/components/DemoStateProvider";
import { Banner, Dot, Pill, type Tone } from "@/components/ui";
import type { HealthPayload } from "@/lib/apiTypes";

type Feedback = { tone: Tone; text: string };

export function PresenterCard() {
  const {
    analystMode,
    busyAction,
    config,
    envelope,
    persona,
    reset,
    setAnalystMode,
  } = useDemoState();
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const check = useCallback(async (clearFeedback = true) => {
    setChecking(true);
    if (clearFeedback) setFeedback(null);
    try {
      const response = await fetch("/api/health/demo", { cache: "no-store" });
      const body = (await response.json()) as HealthPayload;
      setHealth(body);
    } catch {
      setFeedback({ tone: "bad", text: "The readiness check could not reach the demo." });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const blockingChecks = useMemo(
    () =>
      (health?.checks ?? []).filter(
        (item) => !item.ok && (item.id !== "all_live_domains" || analystMode === "live")
      ),
    [analystMode, health]
  );
  const ready = Boolean(health && blockingChecks.length === 0);
  const isAdmin = (envelope?.role ?? config?.role) === "demo_administrator";
  const recommendedAnchor = persona === "risk" ? "a7" : "a2";
  const recommendation =
    recommendedAnchor === "a7"
      ? {
          name: "Credit Risk Pulse",
          reason: "Best for risk and regulatory audiences: evidence is assembled, while decisions stay with credit officers.",
        }
      : {
          name: "Payment Pulse",
          reason: "Best general opener: the audience sees a clear operational change, its cause, and the supporting rows.",
        };

  async function restoreBaseline() {
    setFeedback(null);
    const result = await reset();
    if (!result.ok) {
      setFeedback({
        tone: "bad",
        text: result.message ?? "The clean baseline could not be restored.",
      });
      return;
    }
    setFeedback({
      tone: "good",
      text: "Clean demo restored. Open the recommended story when you are ready.",
    });
    await check(false);
  }

  function useStoredAnswers() {
    setAnalystMode("fixture");
    setFeedback({
      tone: "good",
      text: "Reviewed stored answers are on for this tab. The dashboard data remains live.",
    });
  }

  return (
    <section
      aria-labelledby="presenter-card-title"
      className={`overflow-hidden rounded-[20px] border shadow-[var(--shadow-sm)] ${
        ready
          ? "border-[#b8dec9] bg-[var(--good-soft)]"
          : "border-[#eddcb4] bg-[#fdf8ed]"
      }`}
    >
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.05fr_1.35fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={ready ? "good" : "warn"}>
              <Dot tone={ready ? "good" : "warn"} />
              {ready ? "Green light" : health ? "Not ready yet" : "Checking readiness"}
            </Pill>
            <span className="text-[11px] font-semibold text-[var(--ink-muted)]">
              Presenter card
            </span>
          </div>
          <h2
            id="presenter-card-title"
            className="mt-3 text-[24px] font-semibold tracking-[-0.04em]"
          >
            {ready ? "You can start the meeting." : "Pause before presenting."}
          </h2>
          <p className="mt-2 max-w-[58ch] text-[13px] leading-6 text-[var(--ink-soft)]">
            {ready
              ? "The data, stream, baseline, and reviewed answers are available. Live Analyst can fall back safely if needed."
              : health
                ? `${blockingChecks.length} required check${blockingChecks.length === 1 ? "" : "s"} need attention. Open details before you start.`
                : "Confirming the data, stream, baseline, and reviewed answers."}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => void check()} disabled={checking}>
              {checking ? "Checking…" : "Check again"}
            </button>
            <Link href="/admin" className="btn">
              {ready ? "View details" : "See what needs attention"}
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[14px] border border-white/70 bg-white/70 p-4">
            <p className="label">1 · Start here</p>
            <Link
              href={`/anchors/${recommendedAnchor}`}
              className="mt-2 block text-[15px] font-semibold text-[var(--accent-dark)] hover:underline"
            >
              {recommendation.name} →
            </Link>
            <p className="mt-1 text-[11px] leading-4 text-[var(--ink-soft)]">
              {recommendation.reason}
            </p>
          </div>
          <div className="rounded-[14px] border border-white/70 bg-white/70 p-4">
            <p className="label">2 · Create the moment</p>
            <p className="mt-2 text-[13px] font-semibold">Run the visible story</p>
            <p className="mt-1 text-[11px] leading-4 text-[var(--ink-soft)]">
              Use the large story button, then point to the before-and-after evidence.
            </p>
          </div>
          <div className="rounded-[14px] border border-white/70 bg-white/70 p-4">
            <p className="label">3 · Explain it</p>
            <p className="mt-2 text-[13px] font-semibold">Choose a reviewed question</p>
            <p className="mt-1 text-[11px] leading-4 text-[var(--ink-soft)]">
              Analyst starts in Auto and clearly labels any stored answer it uses.
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-black/[0.06] bg-white/55 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold">Need to recover mid-demo?</p>
            <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
              These actions are separate because the baseline reset and Analyst answer mode are not one atomic operation.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:ml-auto">
            <button
              type="button"
              className="btn"
              disabled={!isAdmin || !envelope?.state || busyAction !== null}
              onClick={() => void restoreBaseline()}
            >
              {busyAction === "reset" ? "Restoring clean demo…" : "Restore clean demo"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={analystMode === "fixture"}
              onClick={useStoredAnswers}
            >
              {analystMode === "fixture" ? "Stored answers on" : "Use reviewed answers"}
            </button>
          </div>
        </div>
        {feedback && (
          <div className="mt-3">
            <Banner tone={feedback.tone}>{feedback.text}</Banner>
          </div>
        )}
      </div>
    </section>
  );
}
