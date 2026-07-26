import { NextRequest } from "next/server";
import { describeError, fail, ok } from "@/lib/api";
import { requireAvailableAnchor } from "@/lib/anchors";
import { readDemoState } from "@/lib/demoState";
import { paymentDetail, segmentDetail } from "@/lib/metrics/a2";
import { buildEntity } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/**
 * Entity detail behind a drill-down. A2 exposes payment lanes (processor,
 * network, issuer country) and individual synthetic authorization attempts.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ anchor: string; entityType: string; entityId: string }> }
) {
  const { anchor: anchorId, entityType, entityId } = await params;
  const anchor = requireAvailableAnchor(anchorId);
  if (!anchor) {
    return fail(req, 404, "anchor_unavailable", `Anchor ${anchorId.toUpperCase()} is not available.`);
  }
  if (!anchor.entityTypes.includes(entityType)) {
    return fail(
      req,
      404,
      "entity_type_unknown",
      `Anchor ${anchorId.toUpperCase()} has no entity type "${entityType}".`
    );
  }

  const windowMinutes = Number(req.nextUrl.searchParams.get("window") ?? 60);
  const span = Number.isInteger(windowMinutes) && windowMinutes > 0 ? windowMinutes : 60;

  try {
    const state = await readDemoState();
    if (!state) {
      return fail(req, 503, "demo_not_initialised", "No active demo run.");
    }

    if (anchorId === "a2") {
      if (entityType === "segment") {
        const detail = await segmentDetail(entityId, span);
        if (!detail) {
          return fail(req, 404, "entity_not_found", `No lane matches "${entityId}".`);
        }
        return ok(req, { entity_type: entityType, window_minutes: span, segment: detail });
      }

      const payment = await paymentDetail(decodeURIComponent(entityId));
      if (!payment) {
        return fail(req, 404, "entity_not_found", `No authorization attempt matches that id.`);
      }
      return ok(req, { entity_type: entityType, payment });
    }

    const data = await buildEntity(anchorId, entityType, entityId);
    if (!data) {
      return fail(req, 404, "entity_not_found", `No ${entityType} matches "${entityId}".`);
    }
    return ok(req, { ...data, window_minutes: span });
  } catch (error) {
    return fail(req, 503, "query_failed", describeError(error));
  }
}
