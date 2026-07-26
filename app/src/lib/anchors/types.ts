export type AnchorId = "a1" | "a2" | "a3" | "a4" | "a5" | "a6" | "a7" | "a8";

export type Visualization = "kpi" | "timeseries" | "ranked-bar" | "table" | "callout";

export type ProofMode = "deterministic" | "analyst-optional";

export interface WidgetDefinition {
  id: string;
  title: string;
  subtitle?: string;
  metricFormat: "percent" | "milliseconds" | "count" | "currency" | "text";
  backendRoute: string;
  visualization: Visualization;
  expectedBaseline: string;
  expectedScenarioDelta: string;
  proofMode: ProofMode;
  sourceTables: string[];
}

export interface AnchorDefinition {
  id: AnchorId;
  name: string;
  jobTitle: string;
  criticalBusinessIssue: string;
  takeaway: string;
  deltaHypothesis: string;
  criticalDate: string;
  domainKey: string;
  status: "available" | "planned";
  estimatedMinutes: number;
  overviewWidgets: WidgetDefinition[];
  primaryScenarioId: string | null;
  starterPrompts: string[];
  entityTypes: string[];
  guardrailText: string;
  humanOwnership: string | null;
}

export interface AnchorSummary {
  id: AnchorId;
  name: string;
  jobTitle: string;
  criticalBusinessIssue: string;
  takeaway: string;
  status: AnchorDefinition["status"];
  estimatedMinutes: number;
  primaryScenarioId: string | null;
  starterPrompts: string[];
  guardrailText: string;
  humanOwnership: string | null;
}
