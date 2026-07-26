/**
 * Demo control plane, read and write.
 *
 * The web tier never mutates the logical clock or the stream state directly.
 * It reads ``demo_active_run`` and enqueues commands in ``demo_command``; the
 * elected simulator leader applies them. That keeps one writer behind pause,
 * speed, injection and reset no matter how many web instances are running.
 */

import { query, queryOne } from "./db";

export type StreamStatus = "PREPARING" | "PAUSED" | "RUNNING" | "RESETTING" | "FAILED";
export type CommandType = "PAUSE" | "RESUME" | "SET_SPEED" | "INJECT" | "RESET";

export interface DemoRunInfo {
  run_id: number;
  seed: number;
  fixture_version: string;
  status: string;
  logical_epoch: string;
  baseline_from: string;
  baseline_checksum: string;
  row_counts: string | Record<string, number>;
}

export interface DemoState {
  runId: number;
  logicalTime: string;
  streamStatus: StreamStatus;
  speedMultiplier: number;
  sequenceNo: number;
  minuteCursor: number;
  analystMode: string;
  stateVersion: number;
  leaderId: string | null;
  leaderAgeSeconds: number | null;
  leaderAlive: boolean;
  updatedAt: string;
  run: DemoRunInfo | null;
}

export interface CommandRecord {
  command_id: string;
  command_type: string;
  status: "queued" | "claimed" | "complete" | "failed";
  result: string | null;
  error_text: string | null;
  created_at: string;
  completed_at: string | null;
}

const LEADER_GRACE_SECONDS = 15;

export async function readDemoState(): Promise<DemoState | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT ar.*, TIMESTAMPDIFF(SECOND, ar.leader_heartbeat_at, NOW(6)) AS leader_age_seconds
     FROM demo_active_run ar WHERE ar.singleton_id = 1`
  );
  if (!row) return null;
  const run = await queryOne<DemoRunInfo>("SELECT * FROM demo_run WHERE run_id = ?", [
    row.run_id,
  ]);
  const leaderAge = row.leader_age_seconds === null ? null : Number(row.leader_age_seconds);
  return {
    runId: Number(row.run_id),
    logicalTime: String(row.logical_time),
    streamStatus: String(row.stream_status) as StreamStatus,
    speedMultiplier: Number(row.speed_multiplier),
    sequenceNo: Number(row.sequence_no),
    minuteCursor: Number(row.minute_cursor),
    analystMode: String(row.analyst_mode),
    stateVersion: Number(row.state_version),
    leaderId: row.leader_id ? String(row.leader_id) : null,
    leaderAgeSeconds: leaderAge,
    leaderAlive: leaderAge !== null && leaderAge < LEADER_GRACE_SECONDS,
    updatedAt: String(row.updated_at),
    run: run ?? null,
  };
}

export async function enqueueCommand(options: {
  type: CommandType;
  payload?: Record<string, unknown>;
  actorId: string;
  role: string;
  expectedStateVersion: number | null;
  runId: number;
}): Promise<string> {
  const commandId = crypto.randomUUID();
  await query(
    `INSERT INTO demo_command (
       command_id, run_id, command_type, payload, status,
       expected_state_version, requested_by, requested_role, created_at
     ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, NOW(6))`,
    [
      commandId,
      options.runId,
      options.type,
      JSON.stringify(options.payload ?? {}),
      options.expectedStateVersion,
      options.actorId,
      options.role,
    ]
  );
  return commandId;
}

export async function waitForCommand(
  commandId: string,
  timeoutMs: number
): Promise<CommandRecord | null> {
  const deadline = Date.now() + timeoutMs;
  let last: CommandRecord | null = null;
  while (Date.now() < deadline) {
    last = await queryOne<CommandRecord>(
      "SELECT command_id, command_type, status, result, error_text, created_at, completed_at " +
        "FROM demo_command WHERE command_id = ?",
      [commandId]
    );
    if (last && (last.status === "complete" || last.status === "failed")) return last;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return last;
}

export interface ScenarioRecord {
  scenario_id: string;
  anchor_id: string;
  name: string;
  description: string;
  metric_window: string;
  expected_deltas: string | Record<string, unknown>;
  enabled: number;
}

export async function listScenarios(anchorId?: string): Promise<ScenarioRecord[]> {
  if (anchorId) {
    return query<ScenarioRecord>(
      "SELECT * FROM demo_scenario WHERE anchor_id = ? ORDER BY scenario_id",
      [anchorId]
    );
  }
  return query<ScenarioRecord>("SELECT * FROM demo_scenario ORDER BY scenario_id");
}

export interface ExecutionRecord {
  scenario_id: string;
  execution_id: string;
  status: string;
  requested_at: string;
  completed_at: string | null;
  window_start: string | null;
  window_end: string | null;
  rows_inserted: string | null;
}

export async function listExecutions(runId: number): Promise<ExecutionRecord[]> {
  return query<ExecutionRecord>(
    `SELECT scenario_id, execution_id, status, requested_at, completed_at,
            window_start, window_end, rows_inserted
     FROM demo_scenario_execution WHERE run_id = ? ORDER BY requested_at DESC`,
    [runId]
  );
}

export async function latestExecution(
  runId: number,
  scenarioId: string
): Promise<ExecutionRecord | null> {
  return queryOne<ExecutionRecord>(
    `SELECT scenario_id, execution_id, status, requested_at, completed_at,
            window_start, window_end, rows_inserted
     FROM demo_scenario_execution
     WHERE run_id = ? AND scenario_id = ? AND status = 'complete'
     ORDER BY completed_at DESC LIMIT 1`,
    [runId, scenarioId]
  );
}

export function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}
