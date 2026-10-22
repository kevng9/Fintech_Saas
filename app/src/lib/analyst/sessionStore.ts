/**
 * Analyst conversation sessions, owned by the app.
 *
 * A session is scoped to browser user, browser tab, anchor and demo run.
 * Switching anchor starts a new session so context cannot leak between
 * Domains, and a reset invalidates every session because the run identifier
 * changes (spec sections 7.4 and 9.3).
 */

interface SessionEntry {
  sessionId: string;
  runId: number;
  createdAt: number;
  turns: number;
}

const sessions = new Map<string, SessionEntry>();
const MAX_AGE_MS = 1000 * 60 * 60 * 4;

function key(appUserId: string, tabId: string, anchorId: string): string {
  return `${appUserId}::${tabId}::${anchorId}`;
}

export function getSession(
  appUserId: string,
  tabId: string,
  anchorId: string,
  runId: number
): SessionEntry | null {
  const entry = sessions.get(key(appUserId, tabId, anchorId));
  if (!entry) return null;
  const stale = Date.now() - entry.createdAt > MAX_AGE_MS;
  if (entry.runId !== runId || stale) {
    sessions.delete(key(appUserId, tabId, anchorId));
    return null;
  }
  return entry;
}

export function rememberSession(
  appUserId: string,
  tabId: string,
  anchorId: string,
  runId: number,
  sessionId: string
): void {
  const existing = sessions.get(key(appUserId, tabId, anchorId));
  sessions.set(key(appUserId, tabId, anchorId), {
    sessionId,
    runId,
    createdAt: existing?.runId === runId ? existing.createdAt : Date.now(),
    turns: existing?.runId === runId ? existing.turns + 1 : 1,
  });
}

export function clearSession(appUserId: string, tabId: string, anchorId: string): void {
  sessions.delete(key(appUserId, tabId, anchorId));
}

export function sessionCount(): number {
  return sessions.size;
}
