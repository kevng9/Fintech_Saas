"use client";

/**
 * Generic driver/ranking panel for the shared overview payload.
 *
 * Renders as signed bars when there is exactly one numeric column (a ranking
 * by magnitude of change, e.g. A8's spend-by-category), otherwise falls back
 * to a plain table so multi-column driver rows (A4's alert backlog by queue,
 * say) are not squeezed into a bar's single value.
 */

import Link from "next/link";
import { formatMetric } from "@/lib/format";
import type { SharedDriversPayload } from "@/lib/apiTypes";

export function SharedDrivers({ data, anchorId }: { data: SharedDriversPayload; anchorId: string }) {
  if (!data.rows.length) {
    return <p className="py-4 text-[12px] text-[var(--ink-muted)]">No activity in this window.</p>;
  }

  const numericColumns = data.columns.filter((column) => column.format !== "text");
  const useBars = numericColumns.length === 1 && data.linkLabelKey;

  if (useBars) {
    const valueColumn = numericColumns[0];
    const magnitude = Math.max(
      ...data.rows.map((row) => Math.abs(Number(row[valueColumn.key] ?? 0))),
      0.001
    );
    return (
      <ul className="space-y-1.5">
        {data.rows.map((row, index) => {
          const value = Number(row[valueColumn.key] ?? 0);
          const share = Math.min(Math.abs(value) / magnitude, 1) * 50;
          const negative = value < 0;
          const label = String(row[data.linkLabelKey!] ?? "");
          const key = data.entityKey ? String(row[data.entityKey]) : String(index);
          const content = (
            <>
              <div className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className="mono truncate">{label}</span>
                <span
                  className="shrink-0 tabular-nums"
                  style={{ color: negative ? "var(--danger)" : "var(--good)" }}
                >
                  {formatMetric(value, valueColumn.format ?? "count")}
                </span>
              </div>
              <div className="relative mt-1 h-[6px] rounded-full bg-[var(--surface-sunk)]">
                <span className="absolute left-1/2 top-[-2px] h-[10px] w-px bg-[var(--line-strong)]" />
                <span
                  className="absolute top-0 h-[6px] rounded-full"
                  style={{
                    background: negative ? "var(--danger)" : "var(--good)",
                    width: `${share}%`,
                    left: negative ? `${50 - share}%` : "50%",
                  }}
                />
              </div>
            </>
          );
          return (
            <li key={key}>
              {data.entityType ? (
                <Link
                  href={`/anchors/${anchorId}/${data.entityType}/${encodeURIComponent(key)}`}
                  className="block w-full rounded-[6px] px-1.5 py-1 text-left transition-colors hover:bg-[var(--accent-soft)]"
                >
                  {content}
                </Link>
              ) : (
                <div className="w-full rounded-[6px] px-1.5 py-1 text-left">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="scroll-thin max-h-[420px] overflow-auto">
      <table className="grid">
        <thead>
          <tr>
            {data.columns.map((column) => (
              <th key={column.key} className={column.format && column.format !== "text" ? "num" : undefined}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, index) => {
            const key = data.entityKey ? String(row[data.entityKey]) : String(index);
            return (
              <tr key={key}>
                {data.columns.map((column) => {
                  const raw = row[column.key];
                  const isLinkCell = data.entityType && column.key === data.linkLabelKey;
                  const value =
                    column.format && column.format !== "text"
                      ? formatMetric(raw === null || raw === undefined ? null : Number(raw), column.format)
                      : String(raw ?? "—");
                  return (
                    <td
                      key={column.key}
                      className={column.format && column.format !== "text" ? "num mono" : undefined}
                    >
                      {isLinkCell ? (
                        <Link
                          href={`/anchors/${anchorId}/${data.entityType}/${encodeURIComponent(key)}`}
                          className="font-medium text-[var(--accent-dark)] hover:underline"
                        >
                          {value}
                        </Link>
                      ) : (
                        value
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
