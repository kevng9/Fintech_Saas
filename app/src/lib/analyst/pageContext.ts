/**
 * Page selection shared with Aura Analyst.
 *
 * Analyst has no browser state, so when a presenter asks about "the selected
 * application" we must state the entity id in the outbound question.
 */

export interface AnalystPageContext {
  entityType: string;
  entityId: string;
}

const ENTITY_LABELS: Record<string, string> = {
  application: "application",
  payment: "payment",
  segment: "lane",
  case: "fraud case",
  alert: "AML alert",
  dispute: "dispute",
  position: "liquidity position",
  entity: "liquidity entity",
  category: "spend category",
  cohort: "intent cohort",
  customer: "customer",
};

export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType.replace(/_/g, " ");
}

/** Parse `/anchors/a7/application/CAPP-…` (and A2 segment/payment) routes. */
export function parseAnalystPageContext(pathname: string): AnalystPageContext | null {
  const match = pathname.match(
    /^\/anchors\/a[1-8]\/(application|payment|segment|case|alert|dispute|position|entity|category|cohort|customer)\/([^/?#]+)/i
  );
  if (!match) return null;
  try {
    return {
      entityType: match[1].toLowerCase(),
      entityId: decodeURIComponent(match[2]),
    };
  } catch {
    return {
      entityType: match[1].toLowerCase(),
      entityId: match[2],
    };
  }
}

/**
 * Expand a presenter question with the open entity id. Aura Analyst has no
 * browser selection state, so "the selected application" must name the id.
 */
export function withPageContext(
  message: string,
  context: AnalystPageContext | null | undefined
): string {
  const trimmed = message.trim();
  if (!context || !trimmed) return trimmed;
  if (trimmed.includes(context.entityId)) return trimmed;

  const label = entityLabel(context.entityType);
  return (
    `${trimmed}\n\n` +
    `Context: the currently open ${label} is ${context.entityId}. ` +
    `Use only this ${label} unless the question names a different one.`
  );
}

/** Rewrite curated starters that say "selected …" into id-specific prompts. */
export function contextualizeStarter(
  starter: string,
  context: AnalystPageContext | null | undefined
): string {
  if (!context) return starter;
  const label = entityLabel(context.entityType);
  if (starter.includes(context.entityId)) return starter;
  if (/\bselected\b/i.test(starter) || new RegExp(`\\b${label}\\b`, "i").test(starter)) {
    return starter
      .replace(/\bthe selected application\b/gi, `application ${context.entityId}`)
      .replace(/\bthe selected dispute\b/gi, `dispute ${context.entityId}`)
      .replace(/\bthe selected cohort\b/gi, `${label} ${context.entityId}`)
      .replace(/\bthis application\b/gi, `application ${context.entityId}`)
      .replace(/\bselected application\b/gi, `application ${context.entityId}`);
  }
  return starter;
}
