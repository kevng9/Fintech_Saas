/**
 * Browser-side reader for the Analyst chat stream.
 *
 * This module is deliberately self-contained with no imports from the server
 * environment module, so nothing from `env.ts` can be pulled into the client
 * bundle by way of the chat panel.
 *
 * The stream carries two kinds of output-text delta: prose, which is appended
 * character by character, and a complete JSON block describing a table or a
 * chart. Blocks arrive on their own item id, so an item is treated as prose
 * until it parses as a block.
 */

export interface StreamTable {
  columns: string[];
  rows: (string | number | null)[][];
  truncated: boolean;
}

export interface StreamChart {
  data: unknown[];
  layout: Record<string, unknown>;
}

export interface StreamItem {
  id: string;
  kind: "text" | "table" | "chart";
  text: string;
  table: StreamTable | null;
  chart: StreamChart | null;
  sql: string | null;
}

export interface ChatStreamState {
  items: StreamItem[];
  sessionId: string | null;
  done: boolean;
  error: string | null;
}

type Unknown = Record<string, unknown>;

function isRecord(value: unknown): value is Unknown {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function columnNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((column) =>
    typeof column === "string"
      ? column
      : isRecord(column)
        ? String(column.name ?? column.column ?? "column")
        : "column"
  );
}

function cell(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return String(value);
}

const MAX_ROWS = 500;

function toTable(block: Unknown): StreamTable | null {
  const raw = block.table_data ?? block.rows ?? block.data;
  if (!Array.isArray(raw) || !raw.length) return null;

  let columns = columnNames(block.columns ?? block.fields);
  let rows: (string | number | null)[][];

  if (Array.isArray(raw[0])) {
    rows = (raw as unknown[][]).map((row) => row.map(cell));
    if (!columns.length) columns = rows[0].map((_, index) => `column_${index + 1}`);
  } else if (isRecord(raw[0])) {
    if (!columns.length) columns = Object.keys(raw[0] as Unknown);
    rows = (raw as Unknown[]).map((record) => columns.map((column) => cell(record[column])));
  } else {
    return null;
  }

  return {
    columns,
    rows: rows.slice(0, MAX_ROWS),
    truncated: rows.length > MAX_ROWS,
  };
}

function toChart(block: Unknown): StreamChart | null {
  const figure = isRecord(block.figure) ? block.figure : block;
  if (!Array.isArray(figure.data)) return null;
  return { data: figure.data, layout: isRecord(figure.layout) ? figure.layout : {} };
}

function sqlOf(block: Unknown): string | null {
  const query = block.query ?? block.sql;
  if (typeof query === "string" && query.trim()) return query;
  if (isRecord(query)) {
    const command = query.command ?? query.sql ?? query.statement;
    if (typeof command === "string" && command.trim()) return command;
  }
  return null;
}

/**
 * Re-reads an item's accumulated text as a structured block.
 *
 * Blocks arrive in one delta today, but parsing the whole accumulated buffer
 * rather than a single chunk means a block split across deltas still resolves
 * once the final chunk lands.
 */
function classify(item: StreamItem): StreamItem {
  const trimmed = item.text.trim();
  if (!trimmed.startsWith("{")) return item;
  let block: unknown;
  try {
    block = JSON.parse(trimmed);
  } catch {
    return item;
  }
  if (!isRecord(block)) return item;

  if (block.type === "chart") {
    const chart = toChart(block);
    if (chart) return { ...item, kind: "chart", chart, sql: sqlOf(block) };
  }
  if (block.type === "table") {
    const table = toTable(block);
    if (table) return { ...item, kind: "table", table, sql: sqlOf(block) };
  }
  return item;
}

interface SseFrame {
  event: string;
  data: string;
}

function parseFrames(buffer: string): { frames: SseFrame[]; rest: string } {
  const frames: SseFrame[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length) frames.push({ event, data: dataLines.join("\n") });
  }
  return { frames, rest };
}

/**
 * Consumes the SSE body, calling `onUpdate` whenever the rendered answer
 * changes. Returns the final state so a caller can persist the transcript.
 */
export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  onUpdate: (state: ChatStreamState) => void,
  signal?: AbortSignal
): Promise<ChatStreamState> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const state: ChatStreamState = { items: [], sessionId: null, done: false, error: null };
  const byId = new Map<string, number>();
  let buffer = "";

  const emit = () => onUpdate({ ...state, items: [...state.items] });

  const upsert = (itemId: string, delta: string) => {
    const index = byId.get(itemId);
    if (index === undefined) {
      byId.set(itemId, state.items.length);
      state.items.push(
        classify({ id: itemId, kind: "text", text: delta, table: null, chart: null, sql: null })
      );
      return;
    }
    const current = state.items[index];
    state.items[index] = classify({ ...current, text: current.text + delta });
  };

  try {
    for (;;) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { frames, rest } = parseFrames(buffer);
      buffer = rest;
      if (!frames.length) continue;

      for (const frame of frames) {
        if (frame.data === "[DONE]") {
          state.done = true;
          continue;
        }
        let payload: unknown;
        try {
          payload = JSON.parse(frame.data);
        } catch {
          continue;
        }
        if (!isRecord(payload)) continue;

        const sessionId = payload.session_id;
        if (typeof sessionId === "string" && sessionId) state.sessionId = sessionId;

        if (frame.event.endsWith("output_text.delta")) {
          const itemId = String(payload.item_id ?? payload.id ?? "item-0");
          const delta = payload.delta ?? payload.text ?? "";
          if (typeof delta === "string" && delta) upsert(itemId, delta);
        } else if (frame.event.endsWith("output_text.done")) {
          const itemId = String(payload.item_id ?? payload.id ?? "item-0");
          const text = payload.text;
          // A terminal "done" frame carrying the full text is authoritative,
          // because a block that arrived in pieces is only valid JSON here.
          if (typeof text === "string" && text) {
            const index = byId.get(itemId);
            if (index === undefined) upsert(itemId, text);
            else state.items[index] = classify({ ...state.items[index], text });
          }
        } else if (frame.event.endsWith("error") || payload.error) {
          state.error =
            typeof payload.error === "string"
              ? payload.error
              : String((isRecord(payload.error) && payload.error.message) || "Analyst error");
        } else if (frame.event.endsWith("completed") || frame.event.endsWith("response.done")) {
          state.done = true;
        }
      }
      emit();
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : "The answer stream was interrupted.";
  } finally {
    reader.releaseLock();
    state.done = true;
    emit();
  }

  return state;
}
