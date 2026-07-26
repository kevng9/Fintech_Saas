import { NextRequest } from "next/server";
import { fail, readJson } from "@/lib/api";
import { runCommand } from "@/lib/control";
import { demoConfig } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await readJson<{ speed?: number }>(req);
  const speed = Number(body.speed);
  if (!Number.isFinite(speed) || !demoConfig.allowedSpeeds.includes(speed)) {
    return fail(
      req,
      400,
      "invalid_speed",
      `Speed must be one of: ${demoConfig.allowedSpeeds.join(", ")}.`
    );
  }
  return runCommand(req, {
    type: "SET_SPEED",
    payload: { speed },
    waitMs: 4_000,
    action: "simulator.speed",
  });
}
