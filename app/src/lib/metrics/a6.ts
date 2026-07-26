/**
 * Deterministic A6 Liquidity Command Center queries.
 *
 * Positions and forecasts can be denominated in any synthetic currency, so
 * every aggregate reads the *_usd columns (database/migrations/010_a6_liquidity.sql).
 * Funding, release, and transfer decisions stay with treasury.
 */

import { query } from "../db";
import type {
  SharedChangePayload,
  SharedEntityData,
  SharedOverviewData,
} from "../apiTypes";
import { buildChangePayload, scenarioExecution, scenarioExpectedDeltas } from "./shared";

interface LiquidityPositionRow {
  entity_id: string;
  entity_name: string;
  account_id: string;
  currency: string;
  as_of_time: string;
  available_balance_usd: number;
  expected_inbound_settlements_usd: number;
  expected_outbound_settlements_usd: number;
  queued_payments_usd: number;
  available_liquidity_24h_usd: number;
}

async function positions(): Promise<LiquidityPositionRow[]> {
  return query<LiquidityPositionRow>(
    `SELECT entity_id, entity_name, account_id, currency, as_of_time, available_balance_usd,
            expected_inbound_settlements_usd, expected_outbound_settlements_usd,
            queued_payments_usd, available_liquidity_24h_usd
     FROM aa_liquidity_position
     ORDER BY available_liquidity_24h_usd ASC`
  );
}

interface FundingWindowRow {
  queued_payment_id: string;
  entity_id: string;
  entity_name: string;
  currency: string;
  amount_usd: number;
  due_at: string;
  minutes_until_due: number;
}

async function fundingWindow(limit = 20): Promise<FundingWindowRow[]> {
  return query<FundingWindowRow>(
    `SELECT queued_payment_id, entity_id, entity_name, currency, amount_usd, due_at, minutes_until_due
     FROM aa_funding_window
     WHERE in_next_funding_window = 1
     ORDER BY minutes_until_due ASC
     LIMIT ${Math.max(1, Math.min(Math.trunc(limit), 200))}`
  );
}

export async function overview(): Promise<SharedOverviewData> {
  const [positionRows, funding] = await Promise.all([positions(), fundingWindow(20)]);

  const totalLiquidity = positionRows.reduce(
    (sum, row) => sum + Number(row.available_liquidity_24h_usd),
    0
  );
  const totalQueued = positionRows.reduce((sum, row) => sum + Number(row.queued_payments_usd), 0);
  const totalInbound = positionRows.reduce(
    (sum, row) => sum + Number(row.expected_inbound_settlements_usd),
    0
  );
  const totalOutbound = positionRows.reduce(
    (sum, row) => sum + Number(row.expected_outbound_settlements_usd),
    0
  );
  const fundingValue = funding.reduce((sum, row) => sum + Number(row.amount_usd), 0);

  const kpis: SharedOverviewData["kpis"] = [
    {
      id: "available_liquidity_24h_usd",
      title: "Available 24-hour liquidity",
      subtitle: "Across every entity and currency, normalised to USD",
      value: totalLiquidity,
      baseline: null,
      delta: null,
      format: "currency",
      higherIsBetter: true,
    },
    {
      id: "queued_payments_usd",
      title: "Queued outbound payments",
      value: totalQueued,
      baseline: null,
      delta: null,
      format: "currency",
      higherIsBetter: false,
    },
    {
      id: "net_expected_settlement_usd",
      title: "Net expected settlement",
      subtitle: "Expected inbound minus expected outbound",
      value: totalInbound - totalOutbound,
      baseline: null,
      delta: null,
      format: "currency",
    },
    {
      id: "funding_window_value_usd",
      title: "Due in next funding window",
      subtitle: "Queued payments due within 24 hours",
      value: fundingValue,
      baseline: null,
      delta: null,
      format: "currency",
      higherIsBetter: false,
      detail: `${funding.length} payments`,
    },
  ];

  const drivers: SharedOverviewData["drivers"] = {
    title: "Liquidity position by entity and currency",
    subtitle: "Ranked by tightest available liquidity first",
    entityType: "entity",
    entityKey: "entity_id",
    linkLabelKey: "entity_name",
    columns: [
      { key: "entity_name", label: "Entity" },
      { key: "currency", label: "Currency" },
      { key: "available_balance_usd", label: "Available balance", format: "currency" },
      { key: "expected_inbound_settlements_usd", label: "Expected inbound", format: "currency" },
      { key: "expected_outbound_settlements_usd", label: "Expected outbound", format: "currency" },
      { key: "queued_payments_usd", label: "Queued payments", format: "currency" },
      { key: "available_liquidity_24h_usd", label: "24h liquidity", format: "currency" },
    ],
    rows: positionRows.map((row) => ({
      entity_id: row.entity_id,
      entity_name: row.entity_name,
      currency: row.currency,
      available_balance_usd: Number(row.available_balance_usd),
      expected_inbound_settlements_usd: Number(row.expected_inbound_settlements_usd),
      expected_outbound_settlements_usd: Number(row.expected_outbound_settlements_usd),
      queued_payments_usd: Number(row.queued_payments_usd),
      available_liquidity_24h_usd: Number(row.available_liquidity_24h_usd),
    })),
  };

  const tables: SharedOverviewData["tables"] = {
    title: "Queued payments due in the next funding window",
    subtitle: "Next 24 logical hours, soonest first",
    columns: [
      { key: "queued_payment_id", label: "Payment" },
      { key: "entity_name", label: "Entity" },
      { key: "currency", label: "Currency" },
      { key: "amount_usd", label: "Amount", format: "currency" },
      { key: "due_at", label: "Due" },
      { key: "minutes_until_due", label: "Minutes until due", format: "count" },
    ],
    rows: funding.map((row) => ({
      queued_payment_id: row.queued_payment_id,
      entity_name: row.entity_name,
      currency: row.currency,
      amount_usd: Number(row.amount_usd),
      due_at: row.due_at,
      minutes_until_due: Number(row.minutes_until_due),
    })),
  };

  return {
    kpis,
    series: null,
    drivers,
    change: await change(),
    tables,
    meta: {},
  };
}

