/**
 * Deterministic A8 Embedded Insights Strategy (Customer Money) queries.
 *
 * Every curated view this module reads is physically filtered to the single
 * demo customer `CUST-0001` in the migration itself
 * (database/migrations/012_a8_customer_money.sql, spec section 12.3). This
 * module adds a defensive `CUSTOMER_ID` constant rather than trusting a
 * caller-supplied identifier, so a URL or prompt cannot widen scope.
 */

import { query } from "../db";
import type {
  SharedChangePayload,
  SharedEntityData,
  SharedOverviewData,
} from "../apiTypes";
import { buildChangePayload, scenarioExecution, scenarioExpectedDeltas } from "./shared";

export const CUSTOMER_ID = "CUST-0001";

interface DailySummaryRow {
  activity_date: string;
  inflows: number;
  outflows: number;
  net_flow: number;
  ending_balance: number;
}

async function dailySummary(days = 30): Promise<DailySummaryRow[]> {
  return query<DailySummaryRow>(
    `SELECT activity_date, inflows, outflows, net_flow, ending_balance
     FROM aa_customer_money_summary
     WHERE activity_date > DATE_SUB(
       (SELECT logical_time FROM demo_active_run WHERE singleton_id = 1), INTERVAL ${Math.trunc(days)} DAY
     )
     ORDER BY activity_date`
  );
}

interface SpendChangeRow {
  spend_month: string;
  category: string;
  transaction_count: number;
  category_spend_usd: number;
}

async function spendByCategory(): Promise<SpendChangeRow[]> {
  return query<SpendChangeRow>(
    `SELECT spend_month, category, transaction_count, category_spend_usd
     FROM aa_customer_spend_change
     ORDER BY spend_month DESC, category_spend_usd DESC`
  );
}

export async function overview(): Promise<SharedOverviewData> {
  const [daily, categorySpend] = await Promise.all([dailySummary(30), spendByCategory()]);

  const latest = daily[daily.length - 1] ?? null;
  const priorDay = daily[daily.length - 2] ?? null;

  const months = [...new Set(categorySpend.map((row) => row.spend_month))].sort().reverse();
  const currentMonth = months[0];
  const priorMonth = months[1];

  const currentByCategory = new Map(
    categorySpend
      .filter((row) => row.spend_month === currentMonth)
      .map((row) => [row.category, row])
  );
  const priorByCategory = new Map(
    categorySpend
      .filter((row) => row.spend_month === priorMonth)
      .map((row) => [row.category, row])
  );

  const categories = new Set([...currentByCategory.keys(), ...priorByCategory.keys()]);
  const categoryRows = [...categories].map((category) => {
    const current = currentByCategory.get(category);
    const prior = priorByCategory.get(category);
    const currentSpend = current ? Number(current.category_spend_usd) : 0;
    const priorSpend = prior ? Number(prior.category_spend_usd) : 0;
    return {
      category,
      current_spend_usd: currentSpend,
      prior_spend_usd: priorSpend,
      change_usd: currentSpend - priorSpend,
      transaction_count: current ? Number(current.transaction_count) : 0,
    };
  });
  categoryRows.sort((a, b) => Math.abs(b.change_usd) - Math.abs(a.change_usd));

  const kpis: SharedOverviewData["kpis"] = [
    {
      id: "ending_balance",
      title: "Ending balance",
      subtitle: latest ? `As of ${latest.activity_date}` : undefined,
      value: latest ? Number(latest.ending_balance) : null,
      baseline: null,
      delta: null,
      format: "currency",
    },
    {
      id: "net_flow",
      title: "Net cash flow",
      subtitle: "Most recent logical day",
      value: latest ? Number(latest.net_flow) : null,
      baseline: priorDay ? Number(priorDay.net_flow) : null,
      delta:
        latest && priorDay ? Number(latest.net_flow) - Number(priorDay.net_flow) : null,
      format: "currency",
    },
    {
      id: "inflows",
      title: "Inflows",
      subtitle: "Most recent logical day",
      value: latest ? Number(latest.inflows) : null,
      baseline: null,
      delta: null,
      format: "currency",
      higherIsBetter: true,
    },
    {
      id: "outflows",
      title: "Outflows",
      subtitle: "Most recent logical day",
      value: latest ? Number(latest.outflows) : null,
      baseline: null,
      delta: null,
      format: "currency",
      higherIsBetter: false,
    },
  ];

  const series: SharedOverviewData["series"] = {
    title: "Cash flow by day",
    subtitle: "Last 30 logical days",
    xKey: "activity_date",
    series: [
      { key: "inflows", label: "Inflows", format: "currency" },
      { key: "outflows", label: "Outflows", format: "currency" },
      { key: "net_flow", label: "Net flow", format: "currency" },
    ],
    points: daily.map((row) => ({
      activity_date: String(row.activity_date).slice(0, 10),
      inflows: Number(row.inflows),
      outflows: Number(row.outflows),
      net_flow: Number(row.net_flow),
    })),
  };

  const drivers: SharedOverviewData["drivers"] = {
    title: "Spending change by category",
    subtitle: currentMonth && priorMonth ? `${currentMonth} vs. ${priorMonth}` : "This month",
    entityType: "category",
    entityKey: "category",
    linkLabelKey: "category",
    columns: [
      { key: "category", label: "Category" },
      { key: "current_spend_usd", label: "This month", format: "currency" },
      { key: "prior_spend_usd", label: "Prior month", format: "currency" },
      { key: "change_usd", label: "Change", format: "currency" },
      { key: "transaction_count", label: "Transactions", format: "count" },
    ],
    rows: categoryRows,
  };

  return {
    kpis,
    series,
    drivers,
    change: await change(),
    tables: null,
    meta: { notes: `Scoped to the single demo customer ${CUSTOMER_ID}.` },
  };
}

