import { NextRequest } from "next/server";
import { describeError, fail, ok } from "@/lib/api";
import { query } from "@/lib/db";
import { parseJsonColumn, readDemoState } from "@/lib/demoState";
import { dataWatermark } from "@/lib/metrics/a2";

export const dynamic = "force-dynamic";

const COUNTED_TABLES = [
  "payment_event",
  "dim_customer",
  "dim_account",
  "dim_merchant",
  "dim_processor",
] as const;

/** Data inspector: what is in the active run right now, and where it came from. */
export async function GET(req: NextRequest) {
  try {
    const state = await readDemoState();
    if (!state) {
      return fail(req, 503, "demo_not_initialised", "No active demo run.");
    }

    const counts: Record<string, number> = {};
    for (const table of COUNTED_TABLES) {
      const rows = await query<{ rows_total: number }>(
        `SELECT COUNT(*) AS rows_total FROM ${table} WHERE run_id = ?`,
        [state.runId]
      );
      counts[table] = Number(rows[0]?.rows_total ?? 0);
    }

    const [watermark, events, scenarioRows, recent] = await Promise.all([
      dataWatermark(),
      query<Record<string, unknown>>(
        `SELECT sequence_no, anchor_id, event_type, logical_event_time, source_scenario, payload
         FROM demo_event_log WHERE run_id = ? ORDER BY sequence_no DESC LIMIT 20`,
        [state.runId]
      ),
      query<{ scenario_id: string; rows_total: number }>(
        `SELECT scenario_id, COUNT(*) AS rows_total FROM payment_event
         WHERE run_id = ? AND scenario_id IS NOT NULL GROUP BY scenario_id`,
        [state.runId]
      ),
      query<Record<string, unknown>>(
        `SELECT payment_id, event_time, processor_id, card_network, issuer_country,
                response_code, approved, latency_ms, scenario_id
         FROM aa_payment_event_sample ORDER BY event_time DESC LIMIT 25`
      ),
    ]);

    return ok(req, {
      run: {
        run_id: state.runId,
        seed: state.run?.seed ?? null,
        fixture_version: state.run?.fixture_version ?? null,
        logical_epoch: state.run?.logical_epoch ?? null,
        baseline_from: state.run?.baseline_from ?? null,
        baseline_checksum: state.run?.baseline_checksum ?? null,
        recorded_row_counts: parseJsonColumn<Record<string, number>>(state.run?.row_counts, {}),
      },
      clock: {
        logical_time: state.logicalTime,
        stream_status: state.streamStatus,
        speed_multiplier: state.speedMultiplier,
        minute_cursor: state.minuteCursor,
      },
      live_row_counts: counts,
      watermark,
      scenario_rows: scenarioRows,
      recent_events: events.map((event) => ({
        ...event,
        payload: parseJsonColumn<Record<string, unknown>>(event.payload, {}),
      })),
      recent_payments: recent,
    });
  } catch (error) {
    return fail(req, 503, "query_failed", describeError(error));
  }
}
