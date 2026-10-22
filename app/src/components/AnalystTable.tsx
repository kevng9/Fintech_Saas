"use client";

import { analystColumnIsNumeric, count, formatAnalystCell } from "@/lib/format";

/** Result grid for Analyst answers, with numeric columns right-aligned. */
export function AnalystTable({
  columns,
  rows,
  truncated,
  maxHeight = 320,
}: {
  columns: string[];
  rows: (string | number | null)[][];
  truncated?: boolean;
  maxHeight?: number;
}) {
  if (!columns.length || !rows.length) {
    return <p className="py-3 text-[12px] text-[var(--ink-muted)]">No rows returned.</p>;
  }

  const numericColumn = columns.map((column, index) =>
    analystColumnIsNumeric(
      column,
      rows.map((row) => row[index] ?? null)
    )
  );

  return (
    <div className="space-y-1">
      <div className="scroll-thin overflow-auto rounded-[8px] border border-[var(--line)]" style={{ maxHeight }}>
        <table className="grid">
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={`${column}-${index}`} className={numericColumn[index] ? "num" : ""}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((value, columnIndex) => (
                  <td key={columnIndex} className={numericColumn[columnIndex] ? "num mono" : ""}>
                    {formatAnalystCell(value, columns[columnIndex] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[var(--ink-muted)]">
        {count(rows.length)} rows{truncated ? " (truncated by the demo row cap)" : ""}
      </p>
    </div>
  );
}