async function change(): Promise<SharedChangePayload | null> {
  const scenarioId = "A8_DINING_SPIKE";
  const state = await query<{ run_id: number }>(
    "SELECT run_id FROM demo_active_run WHERE singleton_id = 1"
  );
  const runId = state[0]?.run_id;
  if (!runId) return null;
  const execution = await scenarioExecution(runId, scenarioId);
  if (!execution?.window_start || !execution?.window_end) return null;

  const expected = await scenarioExpectedDeltas(scenarioId);
  const segment = (expected.segment as Record<string, string> | undefined) ?? {};
  const category = segment.category ?? "dining";

  const rows = await query<{ spend: number; transaction_count: number }>(
    `SELECT
        SUM(ct.amount_usd) AS spend,
        COUNT(*) AS transaction_count
     FROM customer_transaction ct
     JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = ct.run_id
     WHERE ct.customer_id = ? AND ct.category = ? AND ct.direction = 'outflow'
       AND ct.event_time >= ? AND ct.event_time <= ?`,
    [CUSTOMER_ID, category, execution.window_start, execution.window_end]
  );

  const spend = rows[0]?.spend ? Number(rows[0].spend) : 0;
  const transactionCount = Number(rows[0]?.transaction_count ?? 0);

  return buildChangePayload({
    scenarioId,
    execution,
    expected,
    segmentLabel: "Dining spend for this customer",
    specs: [
      { label: "Dining spend", key: "dining_spend_delta_usd", format: "currency" },
      { label: "Net cash flow impact", key: "net_flow_delta_usd", format: "currency" },
      { label: "Transactions explained", key: "transactions_explained", format: "count" },
    ],
    before: {
      dining_spend_delta_usd: 0,
      net_flow_delta_usd: 0,
      transactions_explained: 0,
    },
    after: {
      dining_spend_delta_usd: spend,
      net_flow_delta_usd: -spend,
      transactions_explained: transactionCount,
    },
  });
}

export async function entity(
  entityType: string,
  entityId: string
): Promise<SharedEntityData | null> {
  if (entityType !== "category") return null;
  const category = decodeURIComponent(entityId);

  const history = await query<SpendChangeRow>(
    `SELECT spend_month, category, transaction_count, category_spend_usd
     FROM aa_customer_spend_change
     WHERE category = ?
     ORDER BY spend_month DESC
     LIMIT 12`,
    [category]
  );
  if (!history.length) return null;

  const transactions = await query<{
    transaction_id: string;
    event_time: string;
    merchant_name: string | null;
    amount: number;
    amount_usd: number;
    currency: string;
    direction: string;
    is_scenario_event: number;
  }>(
    `SELECT transaction_id, event_time, merchant_name, amount, amount_usd, currency, direction,
            is_scenario_event
     FROM aa_customer_transaction_evidence
     WHERE category = ?
     ORDER BY event_time DESC
     LIMIT 100`,
    [category]
  );

  const currentMonthTotal = Number(history[0]?.category_spend_usd ?? 0);

  return {
    entity_type: "category",
    entity_id: category,
    header: {
      title: `${category} spending`,
      subtitle: `Customer ${CUSTOMER_ID}`,
    },
    metrics: [
      {
        id: "current_month_spend",
        title: "This month",
        value: currentMonthTotal,
        baseline: history[1] ? Number(history[1].category_spend_usd) : null,
        delta:
          history[1] ? currentMonthTotal - Number(history[1].category_spend_usd) : null,
        format: "currency",
      },
    ],
    sections: [
      {
        kind: "table",
        title: "Monthly history",
        columns: [
          { key: "spend_month", label: "Month" },
          { key: "category_spend_usd", label: "Spend", format: "currency" },
          { key: "transaction_count", label: "Transactions", format: "count" },
        ],
        rows: history.map((row) => ({
          spend_month: String(row.spend_month).slice(0, 10),
          category_spend_usd: Number(row.category_spend_usd),
          transaction_count: Number(row.transaction_count),
        })),
      },
      {
        kind: "table",
        title: "Transactions that explain the change",
        columns: [
          { key: "event_time", label: "Time" },
          { key: "merchant_name", label: "Merchant" },
          { key: "amount_usd", label: "Amount", format: "currency" },
          { key: "is_scenario_event", label: "Flagged" },
        ],
        rows: transactions.map((row) => ({
          event_time: row.event_time,
          merchant_name: row.merchant_name ?? "—",
          amount_usd: Number(row.amount_usd),
          is_scenario_event: row.is_scenario_event ? "New this period" : "",
        })),
      },
    ],
  };
}

export async function watermark(): Promise<{ last_event_time: string | null; events: number }> {
  const rows = await query<{ last_event_time: string | null; events: number }>(
    `SELECT MAX(ct.event_time) AS last_event_time, COUNT(*) AS events
     FROM customer_transaction ct
     JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = ct.run_id
     WHERE ct.customer_id = '${CUSTOMER_ID}'`
  );
  return rows[0] ?? { last_event_time: null, events: 0 };
}
