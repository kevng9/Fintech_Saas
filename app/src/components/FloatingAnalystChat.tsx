"use client";

/**
 * Persistent Analyst drawer.
 *
 * This component lives in AppShell, above the route tree, so its conversation
 * stays mounted while a presenter moves between an anchor overview and its
 * entity evidence pages. The A8 customer embed intentionally has its own
 * scoped workspace and does not render AppShell chrome.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnalystWorkspace } from "@/components/a2/AnalystWorkspace";
import { useDemoState } from "@/components/DemoStateProvider";
import { parseAnalystPageContext } from "@/lib/analyst/pageContext";

const OPEN_KEY = "demo-analyst-chat-open";
const SIZE_KEY = "demo-analyst-chat-size";

const DEFAULT_WIDTH = 520;
const DEFAULT_HEIGHT = 560;
const MIN_WIDTH = 300;
const MIN_HEIGHT = 360;

type PanelSize = { width: number; height: number };
type ResizeAxis = "both" | "width" | "height";

function getViewportLimits() {
  const isWide = window.innerWidth >= 640;
  const horizontalMargin = isWide ? 48 : 24;
  const bottomOffset = isWide ? 96 + 24 : 80 + 12;

  return {
    maxWidth: Math.max(MIN_WIDTH, window.innerWidth - horizontalMargin),
    maxHeight: Math.max(MIN_HEIGHT, window.innerHeight - bottomOffset),
  };
}

function clampSize(size: Partial<PanelSize>): PanelSize {
  const { maxWidth, maxHeight } = getViewportLimits();
  const width = Math.round(
    Math.min(maxWidth, Math.max(MIN_WIDTH, size.width ?? DEFAULT_WIDTH))
  );
  const height = Math.round(
    Math.min(maxHeight, Math.max(MIN_HEIGHT, size.height ?? DEFAULT_HEIGHT))
  );
  return { width, height };
}

function readStoredSize(): PanelSize {
  try {
    const raw = window.localStorage.getItem(SIZE_KEY);
    if (!raw) return clampSize({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
    const parsed = JSON.parse(raw) as Partial<PanelSize>;
    return clampSize({
      width: typeof parsed.width === "number" ? parsed.width : DEFAULT_WIDTH,
      height: typeof parsed.height === "number" ? parsed.height : DEFAULT_HEIGHT,
    });
  } catch {
    return clampSize({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  }
}

export function FloatingAnalystChat() {
  const pathname = usePathname();
  const { config } = useDemoState();
  const [open, setOpenState] = useState(false);
  const [size, setSize] = useState<PanelSize>({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  });
  const dragRef = useRef<{
    axis: ResizeAxis;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  const anchorId = useMemo(
    () => pathname.match(/^\/anchors\/(a[1-8])(?:\/|$)/)?.[1] ?? null,
    [pathname]
  );
  const pageContext = useMemo(() => parseAnalystPageContext(pathname), [pathname]);
  const anchor = config?.anchors.find((item) => item.id === anchorId) ?? null;

  const persistSize = useCallback((next: PanelSize) => {
    window.localStorage.setItem(
      SIZE_KEY,
      JSON.stringify({ width: next.width, height: next.height })
    );
  }, []);

  useEffect(() => {
    setOpenState(window.localStorage.getItem(OPEN_KEY) === "1");
    setSize(readStoredSize());
  }, []);

  useEffect(() => {
    const onViewportChange = () => {
      setSize((current) => {
        const next = clampSize(current);
        persistSize(next);
        return next;
      });
    };

    window.addEventListener("resize", onViewportChange);
    return () => window.removeEventListener("resize", onViewportChange);
  }, [persistSize]);

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

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      event.preventDefault();

      let nextWidth = drag.startWidth;
      let nextHeight = drag.startHeight;

      if (drag.axis === "both" || drag.axis === "width") {
        nextWidth = drag.startWidth + (drag.startX - event.clientX);
      }
      if (drag.axis === "both" || drag.axis === "height") {
        nextHeight = drag.startHeight + (drag.startY - event.clientY);
      }

      setSize(clampSize({ width: nextWidth, height: nextHeight }));
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.removeProperty("user-select");
      document.body.style.removeProperty("cursor");
      setSize((current) => {
        persistSize(current);
        return current;
      });
      event.preventDefault();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [persistSize]);

  const setOpen = (next: boolean) => {
    setOpenState(next);
    window.localStorage.setItem(OPEN_KEY, next ? "1" : "0");
  };

  const startResize = (axis: ResizeAxis) => (event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      axis,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: size.width,
      startHeight: size.height,
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor =
      axis === "both" ? "nwse-resize" : axis === "width" ? "ew-resize" : "ns-resize";
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  if (!anchorId || !anchor) return null;

  return (
    <>
      <aside
        id="persistent-analyst-chat"
        aria-label={`Aura Analyst for ${anchor.name}`}
        aria-hidden={!open}
        style={{ width: size.width, height: size.height }}
        className={`fixed right-3 bottom-20 z-50 flex flex-col overflow-hidden rounded-[18px] border border-[var(--line-strong)] bg-[var(--surface)] shadow-[0_24px_80px_rgba(7,28,23,.24)] transition-[opacity,transform] duration-200 sm:right-6 sm:bottom-24 ${
          open
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-3 scale-[.98] opacity-0"
        }`}
      >
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize Analyst chat height"
          title="Drag to resize height"
          onPointerDown={startResize("height")}
          className="absolute inset-x-4 top-0 z-20 h-2 cursor-ns-resize touch-none"
        />
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Analyst chat width"
          title="Drag to resize width"
          onPointerDown={startResize("width")}
          className="absolute bottom-0 left-0 top-4 z-20 w-2 cursor-ew-resize touch-none"
        />
        <button
          type="button"
          aria-label="Resize Analyst chat"
          title="Drag to resize"
          onPointerDown={startResize("both")}
          className="absolute left-0 top-0 z-30 flex h-5 w-5 cursor-nwse-resize touch-none items-end justify-end rounded-tl-[18px] p-1 text-[var(--line-strong)] transition-colors hover:text-[var(--navy-soft)]"
        >
          <span
            aria-hidden
            className="block h-2.5 w-2.5 border-l-[2px] border-t-[2px] border-current opacity-70"
          />
        </button>

        <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[var(--navy)] px-4 py-3 text-white">
          <div className="min-w-0 pl-3">
            <p className="text-[13px] font-semibold">Aura Analyst</p>
            <p className="mt-0.5 truncate text-[10px] text-white/55">
              {anchor.name}
              {pageContext ? ` · ${pageContext.entityType} ${pageContext.entityId}` : ""}
            </p>
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
            pageContext={pageContext}
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
