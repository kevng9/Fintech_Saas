/**
 * Reviewed fixture responses.
 *
 * Fixtures are recorded, human-reviewed Analyst answers stored under
 * ``fixtures/analyst/<anchor>/``. They are the demo's fallback when Aura is
 * unavailable, and they render through exactly the same components as a live
 * answer. The UI always labels a fixture answer as a stored response.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { AnalystResult } from "./types";

export interface FixtureRecord {
  id: string;
  anchor: string;
  prompt: string;
  match: string[];
  recorded_at: string;
  fixture_version: string;
  scenario_state: "baseline" | "after_injection" | "any";
  latency_ms: number;
  results: AnalystResult[];
}

const cache = new Map<string, FixtureRecord[]>();

function fixtureRoot(): string {
  return process.env.DEMO_FIXTURE_DIR
    ? path.resolve(process.env.DEMO_FIXTURE_DIR)
    : path.resolve(process.cwd(), "..", "fixtures", "analyst");
}

export async function loadFixtures(anchorId: string): Promise<FixtureRecord[]> {
  const cached = cache.get(anchorId);
  if (cached && process.env.NODE_ENV === "production") return cached;

  const directory = path.join(fixtureRoot(), anchorId);
  let files: string[] = [];
  try {
    files = (await readdir(directory)).filter((name) => name.endsWith(".json"));
  } catch {
    cache.set(anchorId, []);
    return [];
  }

  const records: FixtureRecord[] = [];
  for (const file of files) {
    try {
      const raw = await readFile(path.join(directory, file), "utf8");
      records.push(JSON.parse(raw) as FixtureRecord);
    } catch {
      // A malformed fixture must never break the demo: skip it and keep going.
    }
  }
  cache.set(anchorId, records);
  return records;
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2)
  );
}

function score(question: string, fixture: FixtureRecord): number {
  const asked = tokens(question);
  const target = tokens([fixture.prompt, ...fixture.match].join(" "));
  if (!asked.size || !target.size) return 0;
  let hits = 0;
  for (const token of asked) if (target.has(token)) hits += 1;
  return hits / asked.size;
}

export async function findFixture(
  anchorId: string,
  question: string,
  scenarioState: "baseline" | "after_injection"
): Promise<FixtureRecord | null> {
  const fixtures = await loadFixtures(anchorId);
  if (!fixtures.length) return null;

  const eligible = fixtures.filter(
    (fixture) => fixture.scenario_state === scenarioState || fixture.scenario_state === "any"
  );
  const pool = eligible.length ? eligible : fixtures;

  const exact = pool.find(
    (fixture) => fixture.prompt.trim().toLowerCase() === question.trim().toLowerCase()
  );
  if (exact) return exact;

  let best: { fixture: FixtureRecord; value: number } | null = null;
  for (const fixture of pool) {
    const value = score(question, fixture);
    if (!best || value > best.value) best = { fixture, value };
  }
  return best && best.value >= 0.34 ? best.fixture : null;
}

export function fixtureUnavailableResult(question: string): AnalystResult[] {
  return [
    {
      text:
        "No reviewed stored answer covers that question, and Aura Analyst is not " +
        "reachable right now. The dashboard numbers on this page are live from " +
        "SingleStore and do not depend on Analyst. Try one of the suggested " +
        "questions, or switch back to live mode once connectivity returns.",
      sql: null,
      table: null,
      chart: null,
      error: `no_fixture_for_question:${question.slice(0, 60)}`,
    },
  ];
}
