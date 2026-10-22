"use client";

/** Small presentational primitives shared across the demo pages. */

import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  actions,
  footnote,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footnote?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card flex flex-col ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[14px] font-semibold leading-5 tracking-[-0.015em]">{title}</h2>
            )}
            {subtitle && (
              <p className="mt-1 text-[11px] leading-4 text-[var(--ink-muted)]">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="flex-1 px-5 pt-3 pb-4">{children}</div>
      {footnote && (
        <footer className="border-t border-[var(--line)] px-5 py-2.5 text-[10px] leading-4 text-[var(--ink-muted)]">
          {footnote}
        </footer>
      )}
    </section>
  );
}

export type Tone = "neutral" | "good" | "warn" | "bad" | "accent";

const TONE_STYLE: Record<Tone, { color: string; background: string; border: string }> = {
  neutral: { color: "var(--ink-soft)", background: "var(--surface-raised)", border: "var(--line)" },
  good: { color: "var(--good)", background: "var(--good-soft)", border: "#bfe4cf" },
  warn: { color: "var(--amber)", background: "#fdf5e6", border: "#eddcb4" },
  bad: { color: "var(--danger)", background: "var(--danger-soft)", border: "#f0c3ca" },
  accent: { color: "var(--accent-dark)", background: "var(--accent-soft)", border: "#bde5d6" },
};

export function Pill({
  tone = "neutral",
  children,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
}) {
  const style = TONE_STYLE[tone];
  return (
    <span
      className="pill"
      title={title}
      style={{ color: style.color, background: style.background, borderColor: style.border }}
    >
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: Tone }) {
  return (
    <span
      aria-hidden
      className="inline-block h-[7px] w-[7px] rounded-full"
      style={{ background: TONE_STYLE[tone].color }}
    />
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="px-1 py-6 text-center text-[12px] leading-5 text-[var(--ink-muted)]">
      {children}
    </p>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-3 animate-pulse rounded"
          style={{ background: "var(--surface-sunk)", width: `${100 - index * 12}%` }}
        />
      ))}
    </div>
  );
}

export function Banner({ tone, children }: { tone: Tone; children: ReactNode }) {
  const style = TONE_STYLE[tone];
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className="rounded-[12px] border px-4 py-3 text-[12px] leading-5"
      style={{ color: style.color, background: style.background, borderColor: style.border }}
    >
      {children}
    </div>
  );
}

/** Explains where a number came from, so a technical viewer can trust it. */
export function ProvenanceNote({
  proofMode,
  sourceTables,
  expected,
}: {
  proofMode: string;
  sourceTables: string[];
  expected?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={proofMode === "deterministic" ? "accent" : "neutral"}>{proofMode}</Pill>
        <span className="mono text-[11px] text-[var(--ink-muted)]">{sourceTables.join(", ")}</span>
      </div>
      {expected && <p>Expected: {expected}</p>}
    </div>
  );
}
