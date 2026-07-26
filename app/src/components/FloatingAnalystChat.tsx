"use client";

/**
 * Persistent Analyst drawer.
 *
 * This component lives in AppShell, above the route tree, so its conversation
 * stays mounted while a presenter moves between an anchor overview and its
 * entity evidence pages. The A8 customer embed intentionally has its own
 * scoped workspace and does not render AppShell chrome.
 */

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { AnalystWorkspace } from "@/components/a2/AnalystWorkspace";
import { useDemoState } from "@/components/DemoStateProvider";

const OPEN_KEY = "demo-analyst-chat-open";

export function FloatingAnalystChat() {
  const pathname = usePathname();
  const { config } = useDemoState();
  const [open, setOpenState] = useState(false);

  const anchorId = useMemo(
    () => pathname.match(/^\/anchors\/(a[1-8])(?:\/|$)/)?.[1] ?? null,
    [pathname]
  );
  const anchor = config?.anchors.find((item) => item.id === anchorId) ?? null;

  useEffect(() => {
    setOpenState(window.localStorage.getItem(OPEN_KEY) === "1");
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpenState(false);
      window.localStorage.setItem(OPEN_KEY, "0");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const setOpen = (next: boolean) => {
    setOpenState(next);
    window.localStorage.setItem(OPEN_KEY, next ? "1" : "0");
  };

  if (!anchorId || !anchor) return null;

  return (
    <>
      <aside
        id="persistent-analyst-chat"
        aria-label={`Aura Analyst for ${anchor.name}`}
        aria-hidden={!open}
        className={`fixed right-3 bottom-20 z-50 flex max-h-[min(760px,calc(100vh-7rem))] w-[min(520px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[18px] border border-[var(--line-strong)] bg-[var(--surface)] shadow-[0_24px_80px_rgba(7,28,23,.24)] transition-all duration-200 sm:right-6 sm:bottom-24 ${
          open
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-3 scale-[.98] opacity-0"
        }`}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[var(--navy)] px-4 py-3 text-white">
          <div>
            <p className="text-[13px] font-semibold">Aura Analyst</p>
            <p className="mt-0.5 text-[10px] text-white/55">{anchor.name}</p>
          </div>
          <button
            type="button"
            aria-label="Close Analyst chat"
            title="Close chat (Esc)"
            onClick={() => setOpen(false)}
            className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-white/10 text-lg leading-none transition-colors hover:bg-white/20"
          >
            ×
          </button>
        </header>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
          <AnalystWorkspace
            anchorId={anchorId}
            guardrailText={anchor.guardrailText}
            humanOwnership={anchor.humanOwnership}
          />
        </div>
      </aside>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="persistent-analyst-chat"
        className="fixed right-3 bottom-3 z-50 flex items-center gap-2 rounded-full border border-white/10 bg-[var(--navy)] px-4 py-3 text-[12px] font-semibold text-white shadow-[0_12px_32px_rgba(7,28,23,.28)] transition-transform hover:-translate-y-0.5 hover:bg-[#153f36] sm:right-6 sm:bottom-6"
      >
        <span aria-hidden className="text-[16px]">
          ✦
        </span>
        {open ? "Hide Analyst" : "Ask Analyst"}
      </button>
    </>
  );
}
