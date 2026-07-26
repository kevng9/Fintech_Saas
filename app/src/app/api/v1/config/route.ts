import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { applyAppUserCookie } from "@/lib/appUser";
import { ANCHORS, toSummary } from "@/lib/anchors";
import { isAnchorConfigured } from "@/lib/analyst/client";
import { analystConfig, demoConfig } from "@/lib/env";
import { isOpenDemo, resolveActor } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** Safe display configuration for the browser. No secret is ever included. */
export async function GET(req: NextRequest) {
  const actor = resolveActor(req);
  const anchors = ANCHORS.map((anchor) => ({
    ...toSummary(anchor),
    analyst_configured: isAnchorConfigured(anchor.id),
    widget_count: anchor.overviewWidgets.length,
  }));

  const response = ok(req, {
    app: {
      name: "Fintech Aura Analyst Demo",
      synthetic_data_notice:
        "All data in this demo is synthetic. It contains no customer, account, or payment credential data.",
    },
    role: actor.role,
    open_demo: isOpenDemo(),
    personas: [
      { id: "business", label: "Business", emphasis: "Outcome, time saved, decision quality" },
      { id: "risk", label: "Risk and compliance", emphasis: "Boundaries, evidence, human ownership" },
      { id: "technical", label: "Technical", emphasis: "Architecture, latency, governance, SQL" },
    ],
    analyst: {
      mode: analystConfig.mode,
      timeout_seconds: analystConfig.timeoutSeconds,
      max_rows: analystConfig.maxRows,
      max_message_chars: analystConfig.maxMessageChars,
    },
    simulator: {
      allowed_speeds: demoConfig.allowedSpeeds,
      speed_note: "1x emits one logical minute of events per second.",
    },
    fixture: {
      seed: demoConfig.seed,
      epoch: demoConfig.epoch,
      baseline_days: demoConfig.baselineDays,
    },
    anchors,
  });
  return applyAppUserCookie(response, actor.setCookie, actor.actorId);
}
