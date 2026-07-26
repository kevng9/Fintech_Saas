import { NextRequest } from "next/server";
import { describeError, ok } from "@/lib/api";
import { getAnchor } from "@/lib/anchors";
import { conversationStarters, isAnchorConfigured } from "@/lib/analyst/client";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";

interface StarterShape {
  starters?: unknown;
  conversation_starters?: unknown;
  data?: unknown;
}

/**
 * Suggested questions. The curated anchor prompts are always returned so the
 * panel is useful even when Aura is unreachable; live starters are added when
 * available.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ anchor: string }> }
) {
  const { anchor: anchorId } = await params;
  const anchor = getAnchor(anchorId);
  if (!anchor) {
    return fail(req, 404, "anchor_unavailable", `Unknown anchor ${anchorId}.`);
  }

  const curated = anchor.starterPrompts;
  if (!isAnchorConfigured(anchorId)) {
    return ok(req, { anchor_id: anchorId, source: "curated", curated, live: [] });
  }

  try {
    const raw = await conversationStarters(anchorId);
    const payload = (raw.payload ?? {}) as StarterShape;
    const candidates =
      payload.starters ?? payload.conversation_starters ?? payload.data ?? raw.payload;
    const live = Array.isArray(candidates)
      ? candidates
          .map((item) =>
            typeof item === "string"
              ? item
              : String((item as Record<string, unknown>)?.prompt ?? (item as Record<string, unknown>)?.question ?? "")
          )
          .filter(Boolean)
          .slice(0, 8)
      : [];
    return ok(req, { anchor_id: anchorId, source: "live", curated, live });
  } catch (error) {
    return ok(req, {
      anchor_id: anchorId,
      source: "curated",
      curated,
      live: [],
      degraded_reason: describeError(error),
    });
  }
}
