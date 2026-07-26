import { NextRequest } from "next/server";
import { clampString, fail, ok, originAllowed, readJson } from "@/lib/api";
import { getOrCreateAppUserId, tabId } from "@/lib/appUser";
import { clearSession } from "@/lib/analyst/sessionStore";

export const dynamic = "force-dynamic";

/** Starts a fresh Analyst conversation for this tab and anchor. */
export async function POST(req: NextRequest) {
  if (!originAllowed(req)) {
    return fail(req, 403, "cross_origin_blocked", "Request origin is not allowed.");
  }
  const body = await readJson<{ anchor?: string }>(req);
  const anchorId = clampString(body.anchor, 8).toLowerCase();
  if (!anchorId) {
    return fail(req, 400, "anchor_required", "Specify which anchor's conversation to reset.");
  }
  const { appUserId } = getOrCreateAppUserId(req);
  clearSession(appUserId, tabId(req), anchorId);
  return ok(req, { anchor_id: anchorId, cleared: true });
}
