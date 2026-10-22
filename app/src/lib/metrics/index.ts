/**
 * Metrics registry for A1 and A3-A8.
 *
 * A2 keeps its own richer widget payload and is dispatched directly by the
 * overview and entity routes (`lib/metrics/a2.ts`). Every other anchor
 * returns the shared `SharedOverviewData` / `SharedEntityData` shape defined
 * in `lib/apiTypes.ts`, so one page and one entity viewer render all of them.
 */

import type { SharedEntityData, SharedOverviewData } from "../apiTypes";
import * as a1 from "./a1";
import * as a3 from "./a3";
import * as a4 from "./a4";
import * as a5 from "./a5";
import * as a6 from "./a6";
import * as a7 from "./a7";
import * as a8 from "./a8";

type OverviewFn = (windowMinutes: number) => Promise<SharedOverviewData>;
type EntityFn = (entityType: string, entityId: string) => Promise<SharedEntityData | null>;
type WatermarkFn = () => Promise<{ last_event_time: string | null; events: number }>;

interface AnchorMetricsModule {
  overview: OverviewFn;
  entity: EntityFn;
  watermark: WatermarkFn;
}

const REGISTRY: Record<string, AnchorMetricsModule> = {
  a1,
  a3,
  a4,
  a5,
  a6,
  a7,
  a8,
};

export function hasSharedMetrics(anchorId: string): boolean {
  return anchorId in REGISTRY;
}

export async function buildOverview(
  anchorId: string,
  windowMinutes: number
): Promise<SharedOverviewData | null> {
  const anchorModule = REGISTRY[anchorId];
  if (!anchorModule) return null;
  return anchorModule.overview(windowMinutes);
}

export async function buildEntity(
  anchorId: string,
  entityType: string,
  entityId: string
): Promise<SharedEntityData | null> {
  const anchorModule = REGISTRY[anchorId];
  if (!anchorModule) return null;
  return anchorModule.entity(entityType, entityId);
}

export async function buildWatermark(
  anchorId: string
): Promise<{ last_event_time: string | null; events: number } | null> {
  const anchorModule = REGISTRY[anchorId];
  if (!anchorModule) return null;
  return anchorModule.watermark();
}
