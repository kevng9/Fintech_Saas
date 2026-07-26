import type { AnchorDefinition } from "./types";

/**
 * A8 Explain My Money (Customer Money). This build supports one
 * customer-facing identity, seeded as CUST-0001. Every curated view this
 * anchor reads is physically filtered to that customer (spec section 12.3);
 * this definition never accepts a customer id from a URL, prompt, or session.
 */
export const a8: AnchorDefinition = {
  id: "a8",
  name: "Explain My Money",
  jobTitle: "Chief Product Officer",
  criticalBusinessIssue:
    "Increase digital engagement and monetization through trusted, personalized financial explanations.",
  takeaway: "Explain Engage Monetize",
  deltaHypothesis:
    "Turn a customer's spending question into a trusted, evidenced answer inside the banking app, not a spreadsheet export.",
  criticalDate: "Not yet qualified",
  domainKey: "a8_customer_money",
  status: "available",
  estimatedMinutes: 5,
  primaryScenarioId: "A8_DINING_SPIKE",
  entityTypes: ["category"],
  guardrailText:
    "Aura Analyst explains this customer's own transaction history. It does not provide financial or investment advice.",
  humanOwnership: null,
  starterPrompts: [
    "Why did my dining spending change this month?",
    "Show the transactions that explain the change.",
    "Compare my current cash flow with the prior comparable period.",
  ],
  overviewWidgets: [
    {
      id: "ending_balance",
      title: "Ending balance",
      metricFormat: "currency",
      backendRoute: "/api/v1/anchors/a8/overview",
      visualization: "kpi",
      expectedBaseline: "Consistent with the seeded baseline",
      expectedScenarioDelta: "Falls by $300 with the injected dining spend",
      proofMode: "deterministic",
      sourceTables: ["aa_customer_money_summary"],
    },
    {
      id: "net_flow",
      title: "Net cash flow",
      subtitle: "Most recent logical day",
      metricFormat: "currency",
      backendRoute: "/api/v1/anchors/a8/overview",
      visualization: "kpi",
      expectedBaseline: "Consistent with the seeded baseline",
      expectedScenarioDelta: "Falls by $300 with the injected dining spend",
      proofMode: "deterministic",
      sourceTables: ["aa_customer_money_summary"],
    },
    {
      id: "inflows",
      title: "Inflows",
      subtitle: "Most recent logical day",
      metricFormat: "currency",
      backendRoute: "/api/v1/anchors/a8/overview",
      visualization: "kpi",
      expectedBaseline: "Consistent with the seeded baseline",
      expectedScenarioDelta: "Not directly affected by the injected dining spend",
      proofMode: "deterministic",
      sourceTables: ["aa_customer_money_summary"],
    },
    {
      id: "outflows",
      title: "Outflows",
      subtitle: "Most recent logical day",
      metricFormat: "currency",
      backendRoute: "/api/v1/anchors/a8/overview",
      visualization: "kpi",
      expectedBaseline: "Consistent with the seeded baseline",
      expectedScenarioDelta: "Rises by $300 with the injected dining spend",
      proofMode: "deterministic",
      sourceTables: ["aa_customer_money_summary"],
    },
    {
      id: "cash_flow_by_day",
      title: "Cash flow by day",
      metricFormat: "currency",
      backendRoute: "/api/v1/anchors/a8/overview",
      visualization: "timeseries",
      expectedBaseline: "Flat with a normal daily shape",
      expectedScenarioDelta: "Visible dip on the injection day",
      proofMode: "deterministic",
      sourceTables: ["aa_customer_money_summary"],
    },
    {
      id: "spend_by_category",
      title: "Spending change by category",
      metricFormat: "currency",
      backendRoute: "/api/v1/anchors/a8/overview",
      visualization: "ranked-bar",
      expectedBaseline: "Categories within their usual monthly range",
      expectedScenarioDelta: "Dining rises to the top of the ranking",
      proofMode: "analyst-optional",
      sourceTables: ["aa_customer_spend_change"],
    },
    {
      id: "what_changed",
      title: "Change impact",
      metricFormat: "text",
      backendRoute: "/api/v1/anchors/a8/overview",
      visualization: "callout",
      expectedBaseline: "No operational event active",
      expectedScenarioDelta: "Dining spend and outflows rise by $300; net cash flow falls by $300",
      proofMode: "deterministic",
      sourceTables: ["customer_transaction", "demo_scenario_execution"],
    },
  ],
};
