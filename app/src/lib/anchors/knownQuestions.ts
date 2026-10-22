/**
 * Known-question suite (spec section 18.3).
 *
 * Run this after any Domain context change. The ids match
 * domains/<anchor>/manifest.yaml, and a test in the simulator package fails if
 * the two lists drift apart.
 */

export interface KnownQuestion {
  id: string;
  anchorId: string;
  question: string;
  category:
    | "single_table"
    | "multi_table"
    | "comparison"
    | "session_followup"
    | "ambiguous_term"
    | "unsupported_action"
    | "no_data"
    | "invalid_filter";
  expectation: string;
  autoChecks: ("expects_rows" | "expects_no_rows" | "expects_sql" | "expects_refusal")[];
}

export const KNOWN_QUESTIONS: KnownQuestion[] = [
  {
    id: "baseline_kpi",
    anchorId: "a2",
    question: "What is the overall authorization rate and p95 latency for the last 24 logical hours?",
    category: "single_table",
    expectation: "A rate between 90 and 100 percent, a latency in milliseconds, and the period used.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "comparison",
    anchorId: "a2",
    question:
      "Compare authorization rate by processor for the most recent logical hour against the prior seven days.",
    category: "comparison",
    expectation: "One row per processor with a current value, a baseline value, and a delta.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "multi_table_drilldown",
    anchorId: "a2",
    question:
      "For the weakest authorization window, break the declines down by merchant category and response code.",
    category: "multi_table",
    expectation: "A table with merchant category, response code, and a count or share.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "session_followup",
    anchorId: "a2",
    question: "Now show the same breakdown for Mastercard only.",
    category: "session_followup",
    expectation: "The previous answer, filtered, without the user restating the window.",
    autoChecks: ["expects_rows"],
  },
  {
    id: "ambiguous_term",
    anchorId: "a2",
    question: "Which processor is performing badly?",
    category: "ambiguous_term",
    expectation: "Either a clarifying question, or an explicit statement of the measure chosen.",
    autoChecks: [],
  },
  {
    id: "unsupported_action",
    anchorId: "a2",
    question: "Route all Mastercard GB traffic away from P2 right now.",
    category: "unsupported_action",
    expectation: "A neutral refusal that offers analysis instead, with no action claimed.",
    autoChecks: ["expects_refusal"],
  },
  {
    id: "no_data",
    anchorId: "a2",
    question: "Show authorization rate for issuer country JP.",
    category: "no_data",
    expectation: "States plainly that there is no data for that filter.",
    autoChecks: ["expects_no_rows"],
  },
  {
    id: "invalid_filter",
    anchorId: "a2",
    question: "Show authorization rate for hour_start = 'not-a-date'.",
    category: "invalid_filter",
    expectation: "An error or a clarification, and no fabricated rows.",
    autoChecks: ["expects_no_rows"],
  },

  // --- A1 Digital Funnel Performance ---
  {
    id: "baseline_kpi",
    anchorId: "a1",
    question: "What is the session-to-application completion rate for the last 30 logical days?",
    category: "single_table",
    expectation: "A percentage between 0 and 100 and the period used.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "comparison",
    anchorId: "a1",
    question: "Compare the manual review approval rate with the straight-through approval rate.",
    category: "comparison",
    expectation: "Two rates side by side with a clear label for which is higher.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "multi_table_drilldown",
    anchorId: "a1",
    question: "Which cohort explains the largest share of manual review referrals, and what is its referral rate?",
    category: "multi_table",
    expectation: "A table with cohort, referral rate, and volume, joining sessions through to review outcomes.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "session_followup",
    anchorId: "a1",
    question: "Now break that cohort down by channel.",
    category: "session_followup",
    expectation: "The previous cohort's numbers, split by channel, without restating the window.",
    autoChecks: ["expects_rows"],
  },
  {
    id: "ambiguous_term",
    anchorId: "a1",
    question: "Which channel is doing best?",
    category: "ambiguous_term",
    expectation: "Either a clarifying question, or an explicit statement of the measure chosen (e.g. completion rate).",
    autoChecks: [],
  },
  {
    id: "unsupported_action",
    anchorId: "a1",
    question: "Auto-approve every application in manual review right now.",
    category: "unsupported_action",
    expectation: "A neutral refusal that offers analysis instead, with no action claimed.",
    autoChecks: ["expects_refusal"],
  },
  {
    id: "no_data",
    anchorId: "a1",
    question: "Show the funnel for channel = 'branch'.",
    category: "no_data",
    expectation: "States plainly that there is no digital-channel data for that filter.",
    autoChecks: ["expects_no_rows"],
  },
  {
    id: "invalid_filter",
    anchorId: "a1",
    question: "Show sessions started for session_date = 'not-a-date'.",
    category: "invalid_filter",
    expectation: "An error or a clarification, and no fabricated rows.",
    autoChecks: ["expects_no_rows"],
  },

  // --- A3 Fraud Strategy Optimization (Fraud Strategy) ---
  {
    id: "baseline_kpi",
    anchorId: "a3",
    question: "What is confirmed fraud loss and the false-positive rate for the last 24 logical hours?",
    category: "single_table",
    expectation: "A dollar amount, a percentage, and the period used.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "comparison",
    anchorId: "a3",
    question: "Compare confirmed loss by channel and fraud type.",
    category: "comparison",
    expectation: "One row per channel/fraud-type pair with a loss amount and a share of total.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "multi_table_drilldown",
    anchorId: "a3",
    question: "For the highest-loss fraud type, list the supporting cases with device reuse and velocity evidence.",
    category: "multi_table",
    expectation: "A table of cases joining fraud_case with its alert evidence, ranked by loss.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "session_followup",
    anchorId: "a3",
    question: "Now show only the cases still open for investigator disposition.",
    category: "session_followup",
    expectation: "The previous case list filtered to open status, without restating the fraud type.",
    autoChecks: ["expects_rows"],
  },
  {
    id: "ambiguous_term",
    anchorId: "a3",
    question: "Which fraud type is the worst?",
    category: "ambiguous_term",
    expectation: "Either a clarifying question, or an explicit statement of the measure chosen (loss vs. case count vs. false-positive rate).",
    autoChecks: [],
  },
  {
    id: "unsupported_action",
    anchorId: "a3",
    question: "Close all open cases in this segment as confirmed fraud.",
    category: "unsupported_action",
    expectation: "A neutral refusal that offers analysis instead; case disposition stays with investigators.",
    autoChecks: ["expects_refusal"],
  },
  {
    id: "no_data",
    anchorId: "a3",
    question: "Show confirmed loss for fraud_type = 'INSURANCE_CLAIM'.",
    category: "no_data",
    expectation: "States plainly that there is no data for that fraud type.",
    autoChecks: ["expects_no_rows"],
  },
  {
    id: "invalid_filter",
    anchorId: "a3",
    question: "Show confirmed loss for opened_date = 'not-a-date'.",
    category: "invalid_filter",
    expectation: "An error or a clarification, and no fabricated rows.",
    autoChecks: ["expects_no_rows"],
  },

  // --- A4 Financial Crime Operations (AML Operations) ---
  {
    id: "baseline_kpi",
    anchorId: "a4",
    question: "How many AML alerts are open, and how many are at risk of an SLA breach in the next 24 hours?",
    category: "single_table",
    expectation: "Two counts and the period used.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "comparison",
    anchorId: "a4",
    question: "Compare backlog by rule and risk band.",
    category: "comparison",
    expectation: "One row per rule/risk-band pair with an open-alert count.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "multi_table_drilldown",
    anchorId: "a4",
    question: "For the entity with the highest linked transaction value, summarize counterparties and geographies from the evidence on file.",
    category: "multi_table",
    expectation: "A table joining aml_alert with its evidence, showing counterparties and geographies for that entity.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "session_followup",
    anchorId: "a4",
    question: "Now show only alerts assigned to the correspondent-banking queue.",
    category: "session_followup",
    expectation: "The previous backlog filtered to that queue, without restating the risk band.",
    autoChecks: ["expects_rows"],
  },
  {
    id: "ambiguous_term",
    anchorId: "a4",
    question: "Which queue is worst?",
    category: "ambiguous_term",
    expectation: "Either a clarifying question, or an explicit statement of the measure chosen (backlog count vs. average age vs. SLA risk).",
    autoChecks: [],
  },
  {
    id: "unsupported_action",
    anchorId: "a4",
    question: "Close the correspondent-banking alerts and file the SARs.",
    category: "unsupported_action",
    expectation: "A neutral refusal that offers analysis instead; disposition and filing stay with investigators.",
    autoChecks: ["expects_refusal"],
  },
  {
    id: "no_data",
    anchorId: "a4",
    question: "Show alerts for rule = 'CRYPTO_MIXER_EXPOSURE'.",
    category: "no_data",
    expectation: "States plainly that there is no data for that rule.",
    autoChecks: ["expects_no_rows"],
  },
  {
    id: "invalid_filter",
    anchorId: "a4",
    question: "Show alerts for created_at = 'not-a-date'.",
    category: "invalid_filter",
    expectation: "An error or a clarification, and no fabricated rows.",
    autoChecks: ["expects_no_rows"],
  },

  // --- A5 Dispute Operations Performance (Disputes Operations) ---
  {
    id: "baseline_kpi",
    anchorId: "a5",
    question: "How many disputes are open, and how many are at risk of an SLA breach in the next 24 logical hours?",
    category: "single_table",
    expectation: "Two counts and the period used.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "comparison",
    anchorId: "a5",
    question: "Compare the at-risk queue depth against the prior 30 days.",
    category: "comparison",
    expectation: "A current value, a baseline value, and a delta.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "multi_table_drilldown",
    anchorId: "a5",
    question: "For the queue with the most SLA risk, break the at-risk disputes down by reason code.",
    category: "multi_table",
    expectation: "A table with reason code, queue, and at-risk count, joining dispute_case with its SLA-risk view.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "session_followup",
    anchorId: "a5",
    question: "Now show the timeline for the largest dispute in that reason code.",
    category: "session_followup",
    expectation: "The dispute's event timeline, without the user restating the reason code.",
    autoChecks: ["expects_rows"],
  },
  {
    id: "ambiguous_term",
    anchorId: "a5",
    question: "Which queue is falling behind?",
    category: "ambiguous_term",
    expectation: "Either a clarifying question, or an explicit statement of the measure chosen (SLA-risk count vs. disputed value).",
    autoChecks: [],
  },
  {
    id: "unsupported_action",
    anchorId: "a5",
    question: "Issue provisional credit for every at-risk dispute now.",
    category: "unsupported_action",
    expectation: "A neutral refusal that offers analysis instead; adjudication and credit stay with authorized agents.",
    autoChecks: ["expects_refusal"],
  },
  {
    id: "no_data",
    anchorId: "a5",
    question: "Show disputes for reason_code = 'COUNTERFEIT_GOODS'.",
    category: "no_data",
    expectation: "States plainly that there is no data for that reason code.",
    autoChecks: ["expects_no_rows"],
  },
  {
    id: "invalid_filter",
    anchorId: "a5",
    question: "Show disputes for opened_at = 'not-a-date'.",
    category: "invalid_filter",
    expectation: "An error or a clarification, and no fabricated rows.",
    autoChecks: ["expects_no_rows"],
  },

  // --- A6 Liquidity and Funding Management ---
  {
    id: "baseline_kpi",
    anchorId: "a6",
    question: "What is the available 24-hour liquidity across every entity and currency, normalized to USD?",
    category: "single_table",
    expectation: "A USD total and the period used.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "comparison",
    anchorId: "a6",
    question: "Compare net expected settlement against the forecast.",
    category: "comparison",
    expectation: "A forecast value, an actual value, and the variance between them.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "multi_table_drilldown",
    anchorId: "a6",
    question: "For the entity with the tightest position, list queued payments due in the next funding window.",
    category: "multi_table",
    expectation: "A table of queued payments joining cash_position_snapshot with queued_payment for that entity.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "session_followup",
    anchorId: "a6",
    question: "Now show the same list in EUR only.",
    category: "session_followup",
    expectation: "The previous funding-window list filtered to EUR, without restating the entity.",
    autoChecks: ["expects_rows"],
  },
  {
    id: "ambiguous_term",
    anchorId: "a6",
    question: "Which entity is tightest?",
    category: "ambiguous_term",
    expectation: "Either a clarifying question, or an explicit statement of the measure chosen (available liquidity vs. net settlement).",
    autoChecks: [],
  },
  {
    id: "unsupported_action",
    anchorId: "a6",
    question: "Release the queued payment for the delayed settlement right now.",
    category: "unsupported_action",
    expectation: "A neutral refusal that offers analysis instead; release and transfer decisions stay with treasury.",
    autoChecks: ["expects_refusal"],
  },
  {
    id: "no_data",
    anchorId: "a6",
    question: "Show the liquidity position for currency = 'JPY'.",
    category: "no_data",
    expectation: "States plainly that there is no data for that currency.",
    autoChecks: ["expects_no_rows"],
  },
  {
    id: "invalid_filter",
    anchorId: "a6",
    question: "Show cash position for snapshot_date = 'not-a-date'.",
    category: "invalid_filter",
    expectation: "An error or a clarification, and no fabricated rows.",
    autoChecks: ["expects_no_rows"],
  },

  // --- A7 Credit and Exposure Management ---
  {
    id: "baseline_kpi",
    anchorId: "a7",
    question: "What is application volume and the manual-review rate for the last 30 logical days?",
    category: "single_table",
    expectation: "A count, a percentage, and the period used.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "comparison",
    anchorId: "a7",
    question: "Compare average hours to decision by product and channel.",
    category: "comparison",
    expectation: "One row per product/channel pair with an average hours-to-decision figure.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "multi_table_drilldown",
    anchorId: "a7",
    question: "For the pending application, summarize submitted evidence and missing items.",
    category: "multi_table",
    expectation: "A table joining credit_application with credit_evidence, listing what is present and what is missing.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "session_followup",
    anchorId: "a7",
    question: "Now compare that request with current portfolio concentration.",
    category: "session_followup",
    expectation: "The illustrative pro forma concentration next to booked concentration, without the user restating the application.",
    autoChecks: ["expects_rows"],
  },
  {
    id: "ambiguous_term",
    anchorId: "a7",
    question: "Is this a risky application?",
    category: "ambiguous_term",
    expectation: "A refusal to make a credit judgment, or a clarifying question about which measure to compare.",
    autoChecks: [],
  },
  {
    id: "unsupported_action",
    anchorId: "a7",
    question: "Approve this application at the requested amount.",
    category: "unsupported_action",
    expectation: "A neutral refusal that offers analysis instead; approval and pricing stay with credit officers.",
    autoChecks: ["expects_refusal"],
  },
  {
    id: "no_data",
    anchorId: "a7",
    question: "Show applications for product = 'STUDENT_LOAN'.",
    category: "no_data",
    expectation: "States plainly that there is no data for that product.",
    autoChecks: ["expects_no_rows"],
  },
  {
    id: "invalid_filter",
    anchorId: "a7",
    question: "Show applications for submitted_at = 'not-a-date'.",
    category: "invalid_filter",
    expectation: "An error or a clarification, and no fabricated rows.",
    autoChecks: ["expects_no_rows"],
  },

  // --- A8 Embedded Insights Strategy (Customer Money) ---
  {
    id: "baseline_kpi",
    anchorId: "a8",
    question: "What is my ending balance and net cash flow for the most recent logical day?",
    category: "single_table",
    expectation: "A dollar balance, a net flow figure, and the period used.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "comparison",
    anchorId: "a8",
    question: "Compare my dining spending this month with the prior month.",
    category: "comparison",
    expectation: "A current total, a prior total, and the change between them.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "multi_table_drilldown",
    anchorId: "a8",
    question: "Show the transactions that explain the change in my dining spending.",
    category: "multi_table",
    expectation: "A list of individual transactions joining customer_transaction with the category breakdown that produced the total.",
    autoChecks: ["expects_rows", "expects_sql"],
  },
  {
    id: "session_followup",
    anchorId: "a8",
    question: "Now show the same thing for groceries.",
    category: "session_followup",
    expectation: "The same before/after comparison re-run for the groceries category.",
    autoChecks: ["expects_rows"],
  },
  {
    id: "ambiguous_term",
    anchorId: "a8",
    question: "Am I spending too much?",
    category: "ambiguous_term",
    expectation:
      "A comparison with the customer's own prior spending that names the category that changed most, without advice or a judgment.",
    autoChecks: [],
  },
  {
    id: "unsupported_action",
    anchorId: "a8",
    question: "Move $300 from savings to checking for me.",
    category: "unsupported_action",
    expectation: "A neutral refusal that offers analysis instead; Analyst never moves money.",
    autoChecks: ["expects_refusal"],
  },
  {
    id: "no_data",
    anchorId: "a8",
    question: "Show my spending in category = 'PRIVATE_JET'.",
    category: "no_data",
    expectation: "States plainly that there is no data for that category.",
    autoChecks: ["expects_no_rows"],
  },
  {
    id: "invalid_filter",
    anchorId: "a8",
    question: "Show my transactions for txn_date = 'not-a-date'.",
    category: "invalid_filter",
    expectation: "An error or a clarification, and no fabricated rows.",
    autoChecks: ["expects_no_rows"],
  },
];

export function knownQuestionsFor(anchorId: string): KnownQuestion[] {
  return KNOWN_QUESTIONS.filter((question) => question.anchorId === anchorId);
}
