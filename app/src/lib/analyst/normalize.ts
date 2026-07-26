/**
 * Adapter between the Aura Analyst Preview response shape and the internal
 * model the UI renders.
 *
 * The Preview API may change field names or nesting. Everything defensive
 * lives here: pages and components never read a raw upstream field, so an
 * upstream change is a change to this one file.
 */

import { analystConfig } from "../env";
import type { AnalystResult, AnalystSqlInfo, AnalystTable } from "./types";

type Unknown = Record<string, unknown>;

function asRecord(value: unknown): Unknown | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Unknown) : null;
}

function firstString(source: Unknown, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function normalizeSql(value: unknown): AnalystSqlInfo | null {
  if (typeof value === "string" && value.trim()) {
    return { command: value, confidence_score: null, tables_used: [] };
  }
  const record = asRecord(value);
  if (!record) return null;
  const command = firstString(record, ["command", "sql", "query", "statement"]);
  if (!command) return null;
  const confidence = record.confidence_score ?? record.confidence;
  const tables = record.tables_used ?? record.tables;
  return {
    command,
    confidence_score: typeof confidence === "number" ? confidence : null,
    tables_used: Array.isArray(tables) ? tables.map((table) => String(table)) : [],
  };
}

function normalizeColumns(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((column) => {
    if (typeof column === "string") return column;
    const record = asRecord(column);
    return record ? String(record.name ?? record.column ?? "column") : "column";
  });
}

export function normalizeTable(value: unknown): AnalystTable | null {
  const record = asRecord(value);
  if (!record) {
    if (Array.isArray(value) && value.length && asRecord(value[0])) {
      const columns = Object.keys(asRecord(value[0]) as Unknown);
      const rows = (value as Unknown[]).map((item) => columns.map((column) => cell(item[column])));
      return capTable({ columns, rows, row_count: rows.length, truncated: false });
    }
    return null;
  }

  const columns = normalizeColumns(record.columns ?? record.fields ?? record.schema);
  const rawRows = record.rows ?? record.table_data ?? record.data ?? record.records;

  if (Array.isArray(rawRows) && rawRows.length && Array.isArray(rawRows[0])) {
    const rows = (rawRows as unknown[][]).map((row) => row.map(cell));
    return capTable({
      columns: columns.length ? columns : rows[0].map((_, index) => `column_${index + 1}`),
      rows,
      row_count: Number(record.row_count ?? rows.length),
      truncated: false,
    });
  }

  if (Array.isArray(rawRows) && rawRows.length && asRecord(rawRows[0])) {
    const objectColumns = columns.length
      ? columns
      : Object.keys(asRecord(rawRows[0]) as Unknown);
    const rows = (rawRows as Unknown[]).map((item) =>
      objectColumns.map((column) => cell(item[column]))
    );
    return capTable({
      columns: objectColumns,
      rows,
      row_count: Number(record.row_count ?? rows.length),
      truncated: false,
    });
  }

  return null;
}

function cell(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return String(value);
}

function capTable(table: AnalystTable): AnalystTable {
  if (table.rows.length <= analystConfig.maxRows) return table;
  return {
    ...table,
    rows: table.rows.slice(0, analystConfig.maxRows),
    truncated: true,
  };
}

function normalizeChart(value: unknown): AnalystResult["chart"] {
  const record = asRecord(value);
  if (!record) return null;
  const figure = asRecord(record.figure) ?? record;
  const data = figure.data;
  if (!Array.isArray(data)) return null;
  return { data, layout: asRecord(figure.layout) ?? {} };
}

function normalizeResult(value: unknown): AnalystResult | null {
  const record = asRecord(value);
  if (!record) return null;
  const table = normalizeTable(record.table ?? record.data ?? record.result);
  const chart = normalizeChart(record.chart ?? record.figure);
  const text = firstString(record, ["text", "summary", "message", "answer", "content"]);
  const sql = normalizeSql(record.sql ?? record.query);
  const error = firstString(record, ["error", "error_message"]);
  if (!table && !chart && !text && !sql && !error) return null;
  return { text, sql, table, chart, error };
}

/** Turn any observed /query payload shape into the internal result list. */
export function normalizeQueryResponse(payload: unknown): AnalystResult[] {
  const record = asRecord(payload);
  const candidates: unknown[] =
    (Array.isArray(payload) && payload) ||
    (record && Array.isArray(record.results) && record.results) ||
    (record && Array.isArray(record.output) && record.output) ||
    (record ? [record] : []);

  const results = candidates
    .map(normalizeResult)
    .filter((result): result is AnalystResult => result !== null);

  if (results.length) return results;
  return [
    {
      text: "Aura Analyst returned a response this build does not recognise.",
      sql: null,
      table: null,
      chart: null,
      error: "unrecognised_response_shape",
    },
  ];
}

/**
 * Parses the JSON blocks the chat stream emits inside output text items:
 * ``{"type":"table","columns":[{"name":...}],"table_data":[[...]],"query":"..."}``
 */
export function parseChatBlock(block: Unknown): Partial<AnalystResult> {
  if (block.type === "chart" && block.figure) {
    return {
      chart: normalizeChart(block),
      sql: normalizeSql(block.query),
    };
  }
  if (block.type === "table" && (block.table_data || block.rows)) {
    return {
      table: normalizeTable(block),
      sql: normalizeSql(block.query),
    };
  }
  return {};
}
