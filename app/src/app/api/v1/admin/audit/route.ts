import { NextRequest } from "next/server";
import { describeError, fail, ok } from "@/lib/api";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Recent control actions: who did what, to which run, at which state version. */
export async function GET(req: NextRequest) {
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT occurred_at, actor_id, actor_role, action, anchor_id, run_id,
              state_version, outcome, detail, request_id
       FROM demo_audit ORDER BY occurred_at DESC LIMIT 50`
    );
    return ok(req, { entries: rows });
  } catch (error) {
    return fail(req, 503, "query_failed", describeError(error));
  }
}
