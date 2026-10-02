import { a1 } from "./a1";
import { a2 } from "./a2";
import { a3 } from "./a3";
import { a4 } from "./a4";
import { a5 } from "./a5";
import { a6 } from "./a6";
import { a7 } from "./a7";
import { a8 } from "./a8";
import type { AnchorDefinition, AnchorSummary } from "./types";

/** Anchor catalog. All eight anchors ship with full A2-style parity. */
export const ANCHORS: AnchorDefinition[] = [a1, a2, a3, a4, a5, a6, a7, a8];

export const ANCHOR_IDS = ANCHORS.map((anchor) => anchor.id);

export function getAnchor(id: string): AnchorDefinition | undefined {
  return ANCHORS.find((anchor) => anchor.id === id);
}

export function requireAvailableAnchor(id: string): AnchorDefinition | undefined {
  const anchor = getAnchor(id);
  return anchor && anchor.status === "available" ? anchor : undefined;
}

export function toSummary(anchor: AnchorDefinition): AnchorSummary {
  return {
    id: anchor.id,
    name: anchor.name,
    jobTitle: anchor.jobTitle,
    businessDecision: anchor.businessDecision,
    criticalBusinessIssue: anchor.criticalBusinessIssue,
    takeaway: anchor.takeaway,
    status: anchor.status,
    estimatedMinutes: anchor.estimatedMinutes,
    primaryScenarioId: anchor.primaryScenarioId,
    starterPrompts: anchor.starterPrompts,
    guardrailText: anchor.guardrailText,
    humanOwnership: anchor.humanOwnership,
  };
}

export type { AnchorDefinition, AnchorId, AnchorSummary } from "./types";
