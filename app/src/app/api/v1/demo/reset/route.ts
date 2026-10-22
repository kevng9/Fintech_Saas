import { NextRequest } from "next/server";
import { runCommand } from "@/lib/control";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Global reset. The simulator clones the verified template run, checks its
 * checksum, and switches the active-run pointer in one transaction. Analyst
 * sessions are keyed by run id, so they are invalidated by the new run.
 */
export async function POST(req: NextRequest) {
  return runCommand(req, { type: "RESET", waitMs: 90_000, action: "demo.reset" });
}
