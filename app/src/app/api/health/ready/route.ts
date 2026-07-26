import { NextResponse } from "next/server";
import { pingDatabase } from "@/lib/db";
import { readDemoState } from "@/lib/demoState";

export const dynamic = "force-dynamic";

/** Readiness: the app can serve dashboards, which needs SingleStore and a run. */
export async function GET() {
  const database = await pingDatabase();
  let activeRun = false;
  let streamStatus: string | null = null;
  if (database.ok) {
    const state = await readDemoState().catch(() => null);
    activeRun = Boolean(state && state.run?.status !== "template");
    streamStatus = state?.streamStatus ?? null;
  }
  const ready = database.ok && activeRun;
  return NextResponse.json(
    {
      status: ready ? "ready" : "not_ready",
      database,
      active_run: activeRun,
      stream_status: streamStatus,
      checked_at: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 }
  );
}
