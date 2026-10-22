/**
 * Launch the local simulator leader when a presenter asks for live updates.
 *
 * The web tier still does not write the clock. This only starts the same
 * `fintech_demo run` process startup uses, then the start route asks that
 * leader to resume the stream.
 */

import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function repoRoot(): string {
  const candidates = [process.cwd(), path.resolve(process.cwd(), "..")];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "simulator", "fintech_demo", "cli.py"))) {
      return candidate;
    }
  }
  throw new Error("Cannot find the simulator package next to the app.");
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function launchSimulator(): { pid: number; alreadyRunning: boolean } {
  const root = repoRoot();
  const runtime = path.join(root, ".demo");
  mkdirSync(runtime, { recursive: true });
  const pidFile = path.join(runtime, "simulator.pid");

  if (existsSync(pidFile)) {
    const existing = Number(readFileSync(pidFile, "utf8").trim());
    if (Number.isInteger(existing) && existing > 0 && pidAlive(existing)) {
      return { pid: existing, alreadyRunning: true };
    }
  }

  const venvPython = path.join(root, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  const python = existsSync(venvPython) ? venvPython : "python3";
  const logFd = openSync(path.join(runtime, "simulator.log"), "a");
  let child;
  try {
    child = spawn(python, ["-m", "fintech_demo", "run"], {
      cwd: path.join(root, "simulator"),
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
  } finally {
    closeSync(logFd);
  }

  if (!child.pid) {
    throw new Error("The simulator process did not start. See .demo/simulator.log.");
  }

  writeFileSync(pidFile, String(child.pid));
  child.unref();
  return { pid: child.pid, alreadyRunning: false };
}
