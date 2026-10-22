/**
 * Server-sent event helpers.
 *
 * Fixture answers are replayed as the same event sequence the live chat
 * endpoint produces, so the chat panel has exactly one rendering path and a
 * fallback cannot introduce a second, less-tested code path mid-demo.
 */

import type { AnalystResult } from "./types";

const encoder = new TextEncoder();

export function sseEvent(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function chunkText(text: string, size = 90): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks.length ? chunks : [""];
}

export interface FixtureReplayOptions {
  sessionId: string;
  results: AnalystResult[];
  fixtureId: string;
  recordedAt: string;
  delayMs?: number;
}

export function fixtureStream(options: FixtureReplayOptions): ReadableStream<Uint8Array> {
  const delay = options.delayMs ?? 18;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const pause = () => new Promise((resolve) => setTimeout(resolve, delay));
      controller.enqueue(
        sseEvent("response.created", {
          session_id: options.sessionId,
          source: "fixture",
          fixture_id: options.fixtureId,
          recorded_at: options.recordedAt,
        })
      );

      let itemIndex = 0;
      for (const result of options.results) {
        if (result.text) {
          const itemId = `fixture-text-${itemIndex++}`;
          for (const chunk of chunkText(result.text)) {
            controller.enqueue(
              sseEvent("response.output_text.delta", { item_id: itemId, delta: chunk })
            );
            await pause();
          }
        }
        if (result.table) {
          const itemId = `fixture-table-${itemIndex++}`;
          const block = JSON.stringify({
            type: "table",
            columns: result.table.columns.map((name) => ({ name })),
            table_data: result.table.rows,
            ...(result.sql ? { query: result.sql.command } : {}),
          });
          controller.enqueue(
            sseEvent("response.output_text.delta", { item_id: itemId, delta: block })
          );
          await pause();
        }
        if (result.chart) {
          const itemId = `fixture-chart-${itemIndex++}`;
          const block = JSON.stringify({
            type: "chart",
            figure: { data: result.chart.data, layout: result.chart.layout },
            ...(result.sql ? { query: result.sql.command } : {}),
          });
          controller.enqueue(
            sseEvent("response.output_text.delta", { item_id: itemId, delta: block })
          );
          await pause();
        }
      }

      controller.enqueue(sseEvent("response.completed", { session_id: options.sessionId }));
      controller.close();
    },
  });
}

/**
 * Wraps an upstream chat stream so the app can observe the session id without
 * buffering the answer: the stream is forwarded to the browser untouched.
 */
export function tapSessionId(
  upstream: ReadableStream<Uint8Array>,
  onSessionId: (sessionId: string) => void
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let seen = "";
  let captured = false;
  return upstream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        if (captured) return;
        seen += decoder.decode(chunk, { stream: true });
        const match = seen.match(/"session_id"\s*:\s*"([^"]+)"/);
        if (match) {
          captured = true;
          onSessionId(match[1]);
        }
        if (seen.length > 20000) seen = seen.slice(-2000);
      },
    })
  );
}
