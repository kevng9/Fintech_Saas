"use client";

/**
 * Chrome shared by every page: brand, anchor navigation, the presenter control
 * strip, and the synthetic-data notice that must be visible at all times.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ControlStrip } from "@/components/ControlStrip";
import { useDemoState } from "@/components/DemoStateProvider";
import { FloatingAnalystChat } from "@/components/FloatingAnalystChat";

const FALLBACK_NAV = [{ href: "/anchors/a2", label: "Payment operations" }];

/**
 * The A8 customer-facing view is meant to be embedded inside a banking app,
 * not presented from the stage, so it skips the operator chrome entirely
 * (brand header, anchor nav, control strip) and renders only its own content.
 */
function isEmbeddedCustomerView(pathname: string): boolean {
  return pathname.startsWith("/anchors/a8/customer/");
}

function BrandMark() {
  return (
    <span className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-[11px] bg-[var(--lime)]">
      <span className="absolute h-5 w-5 -translate-x-1.5 rounded-full border-2 border-[var(--navy)]" />
      <span className="absolute h-5 w-5 translate-x-1.5 rounded-full border-2 border-[var(--navy)]" />
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { config, envelope, presentationMode, setPresentationMode } = useDemoState();
  const healthy = envelope?.state.leader_alive && envelope?.state.stream_status === "RUNNING";

  // Presentation mode hides the control strip (where the toggle lives), so the
  // header exit control and Escape are the only reliable ways back out.
  useEffect(() => {
    if (!presentationMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPresentationMode(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [presentationMode, setPresentationMode]);

  if (isEmbeddedCustomerView(pathname)) {
    return <div className="min-h-screen">{children}</div>;
  }

  const nav = config
    ? [
        { href: "/", label: "Overview" },
        ...config.anchors
          .filter((anchor) => anchor.status === "available")
          .map((anchor) => ({ href: `/anchors/${anchor.id}`, label: anchor.name })),
      ]
    : [{ href: "/", label: "Overview" }, ...FALLBACK_NAV];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-white/10 bg-[var(--navy)] text-white">
        <div className="mx-auto flex max-w-[1480px] items-center gap-3 px-4 py-3.5 sm:gap-8 sm:px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="Northstar Payments home">
            <BrandMark />
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold tracking-[-0.02em]">
                Northstar
              </span>
              <span className="block text-[10px] font-medium tracking-[0.08em] text-white/45 uppercase">
                Payments intelligence
              </span>
            </span>
          </Link>

          <nav
            className="scroll-thin hidden items-center gap-1 overflow-x-auto sm:flex"
            aria-label="Primary navigation"
          >
            {nav.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="rounded-[9px] px-3 py-2 text-[13px] font-medium transition-colors"
                  style={{
                    background: active ? "rgba(255,255,255,.1)" : "transparent",
                    color: active ? "#fff" : "rgba(255,255,255,.62)",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            {presentationMode && (
              <button
                type="button"
                onClick={() => setPresentationMode(false)}
                title="Press Esc to exit presentation mode"
                className="rounded-[9px] border border-white/20 bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-white/20"
              >
                Exit presentation
              </button>
            )}
            <Link
              href="/architecture"
              className="hidden rounded-[9px] px-3 py-2 text-[12px] font-medium text-white/55 transition-colors hover:bg-white/10 hover:text-white lg:block"
            >
              Platform
            </Link>
            <Link
              href="/admin"
              className="hidden rounded-[9px] px-3 py-2 text-[12px] font-medium text-white/55 transition-colors hover:bg-white/10 hover:text-white lg:block"
            >
              Admin
            </Link>
            <span className="mx-2 h-5 w-px bg-white/10" />
            <div
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold"
              title={healthy ? "Payment stream is live" : "Payment stream needs attention"}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  background: healthy ? "var(--lime)" : "var(--amber)",
                  boxShadow: healthy ? "0 0 0 3px rgba(199,243,107,.12)" : undefined,
                }}
              />
              {healthy ? "Payments live" : "Demo ready"}
            </div>
          </div>
        </div>
      </header>

      {!presentationMode && <ControlStrip />}

      <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-6 sm:px-6 sm:py-7">
        {children}
      </main>

      <FloatingAnalystChat />

      <footer className="border-t border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-[1480px] flex-col gap-2 px-4 py-4 text-[10px] leading-4 text-[var(--ink-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>
            {config?.app.synthetic_data_notice ??
              "All data is synthetic and contains no payment credentials."}
          </span>
          <span className="shrink-0">Powered by SingleStore · Analyst assists, people decide</span>
        </div>
      </footer>
    </div>
  );
}
