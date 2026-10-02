"use client";

/**
 * Shared demo state for every page.
 *
 * One poller reads /api/v1/demo/state, so the header strip, scenario drawer and
 * anchor pages always agree on run, logical clock, stream state and state
 * version. Control calls send the state version they were rendered from, so a
 * stale click is rejected instead of silently applied.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ConfigPayload, StateEnvelope } from "@/lib/apiTypes";

const POLL_MS = 5000;

export type AnalystModeChoice = "auto" | "live" | "fixture";
export type PersonaId = "business" | "risk" | "technical";

interface ControlResult {
  ok: boolean;
  status: number;
  message?: string;
  body?: Record<string, unknown>;
}

interface DemoStateContextValue {
  config: ConfigPayload | null;
  envelope: StateEnvelope | null;
  error: string | null;
  busyAction: string | null;
  persona: PersonaId;
  setPersona: (persona: PersonaId) => void;
  analystMode: AnalystModeChoice;
  setAnalystMode: (mode: AnalystModeChoice) => void;
  presentationMode: boolean;
  setPresentationMode: (value: boolean) => void;
  refresh: () => Promise<void>;
  pause: () => Promise<ControlResult>;
  resume: () => Promise<ControlResult>;
  startUpdates: () => Promise<ControlResult>;
  setSpeed: (speed: number) => Promise<ControlResult>;
  reset: () => Promise<ControlResult>;
  inject: (scenarioId: string) => Promise<ControlResult>;
  tabId: string;
}

const DemoStateContext = createContext<DemoStateContextValue | null>(null);

function readStoredTabId(): string {
  if (typeof window === "undefined") return "server";
  const existing = window.sessionStorage.getItem("demo-tab-id");
  if (existing) return existing;
  const created = `tab-${Math.random().toString(36).slice(2, 10)}`;
  window.sessionStorage.setItem("demo-tab-id", created);
  return created;
}

function readStored<T extends string>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  return (window.localStorage.getItem(key) as T) || fallback;
}

export function DemoStateProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ConfigPayload | null>(null);
  const [envelope, setEnvelope] = useState<StateEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [persona, setPersonaState] = useState<PersonaId>("business");
  const [analystMode, setAnalystModeState] = useState<AnalystModeChoice>("auto");
  const [presentationMode, setPresentationModeState] = useState(true);
  // Resolved after mount because it comes from sessionStorage. It is state
  // rather than a ref so that consumers reading it through context, such as the
  // Analyst session scoping on /admin/domain-check, see the real value instead
  // of the server placeholder.
  const [tabId, setTabId] = useState("server");

  useEffect(() => {
    setTabId(readStoredTabId());
    setPersonaState(readStored<PersonaId>("demo-persona", "business"));
    // Start every browser tab on the safest presenter setting. Advanced mode
    // choices remain useful during a session, but must not surprise the next
    // salesperson who opens the demo.
    const storedMode = window.sessionStorage.getItem("demo-analyst-mode") as AnalystModeChoice | null;
    setAnalystModeState(storedMode === "live" || storedMode === "fixture" || storedMode === "auto" ? storedMode : "auto");
    const customerDefaultVersion = "1";
    const defaultApplied = window.localStorage.getItem("demo-customer-default");
    const storedPresentation = window.localStorage.getItem("demo-presentation");
    const nextPresentation =
      defaultApplied === customerDefaultVersion ? storedPresentation !== "0" : true;
    setPresentationModeState(nextPresentation);
    window.localStorage.setItem("demo-presentation", nextPresentation ? "1" : "0");
    window.localStorage.setItem("demo-customer-default", customerDefaultVersion);
  }, []);

  useEffect(() => {
    if (config?.analyst.mode !== "live") return;
    setAnalystModeState("live");
    window.sessionStorage.setItem("demo-analyst-mode", "live");
  }, [config?.analyst.mode]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/demo/state", { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body?.error?.message ?? `Demo state unavailable (${response.status})`);
        return;
      }
      setEnvelope((await response.json()) as StateEnvelope);
      setError(null);
    } catch {
      setError("Cannot reach the demo API.");
    }
  }, []);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const response = await fetch("/api/v1/config", { cache: "no-store" });
        if (!canceled && response.ok) {
          setConfig((await response.json()) as ConfigPayload);
        }
      } catch {
        // The state poller reports connectivity problems; config can wait.
      }
    })();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const call = useCallback(
    async (
      action: string,
      path: string,
      init: RequestInit = {},
      extraHeaders: Record<string, string> = {}
    ): Promise<ControlResult> => {
      setBusyAction(action);
      try {
        const response = await fetch(path, {
          method: "POST",
          ...init,
          headers: {
            "Content-Type": "application/json",
            ...(envelope ? { "x-demo-state-version": String(envelope.state.state_version) } : {}),
            "x-demo-tab-id": tabId,
            ...extraHeaders,
            ...(init.headers as Record<string, string> | undefined),
          },
        });
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        await refresh();
        const errorBody = body.error as { message?: string } | undefined;
        const confirmed = body.status !== "pending";
        return {
          ok: response.ok && confirmed,
          status: response.status,
          message:
            errorBody?.message ??
            (body.message as string | undefined) ??
            (!confirmed ? "The demo is still applying that change. Wait for the status to update." : undefined),
          body,
        };
      } catch {
        return { ok: false, status: 0, message: "Cannot reach the demo API." };
      } finally {
        setBusyAction(null);
      }
    },
    [envelope, refresh, tabId]
  );

  const value = useMemo<DemoStateContextValue>(
    () => ({
      config,
      envelope,
      error,
      busyAction,
      persona,
      setPersona: (next) => {
        setPersonaState(next);
        window.localStorage.setItem("demo-persona", next);
      },
      analystMode,
      setAnalystMode: (next) => {
        if (config?.analyst.mode === "live" && next !== "live") return;
        setAnalystModeState(next);
        window.sessionStorage.setItem("demo-analyst-mode", next);
      },
      presentationMode,
      setPresentationMode: (next) => {
        setPresentationModeState(next);
        window.localStorage.setItem("demo-presentation", next ? "1" : "0");
      },
      refresh,
      pause: () => call("pause", "/api/v1/simulator/pause"),
      resume: () => call("resume", "/api/v1/simulator/resume"),
      startUpdates: () => call("start", "/api/v1/simulator/start"),
      setSpeed: (speed) =>
        call("speed", "/api/v1/simulator/speed", { body: JSON.stringify({ speed }) }),
      reset: () => call("reset", "/api/v1/demo/reset"),
      inject: (scenarioId) =>
        call(
          `inject:${scenarioId}`,
          `/api/v1/scenarios/${encodeURIComponent(scenarioId)}/inject`,
          {},
          { "x-idempotency-key": `${envelope?.state.run_id ?? 0}-${scenarioId}-manual` }
        ),
      tabId,
    }),
    [
      analystMode,
      busyAction,
      call,
      config,
      envelope,
      error,
      persona,
      presentationMode,
      refresh,
      tabId,
    ]
  );

  return <DemoStateContext.Provider value={value}>{children}</DemoStateContext.Provider>;
}

export function useDemoState(): DemoStateContextValue {
  const context = useContext(DemoStateContext);
  if (!context) throw new Error("useDemoState must be used inside DemoStateProvider");
  return context;
}