async function change(): Promise<SharedChangePayload | null> {
  const scenarioId = "A6_SETTLEMENT_DELAY";
  const state = await query<{ run_id: number }>(
    "SELECT run_id FROM demo_active_run WHERE singleton_id = 1"
  );
  const runId = state[0]?.run_id;
  if (!runId) return null;
  const execution = await scenarioExecution(runId, scenarioId);
  if (!execution?.window_start || !execution?.window_end) return null;

  const expected = await scenarioExpectedDeltas(scenarioId);
  const segment = (expected.segment as Record<string, string> | undefined) ?? {};
  const label = segment.entity_id ?? "Treasury entity";

  const positionRows = await positions();
  const totalLiquidity = positionRows.reduce(
    (sum, row) => sum + Number(row.available_liquidity_24h_usd),
    0
  );

  return buildChangePayload({
    scenarioId,
    execution,
    expected,
    segmentLabel: String(label),
    specs: [
      { label: "Projected 24-hour liquidity", key: "available_liquidity_24h_usd", format: "currency" },
      { label: "Settlement at risk", key: "settlement_at_risk_usd", format: "currency" },
    ],
    before: { available_liquidity_24h_usd: null, settlement_at_risk_usd: null },
    after: {
      available_liquidity_24h_usd: totalLiquidity,
      settlement_at_risk_usd: null,
    },
  });
}

