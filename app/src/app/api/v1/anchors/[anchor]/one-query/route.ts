import { NextRequest } from "next/server";
import { describeError, fail, ok } from "@/lib/api";
import { readDemoState } from "@/lib/demoState";
import { runOneQuery } from "@/lib/metrics/a3OneQuery";

export const dynamic = "force-dynamic";

/**
 * Runs the A3 "one query" proof live: vector similarity on investigator
 * notes, JSON reason codes, relational joins, and aggregation in one statement.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ anchor: string }> }
) {
  const { anchor } = await params;
  if (anchor !== "a3") {
    return fail(req, 404, "anchor_unavailable", "The one-query proof is only available for A3.");
  }

  try {
    const state = await readDemoState();
    if (!state) {
      return fail(
        req,
        503,
        "demo_not_initialised",
        "No active demo run. Run the seeder: python -m fintech_demo bootstrap."
      );
    }
    const result = await runOneQuery(req.nextUrl.searchParams.get("case"));
    if (!result) {
      return fail(req, 404, "no_reference_case", "No confirmed fraud case is visible yet.");
    }
    return ok(req, result);
  } catch (error) {
    return fail(req, 503, "query_failed", describeError(error));
  }
}
