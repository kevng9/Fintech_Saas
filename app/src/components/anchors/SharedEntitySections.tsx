"use client";

/**
 * Renders the free-form `sections` list on a `SharedEntityPayload`.
 *
 * Entity detail pages differ a lot across anchors (a fraud case's evidence
 * list looks nothing like a liquidity entity's cash ladder), so instead of a
 * bespoke component per anchor, each metrics module describes its own
 * sections as `fields` (key/value), `table` (columns/rows), or `timeline`
 * (chronological rows), and this component knows how to draw all three.
 */

import { Card } from "@/components/ui";
import { formatMetric } from "@/lib/format";
import type { SharedColumn, SharedEntitySection } from "@/lib/apiTypes";

function renderCell(value: unknown, format?: SharedColumn["format"]): string {
  if (format && format !== "text") {
    return formatMetric(value === null || value === undefined ? null : Number(value), format);
  }
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function FieldsSection({ fields }: { fields: { label: string; value: string; mono?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] sm:grid-cols-3">
      {fields.map((field) => (
        <div key={field.label}>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">{field.label}</dt>
          <dd className={field.mono ? "mono" : undefined}>{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TableSection({ columns, rows }: { columns: SharedColumn[]; rows: Record<string, unknown>[] }) {
  if (!rows.length) {
    return <p className="py-4 text-[12px] text-[var(--ink-muted)]">No rows to show.</p>;
  }
  return (
    <div className="scroll-thin max-h-[420px] overflow-auto">
      <table className="grid">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.format && column.format !== "text" ? "num" : undefined}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column.key} className={column.format && column.format !== "text" ? "num mono" : undefined}>
                  {renderCell(row[column.key], column.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SharedEntitySections({ sections }: { sections: SharedEntitySection[] }) {
  return (
    <div className="grid gap-4">
      {sections.map((section, index) => (
        <Card key={`${section.title}-${index}`} title={section.title} subtitle={section.subtitle}>
          {section.kind === "fields" && section.fields && <FieldsSection fields={section.fields} />}
          {(section.kind === "table" || section.kind === "timeline") && section.columns && section.rows && (
            <TableSection columns={section.columns} rows={section.rows} />
          )}
        </Card>
      ))}
    </div>
  );
}
