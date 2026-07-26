import type { AnchorDefinition } from "./types";

/**
 * A4 Alert-to-Evidence (AML Operations). No predicted disposition is ever
 * generated: this anchor reports backlog age, priority, and evidence
 * completeness only.
 */
export const a4: AnchorDefinition = {
  id: "a4",
  name: "Alert-to-Evidence",
  jobTitle: "Head of AML Operations",
  criticalBusinessIssue:
    "Clear alerts within policy while improving review quality and preserving human disposition.",
  takeaway: "Assemble Evidence Faster",
  deltaHypothesis:
    "Shorten the time an investigator spends assembling transaction, counterparty, and geography evidence before disposing an alert.",
  criticalDate: "Not yet qualified",
  domainKey: "a4_aml_operations",
  status: "available",
  estimatedMinutes: 5,
  primaryScenarioId: "A4_CORRESPONDENT_SPIKE",
  entityTypes: ["alert"],
  guardrailText:
    "Aura Analyst assembles and explains evidence. It does not dispose of an AML alert or file a SAR.",
  humanOwnership: "Alert disposition and regulatory filing stay with AML investigators.",
  starterPrompts: [
    "Show open AML alerts by age, rule, risk band, and queue.",
    "For the selected cohort, summarize transaction value, counterparties, geographies, and prior alerts.",
    "Identify missing evidence without recommending a disposition.",
  ],
  overviewWidgets: [
    {
      id: "open_alert_count",
      title: "Open alerts",
      subtitle: "Not yet closed",
      metricFormat: "count",
      backendRoute: "/api/v1/anchors/a4/overview",
      visualization: "kpi",
      expectedBaseline: "Consistent with the seeded baseline",
      expectedScenarioDelta: "Rises by one with the injected alert",
      proofMode: "deterministic",
      sourceTables: ["aml_alert"],
    },
    {
      id: "high_priority_count",
      title: "High-priority alerts",
      metricFormat: "count",
      backendRoute: "/api/v1/anchors/a4/overview",
      visualization: "kpi",
      expectedBaseline: "Consistent with the seeded baseline",
      expectedScenarioDelta: "Rises by one with the injected high-priority alert",
      proofMode: "deterministic",
      sourceTables: ["aml_alert"],
    },
    {
      id: "sla_risk_count",
      title: "At risk of SLA breach",
      subtitle: "Due within the next 24 logical hours",
      metricFormat: "count",
      backendRoute: "/api/v1/anchors/a4/overview",
      visualization: "kpi",
      expectedBaseline: "Consistent with the seeded baseline",
      expectedScenarioDelta: "Rises by one with the injected alert",
      proofMode: "deterministic",
      sourceTables: ["aml_alert"],
    },
    {
      id: "avg_age_hours",
      title: "Average alert age",
      subtitle: "Hours since creation, open alerts only",
      metricFormat: "count",
      backendRoute: "/api/v1/anchors/a4/overview",
      visualization: "kpi",
      expectedBaseline: "Consistent with the seeded baseline",
      expectedScenarioDelta: "Not directly affected by one new alert",
      proofMode: "deterministic",
      sourceTables: ["aml_alert"],
    },
    {
      id: "backlog_by_queue",
      title: "Backlog by rule, risk band, and queue",
      metricFormat: "count",
      backendRoute: "/api/v1/anchors/a4/overview",
      visualization: "ranked-bar",
      expectedBaseline: "Distributed across queues",
      expectedScenarioDelta: "Injected queue rises in SLA risk",
      proofMode: "analyst-optional",
      sourceTables: ["aa_aml_backlog"],
    },
    {
      id: "top_entities",
      title: "Entities with the highest linked transaction value",
      metricFormat: "currency",
      backendRoute: "/api/v1/anchors/a4/overview",
      visualization: "table",
      expectedBaseline: "Ranked by linked transaction value",
      expectedScenarioDelta: "Injected entity rises in linked transaction value",
      proofMode: "deterministic",
      sourceTables: ["aa_aml_entity_activity"],
    },
    {
      id: "what_changed",
      title: "Change impact",
      metricFormat: "text",
      backendRoute: "/api/v1/anchors/a4/overview",
      visualization: "callout",
      expectedBaseline: "No operational event active",
      expectedScenarioDelta:
        "Open backlog, high-priority count, and SLA-risk count each rise by one; evidence count rises by 25",
      proofMode: "deterministic",
      sourceTables: ["aml_alert", "aml_evidence", "demo_scenario_execution"],
    },
  ],
};