export async function entity(
  entityType: string,
  entityId: string
): Promise<SharedEntityData | null> {
  if (entityType !== "entity") return null;
  const id = decodeURIComponent(entityId);

  const positionRows = await query<LiquidityPositionRow>(
    `SELECT entity_id, entity_name, account_id, currency, as_of_time, available_balance_usd,
            expected_inbound_settlements_usd, expected_outbound_settlements_usd,
            queued_payments_usd, available_liquidity_24h_usd
     FROM aa_liquidity_position
     WHERE entity_id = ?
     ORDER BY currency`,
    [id]
  );
  if (!positionRows.length) return null;

  const variance = await query<{
    bucket_time: string;
    currency: string;
    forecast_net_flow_usd: number;
    actual_net_flow_usd: number;
    forecast_variance_usd: number;
  }>(
    `SELECT bucket_time, currency, forecast_net_flow_usd, actual_net_flow_usd, forecast_variance_usd
     FROM aa_liquidity_variance
     WHERE entity_id = ?
     ORDER BY bucket_time DESC
     LIMIT 48`,
    [id]
  );

  const funding = await query<FundingWindowRow>(
    `SELECT queued_payment_id, entity_id, entity_name, currency, amount_usd, due_at, minutes_until_due
     FROM aa_funding_window
     WHERE entity_id = ?
     ORDER BY minutes_until_due ASC
     LIMIT 50`,
    [id]
  );

  const totalLiquidity = positionRows.reduce(
    (sum, row) => sum + Number(row.available_liquidity_24h_usd),
    0
  );

  return {
    entity_type: "entity",
    entity_id: id,
    header: {
      title: positionRows[0].entity_name,
      subtitle: `${positionRows.length} currency position(s) as of ${positionRows[0].as_of_time}`,
    },
    metrics: [
      {
        id: "available_liquidity_24h_usd",
        title: "Available 24-hour liquidity",
        value: totalLiquidity,
        baseline: null,
        delta: null,
        format: "currency",
      },
    ],
    sections: [
      {
        kind: "table",
        title: "Position by currency",
        columns: [
          { key: "currency", label: "Currency" },
          { key: "available_balance_usd", label: "Available balance", format: "currency" },
          { key: "expected_inbound_settlements_usd", label: "Expected inbound", format: "currency" },
          { key: "expected_outbound_settlements_usd", label: "Expected outbound", format: "currency" },
          { key: "queued_payments_usd", label: "Queued", format: "currency" },
          { key: "available_liquidity_24h_usd", label: "24h liquidity", format: "currency" },
        ],
        rows: positionRows.map((row) => ({
          currency: row.currency,
          available_balance_usd: Number(row.available_balance_usd),
          expected_inbound_settlements_usd: Number(row.expected_inbound_settlements_usd),
          expected_outbound_settlements_usd: Number(row.expected_outbound_settlements_usd),
          queued_payments_usd: Number(row.queued_payments_usd),
          available_liquidity_24h_usd: Number(row.available_liquidity_24h_usd),
        })),
      },
      {
        kind: "table",
        title: "Forecast vs. actual cash flow",
        subtitle: "Most recent 48 logical hours",
        columns: [
          { key: "bucket_time", label: "Hour" },
          { key: "currency", label: "Currency" },
          { key: "forecast_net_flow_usd", label: "Forecast net flow", format: "currency" },
          { key: "actual_net_flow_usd", label: "Actual net flow", format: "currency" },
          { key: "forecast_variance_usd", label: "Variance", format: "currency" },
        ],
        rows: variance.map((row) => ({
          bucket_time: row.bucket_time,
          currency: row.currency,
          forecast_net_flow_usd: Number(row.forecast_net_flow_usd),
          actual_net_flow_usd: Number(row.actual_net_flow_usd),
          forecast_variance_usd: Number(row.forecast_variance_usd),
        })),
      },
      {
        kind: "table",
        title: "Queued payments",
        columns: [
          { key: "queued_payment_id", label: "Payment" },
          { key: "currency", label: "Currency" },
          { key: "amount_usd", label: "Amount", format: "currency" },
          { key: "due_at", label: "Due" },
          { key: "minutes_until_due", label: "Minutes until due", format: "count" },
        ],
        rows: funding.map((row) => ({
          queued_payment_id: row.queued_payment_id,
          currency: row.currency,
          amount_usd: Number(row.amount_usd),
          due_at: row.due_at,
          minutes_until_due: Number(row.minutes_until_due),
        })),
      },
    ],
  };
}

export async function watermark(): Promise<{ last_event_time: string | null; events: number }> {
  const rows = await query<{ last_event_time: string | null; events: number }>(
    `SELECT MAX(cp.snapshot_time) AS last_event_time, COUNT(*) AS events
     FROM cash_position_snapshot cp
     JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = cp.run_id`
  );
  return rows[0] ?? { last_event_time: null, events: 0 };
}
