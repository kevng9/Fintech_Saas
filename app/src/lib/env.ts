/**
 * Server-only environment access.
 *
 * Nothing in this module may be imported from a client component. No value here
 * is ever prefixed NEXT_PUBLIC_, so no Analyst key or database credential can
 * reach the browser bundle. Safe display values are published deliberately by
 * /api/v1/config.
 */

export type AnalystMode = "live" | "fixture" | "auto";

function str(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

function num(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const dbConfig = {
  host: str("DEMO_DB_HOST"),
  port: num("DEMO_DB_PORT", 3306),
  user: str("DEMO_DB_USER"),
  password: str("DEMO_DB_PASSWORD"),
  database: str("DEMO_DB_NAME", "fintech_demo"),
  tls: str("DEMO_DB_SSL", "required") !== "disabled",
};

export function isDbConfigured(): boolean {
  return Boolean(dbConfig.host && dbConfig.user && dbConfig.password);
}

export const demoConfig = {
  seed: num("DEMO_DEFAULT_SEED", 20260725),
  epoch: str("DEMO_DEFAULT_EPOCH", "2026-07-25T09:00:00Z"),
  baselineDays: num("DEMO_BASELINE_DAYS", 7),
  allowedSpeeds: str("DEMO_ALLOWED_SPEEDS", "0.5,1,2,5,20")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0),
  defaultRole: str("DEMO_DEFAULT_ROLE", "presenter"),
  adminToken: str("DEMO_ADMIN_TOKEN"),
};

export const analystConfig = {
  mode: (str("ANALYST_MODE", "auto") as AnalystMode) || "auto",
  orgId: str("ANALYST_ORG_ID"),
  projectId: str("ANALYST_PROJECT_ID"),
  region: str("ANALYST_REGION", "us-east-1"),
  timeoutSeconds: num("ANALYST_TIMEOUT_SECONDS", 90),
  maxRows: num("ANALYST_MAX_ROWS", 500),
  maxMessageChars: num("ANALYST_MAX_MESSAGE_CHARS", 2000),
};

/**
 * Analyst base URL for an anchor. Paths like `/chat`, `/query`, and
 * `/conversation-starters` are appended by the client, so an explicit
 * `ANALYST_A{N}_ENDPOINT` that already ends in one of those suffixes is
 * normalized back to the analyst root.
 */
export function normalizeAnalystBaseUrl(endpoint: string): string {
  return endpoint
    .replace(/\/+$/, "")
    .replace(/\/(chat|query|conversation-starters)$/i, "");
}

/** Domain-scoped credentials, resolved per anchor. Never returned to a client. */
export function analystDomain(anchorId: string): {
  anchorId: string;
  apiKey: string;
  baseUrl: string;
  configured: boolean;
} {
  const upper = anchorId.toUpperCase();
  const apiKey = str(`ANALYST_${upper}_API_KEY`);
  const explicitEndpoint = str(`ANALYST_${upper}_ENDPOINT`);
  const derived =
    analystConfig.orgId && analystConfig.projectId
      ? `https://apps.${analystConfig.region}.cloud.singlestore.com/v1/organizations/${analystConfig.orgId}/projects/${analystConfig.projectId}/analyst`
      : "";
  const baseUrl = normalizeAnalystBaseUrl(explicitEndpoint) || derived;
  return { anchorId, apiKey, baseUrl, configured: Boolean(apiKey && baseUrl) };
}

/** Redacts anything that looks like a credential before it reaches a log or a response. */
export function redact(text: string): string {
  const secrets = [
    dbConfig.password,
    demoConfig.adminToken,
    ...["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]
      .map((anchor) => analystDomain(anchor).apiKey)
      .filter(Boolean),
  ].filter((value) => value && value.length > 3);

  let output = text;
  for (const secret of secrets) {
    output = output.split(secret).join("[redacted]");
  }
  return output
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]")
    .replace(/("?(api[_-]?key|password|authorization)"?\s*[:=]\s*)("[^"]*"|\S+)/gi, "$1[redacted]");
}
