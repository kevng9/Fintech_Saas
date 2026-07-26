"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const TABS = [
  { href: "/admin", label: "Health" },
  { href: "/admin/data", label: "Data" },
  { href: "/admin/scenarios", label: "Scenarios" },
  { href: "/admin/domain-check", label: "Domain check" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">Demo administration</h1>
        <p className="mt-1 max-w-[85ch] text-[13px] leading-6 text-[var(--ink-soft)]">
          Pre-flight checks, data inspection, scenario history, and the known-question suite that
          validates an Aura Domain after a context change.
        </p>
      </header>

      <nav className="flex flex-wrap gap-1" aria-label="Administration sections">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className="rounded-[8px] border px-3 py-1.5 text-[12px] font-medium"
              style={{
                background: active ? "var(--accent-soft)" : "var(--surface)",
                borderColor: active ? "#cfc9fb" : "var(--line-strong)",
                color: active ? "var(--accent-dark)" : "var(--ink-soft)",
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
