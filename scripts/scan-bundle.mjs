#!/usr/bin/env node
/**
 * Secret scanner for the built client bundle.
 *
 * Every credential in this demo is meant to stay on the server. The only way to
 * be sure a refactor has not leaked one into a client component is to read the
 * files the browser actually downloads, so this reads `app/.next` after a build
 * and fails on any hit.
 *
 *   node scripts/scan-bundle.mjs
 */

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const BUILD_DIR = path.join(REPO_ROOT, "app", ".next");
const ENV_FILE = path.join(REPO_ROOT, "app", ".env.local");

/** Environment variables whose *values* must never reach the browser. */
const SECRET_VARS = [
  "DEMO_DB_PASSWORD",
  "DEMO_DB_USER",
  "DEMO_DB_HOST",
  "DEMO_ADMIN_TOKEN",
  "ANALYST_A2_API_KEY",
  "ANALYST_ORG_ID",
  "ANALYST_PROJECT_ID",
];

/**
 * Patterns that indicate a secret regardless of the local .env contents.
 *
 * These deliberately do not match a bare variable *name*: the admin pages tell
 * an operator which variable to set, and that help text is worth having. What
 * must never appear is a value, or client code reading one.
 */
const PATTERNS = [
  { name: "SingleStore service hostname", regex: /svc-[0-9a-f-]{16,}[\w.-]*\.singlestore\.com/i },
  {
    name: "client-side read of a server secret",
    regex:
      /process\.env\.(?:DEMO_DB_PASSWORD|DEMO_DB_USER|DEMO_DB_HOST|DEMO_ADMIN_TOKEN|ANALYST_ORG_ID|ANALYST_PROJECT_ID|ANALYST_[A-Z0-9_]*API_KEY)/,
  },
  {
    // Restricted to token-shaped values: vendor bundles contain URL templates
    // such as `api_key=` followed by punctuation, which is not a credential.
    name: "credential assigned to a literal",
    regex: /(?:API_KEY|APIKEY|PASSWORD|ADMIN_TOKEN|SECRET)["']?\s*[:=]\s*["'][A-Za-z0-9_\-.]{16,}["']/i,
  },
  { name: "bearer credential literal", regex: /Bearer\s+[A-Za-z0-9_\-.]{24,}/ },
  { name: "authorization header literal", regex: /[Aa]uthorization["']?\s*:\s*["'][^"'$]{20,}["']/ },
];

const SCANNED_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".json", ".html", ".txt", ".map"]);

// Static chunks are what the browser downloads, so they get the full check.
// Server output is scanned too, but only for literal credential values: it is
// allowed to reference secret variable *names*.
const SCAN_DIRS = [path.join(BUILD_DIR, "static"), path.join(BUILD_DIR, "server", "app")];

async function loadEnvValues() {
  const values = new Map();
  let contents = "";
  try {
    contents = await readFile(ENV_FILE, "utf8");
  } catch {
    return values;
  }
  for (const line of contents.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, name, rawValue] = match;
    const value = rawValue.replace(/^["']|["']$/g, "").trim();
    // Short values produce false positives; a real credential is never this short.
    if (SECRET_VARS.includes(name) && value.length >= 8) values.set(name, value);
  }
  return values;
}

async function* walk(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (SCANNED_EXTENSIONS.has(path.extname(entry.name))) yield full;
  }
}

function isClientAsset(file) {
  const relative = path.relative(BUILD_DIR, file);
  // Server route handlers are compiled under .next/server; they may hold secret
  // *names*, never values, so they are checked only against literal values.
  return !relative.startsWith("server");
}

async function main() {
  try {
    await stat(BUILD_DIR);
  } catch {
    console.error(`No build found at ${path.relative(REPO_ROOT, BUILD_DIR)}. Run: npm run build`);
    return 1;
  }

  const envValues = await loadEnvValues();
  const findings = [];
  let scanned = 0;

  for (const directory of SCAN_DIRS) {
    for await (const file of walk(directory)) {
      scanned += 1;
      const contents = await readFile(file, "utf8");
      const relative = path.relative(REPO_ROOT, file);

      for (const [name, value] of envValues) {
        if (contents.includes(value)) {
          findings.push(`${relative}: contains the value of ${name}`);
        }
      }

      if (!isClientAsset(file)) continue;
      for (const pattern of PATTERNS) {
        const match = contents.match(pattern.regex);
        if (match) {
          findings.push(`${relative}: ${pattern.name} (${match[0].slice(0, 48)})`);
        }
      }
    }
  }

  console.log(`scanned ${scanned} built files`);
  console.log(
    envValues.size
      ? `checked literal values for: ${[...envValues.keys()].join(", ")}`
      : "no app/.env.local values available; pattern checks only"
  );

  if (findings.length) {
    console.error(`\n${findings.length} potential leak(s):`);
    for (const finding of findings) console.error(`  ${finding}`);
    return 1;
  }
  console.log("no secrets found in the client bundle");
  return 0;
}

process.exitCode = await main();
