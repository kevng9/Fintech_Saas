import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness only: the process is up. No dependency is touched. */
export async function GET() {
  return NextResponse.json({ status: "ok", checked_at: new Date().toISOString() });
}
