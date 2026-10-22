"use client";

import Link from "next/link";
import { formatMetric } from "@/lib/format";
import type { SharedTablePayload } from "@/lib/apiTypes";

/** Read-only table; optionally drills from a label cell into an entity page. */
export function SharedTable({
  data,
  anchorId,
}: {
  data: SharedTablePayload;
  anchorId?: string;
}) {
  if (!data.rows.length) {
    return <p className="py-4 text-[12px] text-[var(--ink-muted)]">No rows in this window.</p>;
  }

  const canLink = Boolean(anchorId && data.entityType && data.entityKey && data.linkLabelKey);

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
                  const isLinkCell = canLink && column.key === data.linkLabelKey;
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
