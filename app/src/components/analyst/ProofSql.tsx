"use client";

import { useState } from "react";
import { capabilitiesInSql, segmentSql, SQL_JOBS } from "@/lib/analyst/sqlProof";

/** The two active-data properties this fraud result actually demonstrates. */
export function ActiveDataProperties() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-[10px] bg-[var(--surface-sunk)] px-3 py-2">
        <p className="label">Composability</p>
        <p className="mt-1 text-[11px] leading-4 text-[var(--ink-soft)]">
          The question was not predefined. It joins live cases with historical notes, reason codes,
          and outcomes.
        </p>
      </div>
      <div className="rounded-[10px] bg-[var(--surface-sunk)] px-3 py-2">
        <p className="label">Consistency</p>
        <p className="mt-1 text-[11px] leading-4 text-[var(--ink-soft)]">
          Each answer reads one logical time. The page is not waiting on a replica to catch up.
        </p>
      </div>
    </div>
  );
}

/** Generated SQL with the six workloads marked. The statement text is unchanged. */
export function ProofSql({ sql }: { sql: string }) {
  const [open, setOpen] = useState(true);
  const capabilities = capabilitiesInSql(sql);
  const segments = segmentSql(sql);

  return (
    <div className="mt-2">
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? "Hide generated SQL" : "Show generated SQL"}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <ActiveDataProperties />
          <div className="flex flex-wrap gap-1.5">
            {capabilities.map((job) => (
              <span
                key={job}
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: SQL_JOBS[job].tint, color: SQL_JOBS[job].color }}
              >
                {SQL_JOBS[job].label}
              </span>
            ))}
          </div>
          <p className="text-[11px] leading-4 text-[var(--ink-muted)]">
            The notes were embedded when the cases were loaded. This statement compares those stored
            vectors. It does not create them.
          </p>
          <pre className="scroll-thin mono mt-2 max-h-80 overflow-auto rounded-[8px] border border-[var(--line)] bg-[var(--surface-sunk)] p-3 text-[11px] leading-5">
            {segments.map((segment, index) =>
              segment.job ? (
                <mark
                  key={index}
                  title={`${SQL_JOBS[segment.job].label}: usually ${SQL_JOBS[segment.job].usually}`}
                  className="rounded-[3px] px-0.5"
                  style={{ background: SQL_JOBS[segment.job].tint, color: SQL_JOBS[segment.job].color }}
                >
                  {segment.text}
                </mark>
              ) : (
                <span key={index}>{segment.text}</span>
              )
            )}
          </pre>
        </div>
      )}
    </div>
  );
}
