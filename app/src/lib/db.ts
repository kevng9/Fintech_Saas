/**
 * SingleStore access for deterministic widget queries and demo control state.
 *
 * Dashboard pages never depend on a model call: every KPI, chart and evidence
 * table on an anchor page is served by SQL from this module.
 */

import type { Pool, RowDataPacket } from "mysql2/promise";
import { dbConfig, isDbConfigured } from "./env";

let pool: Pool | null = null;

async function getPool(): Promise<Pool> {
  if (pool) return pool;
  if (!isDbConfigured()) {
    throw new DatabaseUnavailableError("SingleStore connection is not configured.");
  }
  const mysql = await import("mysql2/promise");
  pool = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    connectionLimit: 8,
    waitForConnections: true,
    // Logical time is timezone-naive by design. Reading DATETIME as a string
    // keeps the demo clock exactly as the simulator wrote it.
    dateStrings: true,
    decimalNumbers: true,
    ...(dbConfig.tls ? { ssl: { minVersion: "TLSv1.2" } } : {}),
  });
  return pool;
}

export class DatabaseUnavailableError extends Error {}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const activePool = await getPool();
  const [rows] = await activePool.query<RowDataPacket[]>(sql, params);
  return rows as unknown as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length ? rows[0] : null;
}

export async function execute(sql: string, params: unknown[] = []): Promise<number> {
  const activePool = await getPool();
  const [result] = await activePool.query(sql, params);
  return (result as { affectedRows?: number }).affectedRows ?? 0;
}

export async function pingDatabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = Date.now();
  try {
    await query("SELECT 1 AS ok");
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "unknown database error",
    };
  }
}
