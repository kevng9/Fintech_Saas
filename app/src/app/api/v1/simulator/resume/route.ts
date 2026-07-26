import { NextRequest } from "next/server";
import { runCommand } from "@/lib/control";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return runCommand(req, { type: "RESUME", waitMs: 4_000, action: "simulator.resume" });
}
