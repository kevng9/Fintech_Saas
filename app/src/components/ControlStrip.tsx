"use client";

/**
 * The presenter's control surface: run identity, logical clock, stream state,
 * speed, reset, persona and Analyst mode.
 *
 * Every control sends the state version the strip was rendered from, so a click
 * made against a stale view is rejected by the server rather than applied to a
 * run that has since moved on. The strip therefore also surfaces the version and
 * whether the simulator leader is alive.
 */

import { useEffect, useState } from "react";
import {
  useDemoState,
  type AnalystModeChoice,
  type PersonaId,
} from "@/components/DemoStateProvider";
import { Dot, Pill, type Tone } from "@/components/ui";
import { logicalClock, logicalDate } from "@/lib/format";

const STREAM_TONE: Record<string, Tone> = {
  RUNNING: "good",
  PAUSED: "warn",
  PREPARING: "neutral",
  RESETTING: "accent",
  FAILED: "bad",
};

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; title?: string }[];
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="label">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex overflow-hidden rounded-[8px] border border-[var(--line-strong)]"
      >
        {options.map((option) => {
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              title={option.title}
              disabled={disabled}
              onClick={() => onChange(option.id)}
              className="px-2.5 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: active ? "var(--accent)" : "var(--surface)",
                color: active ? "#fff" : "var(--ink-soft)",
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ControlStrip() {
  const {
    config,
    envelope,
    error,
    busyAction,
    persona,
    setPersona,
    analystMode,
    setAnalystMode,
    presentationMode,
    setPresentationMode,
    pause,
    resume,
    setSpeed,
    reset,
  } = useDemoState();

  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const state = envelope?.state;
  const isAdmin = (envelope?.role ?? config?.role) === "demo_administrator";
  const running = state?.stream_status === "RUNNING";
  const speeds = config?.simulator.allowed_speeds ?? [1];

  async function act(
    action: () => Promise<{ ok: boolean; message?: string; status: number }>,
    successMessage?: string
  ) {
    const result = await action();
    if (result.ok) {
      setNotice(successMessage ? { tone: "good", text: successMessage } : null);
      return true;
    }
    setNotice({
      tone: "bad",
      text:
        result.status === 409
          ? "That change was rejected because the demo moved on. The view has refreshed; try again."
          : result.message ?? "The demo could not apply that change.",
    });
    return false;
  }

  return (
    <div className="border-b border-[var(--line)] bg-[var(--surface)]">
      <div className="mx-auto flex min-h-10 max-w-[1480px] items-center gap-3 px-6 py-1.5">
        <span className="flex items-center gap-2 text-[11px] font-semibold text-[var(--ink-soft)]">
          <Dot tone={STREAM_TONE[state?.stream_status ?? "PREPARING"] ?? "neutral"} />
          {state?.leader_alive ? "Live payment environment" : "Payment environment paused"}
        </span>
        <span className="h-3 w-px bg-[var(--line-strong)]" />
        <span className="text-[11px] text-[var(--ink-muted)]">
          Business time{" "}
          <strong className="font-semibold text-[var(--ink-soft)]">
            {logicalClock(state?.logical_time)} · {logicalDate(state?.logical_time)}
          </strong>
        </span>
        <button
          type="button"
          className="ml-auto flex items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--ink-soft)] transition-colors hover:bg-[var(--surface-sunk)]"
          aria-expanded={controlsOpen}
          onClick={() => setControlsOpen((value) => !value)}
        >
          Demo controls
          <span
            aria-hidden
            className="text-[10px] transition-transform"
            style={{ transform: controlsOpen ? "rotate(180deg)" : undefined }}
          >
            ▾
          </span>
        </button>
      </div>

      {controlsOpen && (
        <div className="border-t border-[var(--line)] bg-[var(--surface-raised)]">
          <div className="mx-auto max-w-[1480px] space-y-3 px-6 py-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <Segmented<PersonaId>
                label="Audience"
                value={persona}
                onChange={setPersona}
                options={(config?.personas ?? []).map((option) => ({
                  id: option.id as PersonaId,
                  label: option.label,
                  title: option.emphasis,
                }))}
              />

              <div className="flex items-center gap-2 text-[12px]">
                <span className="label">Analyst</span>
                <Pill tone={analystMode === "fixture" ? "warn" : "good"}>
                  {analystMode === "auto"
                    ? "Auto · safe fallback"
                    : analystMode === "fixture"
                      ? "Reviewed answers"
                      : "Live only"}
                </Pill>
              </div>

              <label
                className="flex items-center gap-1.5 text-[12px] text-[var(--ink-soft)]"
                title="Hides demo controls and scenario panels. Exit with Esc or Exit presentation in the header."
              >
                <input
                  type="checkbox"
                  checked={presentationMode}
                  onChange={(event) => setPresentationMode(event.target.checked)}
                />
                Presentation mode
              </label>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn"
                  disabled={
                    !isAdmin || !state || busyAction !== null || analystMode === "fixture"
                  }
                  onClick={() => {
                    setAnalystMode("fixture");
                    setNotice({
                      tone: "good",
                      text: "Reviewed stored answers are on for this tab. Dashboard data remains live.",
                    });
                  }}
                >
                  {analystMode === "fixture" ? "Stored answers on" : "Use reviewed answers"}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!isAdmin || !state || busyAction !== null}
                  title="Restore the verified baseline. Success appears only after the server confirms it."
                  onClick={() =>
                    void act(reset, "Clean demo restored. You can run the story again.")
                  }
                >
                  {busyAction === "reset" ? "Restoring…" : "Restore clean demo"}
                </button>
              </div>
            </div>

            <div className="border-t border-[var(--line)] pt-2">
              <button
                type="button"
                className="flex items-center gap-2 text-[11px] font-semibold text-[var(--ink-muted)] hover:text-[var(--ink-soft)]"
                aria-expanded={advancedOpen}
                onClick={() => setAdvancedOpen((value) => !value)}
              >
                Advanced
                <span aria-hidden>{advancedOpen ? "▴" : "▾"}</span>
              </button>

              {advancedOpen && (
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <div className="flex items-center gap-1.5">
                    <Pill tone={STREAM_TONE[state?.stream_status ?? "PREPARING"] ?? "neutral"}>
                      <Dot
                        tone={STREAM_TONE[state?.stream_status ?? "PREPARING"] ?? "neutral"}
                      />
                      {state?.stream_status ?? "no run"}
                    </Pill>
                    {state && !state.leader_alive && (
                      <Pill tone="bad" title="No simulator process is sending heartbeats.">
                        simulator offline
                      </Pill>
                    )}
                    {state && <Pill tone="neutral">run {state.run_id}</Pill>}
                  </div>

                  <Segmented<AnalystModeChoice>
                    label="Analyst source"
                    value={analystMode}
                    onChange={setAnalystMode}
                    options={[
                      {
                        id: "auto",
                        label: "Auto",
                        title: "Try live, then use a reviewed stored answer if needed",
                      },
                      { id: "live", label: "Live", title: "Always call Aura Analyst" },
                      {
                        id: "fixture",
                        label: "Stored",
                        title: "Always use reviewed stored answers",
                      },
                    ]}
                  />

                  <div className="flex items-center gap-2">
                    <span className="label">Speed</span>
                    <select
                      className="rounded-[9px] border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-[12px]"
                      value={state?.speed_multiplier ?? 1}
                      disabled={!isAdmin || !state || busyAction !== null}
                      onChange={(event) => void act(() => setSpeed(Number(event.target.value)))}
                    >
                      {speeds.map((speed) => (
                        <option key={speed} value={speed}>
                          {speed}x
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    className="btn"
                    disabled={!isAdmin || !state || busyAction !== null}
                    onClick={() => void act(running ? pause : resume)}
                  >
                    {running ? "Pause stream" : "Resume stream"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {(error || notice || (!isAdmin && controlsOpen)) && (
        <div className="mx-auto max-w-[1480px] px-6 pb-2">
          <div className="flex flex-col gap-1">
            {error && (
              <p role="alert" className="text-[12px] text-[var(--danger)]">
                {error}
              </p>
            )}
            {notice && (
              <p
                role={notice.tone === "bad" ? "alert" : "status"}
                className={`text-[12px] ${
                  notice.tone === "bad" ? "text-[var(--danger)]" : "text-[var(--good)]"
                }`}
              >
                {notice.text}
              </p>
            )}
            {!isAdmin && (
              <p className="text-[11px] text-[var(--ink-muted)]">
                Read-only view. Demo controls require the administrator role.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
