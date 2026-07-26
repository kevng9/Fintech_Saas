# Fintech Aura Analyst Modular Demo Playbook

Audience: SingleStore AEs, SEs, VEs, and demo builders  
Method: Demo2Win and Great Demos Tell-Show-Tell  
Status: Aura Analyst and the Analyst API are Preview features

## Executive summary

Fintech teams often wait on reports or analyst queues to connect current events with business history. United Bank identified this problem across digital utilization, relationships, onboarding, KYC/KYB, and fraud data. Socure needs timely views of approvals, fraud loss, false positives, SLAs, and model performance.

This playbook turns those needs into modular demos. Choose one anchor for the buyer's decision, then add only the proof needed to address a known concern.

Aura Analyst converts natural-language questions into SQL, executes the query, and returns summaries or visualizations using Domain business context. The API supports interactive streaming through `/chat` and structured integrations through `/query`. These are native capabilities. Saved cards, confidence badges, custom trace panels, scheduling, and workflow actions belong to the demo application unless separately implemented.

### How to use this playbook

1. Write the customer GIO in one sentence.
2. Select one anchor module matching the primary persona and decision.
3. Add only the proof modules needed to remove known doubt.
4. Rehearse the Opening Tell, exact prompts, visible result, and Closing Tell.
5. Label native Aura behavior and custom application behavior while presenting.
6. Close with a stage-gate question tied to data, value, architecture, or sponsorship.

Do not start with the product or architecture.

## Rules of the modular system

1. **GIO before product.** State the goal, initiative, objective, and current cost before opening Aura.
2. **One proof per module.** An anchor answers one consequential question. A proof module removes one objection.
3. **Tell-Show-Tell.** Every module has an Opening Tell, a restrained Show, and a Closing Tell.
4. **Short takeaway.** End each module with a memorable phrase of one to three words.
5. **Use only needed modules.** Use the minimum modules required for the room and time.
6. **Separate layers.** Say whether the audience sees native Aura Analyst, the Analyst API, SingleStore foundation behavior, or custom UI.
7. **Human accountability.** Aura supports analysis and evidence assembly. People approve investigations, alerts, credit decisions, and transaction actions.
8. **Hypotheses, not promises.** Numeric business deltas require customer baselines and validation. Intrinsic demo timings may be observed directly.
9. **Show Preview status.** Confirm Preview terms, limits, security review, and production fit before proposing deployment.
10. **End with a gate.** Ask for a specific next commitment. Applause is not progression.

### Standard module timing

Each anchor is designed for five minutes: 45 seconds Opening Tell, three minutes Show, 45 seconds Closing Tell, and 30 seconds stage-gate transition. Proof modules run for two or three minutes.

## Persona map

| Persona | Business decision | Typical pain | Primary KPIs | Best anchors | Useful proofs |
|---|---|---|---|---|---|
| Digital / Growth | Improve acquisition and relationship growth | Delayed funnel and intent visibility | Conversion, engagement, product adoption | A1, A8 | P1, P2, P8 |
| Payments / Ops | Protect payment economics and service | Declines, latency, processor blind spots | Authorization rate, latency, cost per payment | A2 | P1, P2, P7 |
| Fraud / Risk | Find and investigate loss drivers | Fragmented channel and entity evidence | Fraud loss, false positives, investigation time | A3 | P1, P2, P3, P5 |
| Compliance | Prioritize alerts and assemble evidence | Alert backlog and manual evidence collection | Alert age, review time, escalation quality | A4 | P3, P4, P5, P7 |
| Service / Disputes | Resolve cases within SLA | Queue opacity and fragmented timelines | Handle time, SLA breaches, retention | A5 | P1, P2, P8 |
| Treasury / Finance | Manage liquidity and settlement exposure | Stale positions and forecast variance | Forecast variance, queued value, funding cost | A6 | P2, P7, P8 |
| Credit | Review applicants and portfolio concentration | Disconnected evidence and delayed exposure views | Review time, approval rate, concentration | A7 | P3, P4, P5 |
| Product | Monetize differentiated data experiences | Analytics depend on separate tools | Engagement, premium adoption, retention | A8 | P6, P7, P8 |
| Data / Platform | Deliver governed self-service | Ticket backlog and metric inconsistency | Freshness, tickets, answer quality | Any | P2, P3, P4, P5, P7 |
| App Engineering | Embed reliable analytical experiences | Custom orchestration and response handling | API latency, errors, release cycle | A8 | P6, P7 |

## Module catalog overview

| ID | Type | Name | Primary persona | Value lever | Duration | Dependencies |
|---|---|---|---|---|---:|---|
| A1 | Anchor | Digital Journey Intelligence | Digital / Growth | Revenue, cost | 5 min | Digital, onboarding, relationship data |
| A2 | Anchor | Payment Pulse | Payments / Ops | Revenue, cost, risk | 5 min | Payment events and dimensions |
| A3 | Anchor | Trace the Loss | Fraud / Risk | Risk, cost, revenue protection | 5 min | Fraud outcomes and investigation dimensions |
| A4 | Anchor | Alert-to-Evidence | Compliance | Risk, cost | 5 min | AML alerts, entities, transactions, cases |
| A5 | Anchor | Dispute Resolution Lens | Service / Disputes | Cost, risk, retention | 5 min | Disputes, queues, transactions, contacts |
| A6 | Anchor | Liquidity Command Center | Treasury / Finance | Cost, risk | 5 min | Positions, settlements, queues, forecasts |
| A7 | Anchor | Credit Risk Pulse | Credit | Revenue, cost, risk | 5 min | Applications, evidence, exposure, portfolio |
| A8 | Anchor | Explain My Money | Product / App Engineering | Monetization, deflection, retention | 5 min | Customer-scoped Domain and embedded app |
| P1 | Proof | Conversational Drill-Down | Business analyst | Time | 2 min | Multi-turn session |
| P2 | Proof | Live Event Impact | Ops / Platform | Freshness | 2 min | Safe write/update path |
| P3 | Proof | Transparent Answer | Risk / Platform | Trust | 2 min | SQL or source display actually available |
| P4 | Proof | Governed Business Context | Data / Governance | Quality | 3 min | Configured Domain |
| P5 | Proof | Scoped Access | Security / Platform | Risk | 2 min | Roles, keys, authorized user story |
| P6 | Proof | Embedded Streaming | Product / Engineering | Experience | 3 min | `/chat`, SSE client, session handling |
| P7 | Proof | Structured Integration | Engineering / Ops | Automation | 3 min | `/query` client |
| P8 | Proof | Reusable Decision View | Business / Product | Reuse | 3 min | Custom saved card or workflow |

# Anchor modules

## A1. Digital Journey Intelligence

**Target persona:** Head of Digital, Growth, Retail Banking, Customer Analytics  
**Critical business issue:** Teams cannot connect onboarding, digital usage, and relationship activity quickly enough to improve conversion or act on intent.  
**Solution:** Ask governed questions across journey events, review paths, authenticated behavior, and customer relationships.  
**Capabilities:** Natural language to SQL, Domain context, execution, summary, data, and chart output.  
**Duration:** 5 minutes  
**Compatibility:** P1, P2, P4, P6, P8  
**Prerequisites:** Joined customer identity; journey-step taxonomy; channel, review path, product, login, page-view, and relationship data.

**Opening Tell:** “You said digital teams wait for monthly reports and cannot connect customer relationships to current behavior. We will isolate one conversion issue, then identify the affected customer cohort.”

**Exact Show:**

1. Prompt: `Show the account-opening funnel by step and channel for the last 30 days, including completion and abandonment rates.`  
   Expected visible result: Funnel table or chart by web and mobile, with one step and channel showing the largest abandonment.
2. Prompt: `Compare completion rate and median time to open for manual review versus straight-through applications.`  
   Expected visible result: Side-by-side comparison that identifies the slower or lower-converting path without claiming causation.
3. Prompt: `Which logged-in customers viewed mortgage pages at least twice this month, and what existing relationships do they have?`  
   Expected visible result: Authorized cohort with customer identifier, page activity, product relationships, and last activity date.

**Closing Tell:** “We moved from aggregate friction to a specific, relationship-aware cohort using the current data available to the Domain.”  
**Takeaway:** **See intent**

**Delta/KPIs:** Validate question-to-answer cycle time, report tickets, freshness, completion rate, abandonment, engagement, and relationship depth. Treat conversion uplift and support savings as hypotheses.

## A2. Payment Pulse

**Target persona:** Head of Payments, Payment Operations, Merchant Success  
**Critical business issue:** Small changes in approvals, latency, or decline mix can affect revenue, cost, customer experience, and risk before batch reporting exposes them.  
**Solution:** Analyze authorization performance across processor, rail, merchant, region, and decline reason.  
**Capabilities:** Natural-language analysis, generated SQL, query execution, summaries, tables, and charts.  
**Duration:** 5 minutes  
**Compatibility:** P1, P2, P3, P6, P7  
**Prerequisites:** Authorization events, amount, latency, response code, processor, rail, merchant, region, and event time.

**Opening Tell:** “Payment economics move before monthly summaries do. We will find where authorization performance changed and narrow it to an operational segment.”

**Exact Show:**

1. Prompt: `Show authorization rate, p95 latency, and decline volume by hour for the last 24 hours.`  
   Expected visible result: Time series with an identifiable change window.
2. Prompt: `During the weakest authorization window, rank processors and rails by approval-rate change versus the prior seven-day baseline.`  
   Expected visible result: Ranked comparison with counts and rates.
3. Prompt: `For the largest change, break declines down by merchant category and response code.`  
   Expected visible result: Concentrated decline mix suitable for operations follow-up.

**Closing Tell:** “The team can move from a portfolio signal to the processor, rail, and merchant pattern that deserves investigation.”  
**Takeaway:** **Protect approvals**

**Delta/KPIs:** Approval rate, decline rate, p95 latency, processor SLA, payment volume, revenue at risk, and operations time. Any approval or revenue improvement is a validation hypothesis.

## A3. Trace the Loss

**Target persona:** Fraud leader, Risk Operations, Fraud Analyst  
**Critical business issue:** Fraud loss is reported by type, while investigators need channel, merchant, device, account-age, and velocity context.  
**Solution:** Move from loss concentration to an evidence-rich segment for human investigation.  
**Capabilities:** Domain-grounded natural-language analysis, SQL execution, summary, chart, and data output.  
**Duration:** 5 minutes  
**Compatibility:** P1, P2, P3, P4, P5  
**Prerequisites:** Transactions, confirmed outcomes, loss amount, channel, fraud type, merchant, device, account age, velocity features, and case links.

**Opening Tell:** “Fraud reporting often says what type of loss occurred. Investigators need to know where it concentrates and which evidence explains the pattern.”

**Exact Show:**

1. Prompt: `Show confirmed fraud loss and false-positive rate by channel and fraud type for the last 30 days.`  
   Expected visible result: Channel-by-type view with one concentrated loss segment.
2. Prompt: `For the highest-loss segment, compare merchant, device reuse, account age, and 24-hour transaction velocity.`  
   Expected visible result: Ranked dimensions revealing a suspicious concentration.
3. Prompt: `List the cases in that segment with transaction IDs, loss, device count, account age, and velocity for investigator review.`  
   Expected visible result: Review queue or data table. No transaction is blocked or changed.

**Closing Tell:** “Aura assembled the segment and evidence. A fraud professional still decides what to investigate and what action is appropriate.”  
**Takeaway:** **Trace loss**

**Delta/KPIs:** Fraud loss, false-positive rate, investigation time, cases per analyst, time to isolate a pattern, and revenue protected. Loss reduction remains a hypothesis.

## A4. Alert-to-Evidence

**Target persona:** AML Operations, Compliance, Financial Crime  
**Critical business issue:** Reviewers spend time gathering transactions, entities, counterparties, and prior activity before they can assess an alert.  
**Solution:** Prioritize an alert cohort and assemble relevant evidence for human review.  
**Capabilities:** Natural-language query planning, SQL execution, Domain context, summaries, data, and charts.  
**Duration:** 5 minutes  
**Compatibility:** P3, P4, P5, P7  
**Prerequisites:** Alerts, rules, entities, accounts, transactions, counterparties, geographies, cases, and dispositions.

**Opening Tell:** “The goal is not to let software make a compliance decision. It is to reduce the time reviewers spend finding the evidence needed for one.”

**Exact Show:**

1. Prompt: `Show open AML alerts by age, rule, risk band, and assigned queue.`  
   Expected visible result: Backlog view with an aging or high-volume cohort.
2. Prompt: `For alerts older than seven days in the selected cohort, summarize transaction value, counterparties, geographies, and prior related alerts.`  
   Expected visible result: Comparative evidence table.
3. Action: Select one alert in the sample application.  
   Expected visible result: Alert details with linked transactions, entities, counterparties, and previous case outcomes. Label this consolidated case layout as custom UI.

**Closing Tell:** “The reviewer starts with assembled evidence and retains responsibility for disposition, escalation, and documentation.”  
**Takeaway:** **Faster evidence**

**Delta/KPIs:** Validate investigation time, alert backlog, alert age, cases per reviewer, evidence-gathering steps, escalation rate, and answer quality. Any improvement is a hypothesis until tested against the customer baseline.

## A5. Dispute Resolution Lens

**Target persona:** Disputes leader, Service Operations, Customer Care  
**Critical business issue:** Teams miss SLAs because queue drivers and customer timelines are split across case, transaction, and contact systems.  
**Solution:** Identify breach risk, explain the queue driver, and show one joined timeline.  
**Capabilities:** Natural-language analysis, execution, summary, data, and visualization.  
**Duration:** 5 minutes  
**Compatibility:** P1, P2, P7, P8  
**Prerequisites:** Disputes, SLA timestamps, status, reason, assignee, transactions, customer contacts, provisional credits, and outcomes.

**Opening Tell:** “A queue total does not explain which disputes will breach or what an agent must reconstruct. We will isolate the driver and open one complete timeline.”

**Exact Show:**

1. Prompt: `Show open disputes at risk of SLA breach in the next 24 hours by queue, reason, and age.`  
   Expected visible result: Ranked queues and breach-risk count.
2. Prompt: `What factors explain the largest at-risk queue compared with the prior 30 days?`  
   Expected visible result: Changes in reason mix, volume, assignment, or handling time.
3. Action: Open one dispute timeline.  
   Expected visible result: Joined transaction, dispute, contact, credit, and status events. Label timeline presentation as custom UI.

**Closing Tell:** “Operations sees where to intervene, while the agent gets the context needed to resolve the individual case.”  
**Takeaway:** **Resolve sooner**

**Delta/KPIs:** Handle time, SLA breaches, reopen rate, queue age, contacts per dispute, cost per case, and retention. Savings and retention effects require validation.

## A6. Liquidity Command Center

**Target persona:** Treasurer, Finance Operations, Payments Treasury  
**Critical business issue:** Cash positions, settlement flows, queued payments, and forecasts can diverge while teams reconcile separate reports.  
**Solution:** Present current positions and isolate the source of forecast variance or funding pressure.  
**Capabilities:** Domain-grounded questions, SQL execution, summary, table, and chart output.  
**Duration:** 5 minutes  
**Compatibility:** P2, P3, P5, P7, P8  
**Prerequisites:** Accounts, balances, settlement instructions, queued payments, cash flows, forecasts, currencies, entities, and timestamps.

**Opening Tell:** “Treasury needs the difference between expected and current cash while there is still time to manage it. We will locate one variance and its driver.”

**Exact Show:**

1. Prompt: `Show current cash position, expected settlements, queued payments, and available liquidity by entity and currency.`  
   Expected visible result: Position view with one constrained entity or currency.
2. Prompt: `Compare today's actual net flow with forecast and rank the drivers of the largest variance.`  
   Expected visible result: Variance chart and settlement or payment contributors.
3. Prompt: `Which queued payments fall inside the next funding window for that entity?`  
   Expected visible result: Authorized payment list with amount, currency, due time, and status. No payment is released or stopped.

**Closing Tell:** “Treasury sees the position, the variance, and the relevant queue without waiting for the next reconciliation cycle.”  
**Takeaway:** **See liquidity**

**Delta/KPIs:** Validate data freshness, forecast variance, queued value, reconciliation time, exception time, emergency funding cost, and missed-settlement risk. Cost and risk changes are hypotheses.

## A7. Credit Risk Pulse

**Target persona:** Credit Operations, Lending Risk, Portfolio Management  
**Critical business issue:** Applicant evidence and portfolio exposure are reviewed in separate tools, slowing assessment and masking concentration.  
**Solution:** Assemble application evidence and relate it to current portfolio concentration without making a credit decision.  
**Capabilities:** Natural-language analysis, Domain context, SQL execution, summary, data, and chart output.  
**Duration:** 5 minutes  
**Compatibility:** P3, P4, P5, P7  
**Prerequisites:** Applications, applicants, income and identity evidence, product, exposure, industry, geography, risk grade, and decision history.

**Opening Tell:** “Credit teams need both applicant evidence and portfolio context. This demonstration organizes those facts, but does not approve, decline, or price credit.”

**Exact Show:**

1. Prompt: `Show application volume, manual-review rate, and time to decision by product and channel for the last 30 days.`  
   Expected visible result: Operational view with one review-heavy segment.
2. Action: In **Recent applications**, click an application id (baseline
   `CAPP-A7B-…`, or after injection `CAPP-A7PE-0001`). Prompt: `Summarize the submitted evidence, verification results, requested exposure, and missing items for this application.`  
   Expected visible result: Evidence summary with source fields and missing items.
3. Prompt: `How would the requested exposure compare with current concentration by industry, geography, and risk grade?`  
   Expected visible result: Portfolio comparison, not a recommendation or decision.

**Closing Tell:** “The reviewer receives organized evidence and concentration context. The institution’s approved policy and accountable people govern the decision.”  
**Takeaway:** **Context, not decision**

**Delta/KPIs:** Validate review time, application backlog, manual-review rate, time to decision, missing-evidence rate, and portfolio concentration. Do not attribute approval-rate changes to Aura without a controlled test.

## A8. Explain My Money

**Target persona:** Fintech Product, App Engineering, Digital Experience  
**Critical business issue:** Customers want explanations grounded in their own activity, while product teams need an embeddable experience with scoped context.  
**Solution:** Stream an interactive answer through `/chat` using a customer-scoped Domain and continued session context.  
**Capabilities:** `/chat` SSE streaming, multi-turn sessions, Domain-scoped bearer key, and SQL/data/chart/text response types.  
**Duration:** 5 minutes  
**Compatibility:** P1, P5, P6, P7, P8  
**Prerequisites:** Embedded application, secure server-side API client, customer-scoped data design, conversation starters, session handling, and approved disclosures.

**Opening Tell:** “A premium analytics experience must explain the customer’s own money in context and fit inside the fintech application they already use.”

**Exact Show:**

1. Action: Sign in as the sample customer and open the embedded analyst panel. Label the panel shell as custom UI.  
   Expected visible result: Customer-specific conversation starters.
2. Prompt: `Why was my cash balance lower this month than last month?`  
   Expected visible result: Streaming text and supporting data or chart tied only to the sample customer’s authorized data.
3. Follow-up: `Which recurring categories contributed most, and what changed?`  
   Expected visible result: Session-aware comparison without restating the period or customer.
4. Action: Briefly show the network or developer panel receiving SSE events from `/chat`.  
   Expected visible result: Streamed response events and session continuity, with bearer key protected server-side.

**Closing Tell:** “The native API supplies streamed, contextual analysis. The fintech owns the product experience, entitlement model, disclosures, and customer actions.”  
**Takeaway:** **Embedded insight**

**Delta/KPIs:** Support deflection, engagement, retention, premium-tier adoption, API latency, completion rate, answer quality, and escalation rate. Monetization deltas require customer testing.

# Reusable proof modules

## P1. Conversational Drill-Down

**Target persona:** Business user, analyst, operations lead  
**Critical business issue:** First answers create follow-up questions that lose context in traditional reporting.  
**Solution:** Continue within a multi-turn Analyst session.  
**Capabilities:** Native multi-turn conversation and session context.  
**Opening Tell:** “The first answer rarely ends the analysis. Watch the follow-up retain the current subject and filters.”  
**Exact Show:** Ask the anchor’s first question, then `Break that down by channel` or `Only show the last seven days.` Expected: refined result without restating the full question.  
**Closing Tell:** “The analysis continues as a conversation rather than a new ticket.”  
**Takeaway:** **Keep context**  
**Delta/KPIs:** Validate follow-up cycle time, analyst tickets, and questions per session. Business improvement is a hypothesis.  
**Duration:** 2 minutes  
**Prerequisites:** Active session and deterministic follow-up.  
**Compatibility:** All anchors.

## P2. Live Event Impact

**Target persona:** Operations, finance, platform  
**Critical business issue:** A committed event may remain invisible until a downstream batch completes.  
**Solution:** Write or update a safe sample event, then re-ask the same question.  
**Capabilities:** Live queryability from the SingleStore foundation; Analyst queries the updated data.  
**Opening Tell:** “The proof is not a new prompt. It is whether the same question reflects a newly committed event.”  
**Exact Show:** Record baseline result. Insert or update one labeled demo event. Re-run the exact prompt. Expected: count, amount, or cohort changes by the known event value.  
**Closing Tell:** “SingleStore made the committed data queryable, and Analyst reflected it in the next answer.”  
**Takeaway:** **Current data**  
**Delta/KPIs:** Observe event-to-query time in the demo. Treat broader freshness and stale-report improvement as hypotheses.  
**Duration:** 2 minutes  
**Prerequisites:** Resettable write path, visible timestamp, deterministic delta.  
**Compatibility:** A1, A2, A3, A5, A6.

## P3. Transparent Answer

**Target persona:** Risk, compliance, data, engineering  
**Critical business issue:** Reviewers need to inspect how a result was produced.  
**Solution:** Expose native SQL or query details that are actually available. Label added confidence, lineage, source, or trace UI as custom.  
**Capabilities:** Generated SQL and returned data where exposed; custom panels may present additional metadata.  
**Opening Tell:** “A consequential answer must be inspectable. We will show the evidence the environment actually exposes.”  
**Exact Show:** Open generated SQL or response details. Run the query in a read-only console if appropriate. Show source tables only if the app implements that mapping. Expected: consistent query and result.  
**Closing Tell:** “The answer can be inspected without implying controls or lineage that the environment does not implement.”  
**Takeaway:** **Inspect the answer**  
**Delta/KPIs:** Validate review time, answer acceptance, defect rate, and answer quality. Improvement is a hypothesis.  
**Duration:** 2 minutes  
**Prerequisites:** SQL display, read-only access, tested result.  
**Compatibility:** A2, A3, A4, A6, A7.

## P4. Governed Business Context

**Target persona:** Data owner, governance lead, analytics engineering  
**Critical business issue:** Raw schemas do not encode approved metrics, terms, or relationships.  
**Solution:** Use a reviewed Domain with approved instructions, descriptions, relationships, and saved logic.  
**Capabilities:** Native Domain context and configured Aura access. Governance review and approval are customer processes.  
**Opening Tell:** “Good answers start with governed meaning, not only table names.”  
**Exact Show:** Open the Domain. Point to one metric definition, one relationship, and one instruction. Ask a term-dependent prompt. Expected: result follows the configured definition.  
**Closing Tell:** “The Domain gives Analyst approved business meaning, while owners retain review responsibility.”  
**Takeaway:** **Governed meaning**  
**Delta/KPIs:** Validate answer quality, metric disputes, correction rate, and onboarding time. Improvement is a hypothesis.  
**Duration:** 3 minutes  
**Prerequisites:** Reviewed Domain and quality test set.  
**Compatibility:** All anchors, especially A1, A4, A7.

## P5. Scoped Access

**Target persona:** Security, platform, risk, compliance  
**Critical business issue:** Analytical access must follow authorized roles and Domain boundaries.  
**Solution:** Demonstrate a role or Domain-scoped user story and Domain-scoped bearer key. Do not claim row-level behavior unless implemented and tested.  
**Capabilities:** Aura access controls and Domain-scoped API keys. Application entitlements remain custom.  
**Opening Tell:** “A useful answer is only acceptable when the user and integration are authorized for its Domain.”  
**Exact Show:** Use two prepared identities or keys. Ask the same question. Expected: each sees only configured Domains or the unauthorized request fails.  
**Closing Tell:** “The demonstration proves the configured scope, not controls that were not implemented.”  
**Takeaway:** **Scoped access**  
**Delta/KPIs:** Record unauthorized-response test results. Treat access-review effort and security-defect changes as hypotheses.  
**Duration:** 2 minutes  
**Prerequisites:** Tested identities, keys, failure path, no secrets on screen.  
**Compatibility:** A3, A4, A7, A8.

## P6. Embedded Streaming

**Target persona:** Product, App Engineering  
**Critical business issue:** Customer-facing chat needs responsive streaming and session continuity inside an existing app.  
**Solution:** Use `/chat` with SSE, multi-turn sessions, and conversation starters.  
**Capabilities:** Native `/chat`, SSE, session continuity, and response content; application rendering and telemetry are custom.  
**Opening Tell:** “The product team should not have to recreate the analytical conversation layer to embed it.”  
**Exact Show:** Send a request from the sample app. Display streamed tokens or events. Send a follow-up in the same session. Expected: progressive response and retained context.  
**Closing Tell:** “Aura supplies the stream and session. The application controls experience, security integration, and actions.”  
**Takeaway:** **Stream in app**  
**Delta/KPIs:** Measure response latency. Treat session completion and engineering-effort changes as hypotheses.  
**Duration:** 3 minutes  
**Prerequisites:** Server-side token handling, SSE client, error and timeout states.  
**Compatibility:** A8 and embedded variants of any anchor.

## P7. Structured Integration

**Target persona:** App Engineering, Data Platform, Operations  
**Critical business issue:** Workflows and pipelines need predictable response objects rather than a chat-only experience.  
**Solution:** Call `/query` and consume structured JSON containing available SQL, data, chart, and text outputs.  
**Capabilities:** Native `/query` structured response. Workflow routing, scheduling, and persistence are custom.  
**Opening Tell:** “The same analytical service can support an application workflow or pipeline through structured output.”  
**Exact Show:** Submit one anchor prompt to `/query`. Expand the JSON fields. Render one returned element in the sample app. Expected: structured response mapped into the workflow.  
**Closing Tell:** “The API returns integration-ready analytical output. The customer application decides what to store or trigger.”  
**Takeaway:** **Structured output**  
**Delta/KPIs:** Measure API latency and errors. Treat integration-cycle and manual-step changes as hypotheses.  
**Duration:** 3 minutes  
**Prerequisites:** API client, masked key, schema handling, tested response.  
**Compatibility:** A2, A4, A5, A6, A7, A8.

## P8. Reusable Decision View

**Target persona:** Business lead, operations, product  
**Critical business issue:** Important questions recur and need a stable place in a workflow.  
**Solution:** Save a prompt or result as a custom application card, report, or workflow view.  
**Capabilities:** Analyst supplies the answer. Persistence, sharing, scheduling, and workflow state are custom unless explicitly implemented through the user application.  
**Opening Tell:** “Some questions are recurring. The application can turn the approved prompt into a reusable decision view.”  
**Exact Show:** Save or open a prepared report card, run it, and change one parameter. Expected: refreshed chart or table. Clearly label app-owned persistence.  
**Closing Tell:** “Aura produces the analysis; the application makes it repeatable for this workflow.”  
**Takeaway:** **Reuse the question**  
**Delta/KPIs:** Measure usage. Treat ticket, preparation-time, and adoption changes as hypotheses.  
**Duration:** 3 minutes  
**Prerequisites:** Implemented storage and clear ownership label.  
**Compatibility:** A1, A5, A6, A8.

# Assembly recipes

Each recipe includes fixed module time plus framing, dialogue, and the final stage gate. The totals below are exact. For a five-minute teaser, use the listed three-minute anchor cut rather than the full five-minute anchor.

## Duration patterns

| Format | Exact time | Module pattern | Stage-gate question |
|---|---:|---|---|
| Executive teaser | 1 framing + 3 anchor cut + 1 close = 5 min | One shortened anchor | “Is this outcome material enough to baseline?” |
| Business demo | 1 framing + 5 anchor + 2 proof + 1 dialogue + 1 gate = 10 min | Anchor + P1, P2, P3, or P5 | “Which KPI and owner should validate this with your data?” |
| Balanced demo | 1 framing + 5 anchor + 2 proof + 3 proof + 3 dialogue + 1 gate = 15 min | Anchor + one 2-minute proof + one 3-minute proof | “Can we schedule a joint value and data workshop?” |
| Workflow demo | 2 framing + 10 two anchors + 2 proof + 3 proof + 6 dialogue + 2 gate = 25 min | Two anchors + one 2-minute proof + one 3-minute proof | “Will you name the workflow and data owners for a scoped validation?” |
| Embedded deep dive | 3 framing + 10 two anchors + 4 two 2-minute proofs + 9 three 3-minute proofs + 11 architecture/Q&A + 3 gate = 40 min | Two anchors + four proofs | “Can we agree API, security, quality, and latency criteria for a build session?” |

## Persona and use-case recipes

Entries list modules only. Parentheses show module minutes. Add the overhead from the duration pattern to reach the stated total.

| Use case | 5 min | 10 min | 15 min | 25 min | 40 min |
|---|---|---|---|---|---|
| Digital journey / onboarding | A1 cut (3) | A1 + P1 (7) | A1 + P1 + P4 (10) | A1 + A8 + P1 + P8 (15) | A1 + A8 + P1 + P2 + P4 + P6 (20) |
| Payments | A2 cut (3) | A2 + P1 (7) | A2 + P2 + P7 (10) | A2 + A3 + P2 + P7 (15) | A2 + A3 + P2 + P3 + P6 + P7 (20) |
| Fraud investigation | A3 cut (3) | A3 + P3 (7) | A3 + P3 + P4 (10) | A3 + A4 + P3 + P4 (15) | A3 + A4 + P2 + P3 + P4 + P5 (19) |
| AML | A4 cut (3) | A4 + P5 (7) | A4 + P5 + P7 (10) | A4 + A3 + P5 + P7 (15) | A4 + A3 + P3 + P4 + P5 + P7 (20) |
| Disputes | A5 cut (3) | A5 + P1 (7) | A5 + P1 + P8 (10) | A5 + A2 + P1 + P8 (15) | A5 + A2 + P1 + P2 + P7 + P8 (20) |
| Treasury | A6 cut (3) | A6 + P2 (7) | A6 + P2 + P7 (10) | A6 + A7 + P2 + P7 (15) | A6 + A7 + P2 + P3 + P5 + P7 (19) |
| Credit | A7 cut (3) | A7 + P3 (7) | A7 + P3 + P4 (10) | A7 + A6 + P3 + P4 (15) | A7 + A6 + P3 + P4 + P5 + P7 (20) |
| Embedded customer analytics | A8 cut (3) | A8 + P1 (7) | A8 + P1 + P6 (10) | A8 + A1 + P1 + P6 (15) | A8 + A1 + P1 + P5 + P6 + P7 (20) |

The 40-minute pattern reserves 20 or 21 minutes for modules and 19 or 20 minutes for framing, architecture, Q&A, and the gate. Never cut the final gate. If a prerequisite is not ready, remove the dependent proof and use the time for validated material.

# Persona-based module chooser

1. **What decision is delayed?** Growth: A1. Payments: A2. Fraud: A3. AML: A4. Disputes: A5. Liquidity: A6. Credit: A7. Customer experience: A8.
2. **What doubt may block progress?** Conversation: P1. Freshness: P2. Inspectability: P3. Meaning: P4. Access: P5. Streaming: P6. Integration: P7. Reuse: P8.
3. **Who owns the KPI?** If unknown, use a five-minute teaser and make KPI ownership the stage gate.
4. **Is a regulated decision involved?** Add P3, P4, or P5. State human accountability before the Show.
5. **Is the experience embedded?** Use A8 with P6. Add P7 only when structured workflow output matters.
6. **Is the customer asking for a dashboard?** Start with the business decision, not the dashboard. Use P8 only after the anchor proves the question.

# Use-case coverage matrix

| Anchor | P1 | P2 | P3 | P4 | P5 | P6 | P7 | P8 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A1 Digital Journey | Primary | Primary | Optional | Primary | Optional | Optional | Optional | Primary |
| A2 Payment Pulse | Primary | Primary | Primary | Optional | Optional | Optional | Primary | Optional |
| A3 Trace the Loss | Primary | Primary | Primary | Optional | Primary | Optional | Optional | Optional |
| A4 Alert-to-Evidence | Optional | Optional | Primary | Primary | Primary | Optional | Primary | Optional |
| A5 Dispute Lens | Primary | Primary | Optional | Optional | Optional | Optional | Optional | Primary |
| A6 Liquidity | Optional | Primary | Optional | Optional | Primary | Optional | Primary | Primary |
| A7 Credit Risk | Optional | Optional | Primary | Primary | Primary | Optional | Optional | Optional |
| A8 Explain My Money | Primary | Optional | Optional | Primary | Primary | Primary | Primary | Primary |

# Value and delta measurement worksheet

Use customer data where possible. A target is a hypothesis until the customer approves the baseline, method, and evidence.

| KPI | Baseline | Target hypothesis | Evidence owner | Validation method |
|---|---|---|---|---|
| Question-to-answer cycle time | ___ | ___ | Analytics lead | Timestamp request through accepted answer |
| Analyst/report tickets | ___ per month | ___ | BI manager | Ticket-system comparison |
| Data freshness | ___ | ___ | Data platform | Source event to query-visible timestamp |
| Conversion | ___% | ___% | Digital owner | Controlled journey cohort |
| Approval rate | ___% | ___% | Payments owner | Matched period and segment analysis |
| False-positive rate | ___% | ___% | Fraud owner | Confirmed outcome comparison |
| Fraud loss | ___ | ___ | Fraud finance | Loss by equivalent volume and channel |
| Investigation time | ___ | ___ | Fraud/AML ops | Sampled case time study |
| Alert backlog | ___ | ___ | AML ops | Queue snapshot over agreed period |
| Dispute handle time | ___ | ___ | Service ops | Case-system timestamps |
| SLA breaches | ___ | ___ | Operations | Breach count and rate |
| Forecast variance | ___% | ___% | Treasury | Forecast versus actual by horizon |
| Emergency funding cost | ___ | ___ | Treasury finance | Funding events and rate differential |
| Support deflection | ___% | ___% | Support/product | Eligible contacts versus self-service sessions |
| Engagement | ___ | ___ | Product analytics | Active use and repeat sessions |
| Premium-tier adoption | ___% | ___% | Product/finance | Eligible account conversion |
| API latency | p50 ___ / p95 ___ | ___ | Engineering | Instrumented `/chat` and `/query` tests |
| Answer quality | ___% accepted | ___ | Domain owner | Golden questions, review rubric, correction log |

### Value formulas

- Productivity hypothesis: `(baseline time - target time) × annual volume × loaded hourly cost`.
- Revenue hypothesis: `eligible volume × proposed rate change × unit contribution`.
- Risk hypothesis: `(baseline incident rate - target rate) × exposure`, adjusted for confidence and attribution.
- Funding hypothesis: `avoidable emergency balance × rate differential × duration`.
- Monetization hypothesis: `eligible accounts × premium adoption change × annual price`, net of support and delivery cost.

Do not present formula outputs as commitments. Record assumptions, sensitivity, owner, and validation date.

# Demo build requirements and data model

## Shared build requirements

- One resettable dataset with event timestamps near the demo date.
- Deterministic prompts and expected results stored in a test pack.
- Separate Domains for digital, payments, fraud, AML, disputes, treasury, credit, and customer-facing analytics.
- Business descriptions, relationships, metric definitions, synonyms, and exclusions reviewed by a named owner.
- Read-only Analyst access for standard modules.
- Safe, reversible write fixture for P2.
- Server-side API proxy. Never expose bearer keys in browser code or recordings.
- `/chat` SSE handling, session continuity, timeout, cancellation, and error states.
- `/query` schema handling for SQL, data, chart, and text fields actually returned.
- Clear UI badges: “Native Aura Analyst,” “Analyst API,” “SingleStore foundation,” and “Sample app.”
- Synthetic data with no customer or employee personal data.
- Performance telemetry for API and database timings.
- Quality suite covering expected, ambiguous, unsupported, and unauthorized questions.

## Data model objects by module

| Module | Required objects | Important relationships and derived logic |
|---|---|---|
| A1 | customer, account, product, login_event, page_view, application, journey_event, review_event | Identity across authenticated behavior and relationships; funnel step order; completion and abandonment |
| A2 | authorization, payment, merchant, processor, rail, response_code, settlement | Approval definition; latency percentiles; baseline period; decline grouping |
| A3 | transaction, fraud_outcome, fraud_case, device, merchant, account | Confirmed loss; false positive; device reuse; account age; velocity windows |
| A4 | aml_alert, rule, entity, account, transaction, counterparty, case, disposition | Alert age; related entity and alert logic; geography and counterparty summaries |
| A5 | dispute, queue, transaction, customer_contact, provisional_credit, case_event | SLA deadline; breach risk; joined event timeline; handle time |
| A6 | cash_account, balance, settlement_flow, payment_queue, forecast, currency, legal_entity | Available liquidity; net flow; forecast variance; funding window |
| A7 | application, applicant, evidence, verification, exposure, portfolio_position, industry, geography, risk_grade | Missing evidence; concentration; requested versus current exposure |
| A8 | customer, account, transaction, category, recurring_item, entitlement, conversation_session | Customer scope; period comparison; category change; session continuity |

# Native capability versus demo-app implementation

| Experience | Native Aura Analyst or API | SingleStore foundation | Demo app or customer implementation |
|---|---|---|---|
| Natural language to SQL | Yes | Executes SQL | Renders prompt and response |
| Intent interpretation, planning, validation | Yes | Supplies governed data | May expose status or simplified steps |
| Summary, data, chart, text output | Yes, subject to endpoint response | Supplies query result | Chooses presentation |
| Domain business context | Yes | Stores source data | Domain authoring workflow may add governance process |
| Access controls | Yes, configured access | Database controls also apply | Identity mapping and entitlements |
| Quality monitoring | Native capability | N/A | Custom dashboards may summarize results |
| Multi-turn session | Yes | N/A | Session storage and user experience |
| `/chat` SSE | Yes | N/A | SSE client, retry, cancellation, rendering |
| `/query` structured JSON | Yes | N/A | Parsing, routing, persistence, scheduling |
| Domain-scoped bearer key | Yes | N/A | Secret management and server-side proxy |
| Newly committed data queryability | Analyst reflects it | Core foundation proof | Write button and reset workflow |
| Generated SQL display | Where exposed | Can validate query | Custom SQL panel if implemented |
| Confidence score | Do not assume | N/A | Custom unless documented and implemented |
| End-to-end lineage | Do not assume | Metadata may exist separately | Custom integration unless implemented |
| Trace ID panel | Do not assume | Platform telemetry may exist | Custom unless returned and displayed |
| Saved report card | Analyst supplies result | Stores underlying data | Persistence and card UI are custom |
| Scheduling or alerts | Not implied by Analyst API | External scheduler may call APIs | Customer or sample-app implementation |
| Workflow action | No automatic business action | Database may store action state | Customer application and approval controls |
| Row-level customer behavior | Do not claim by default | Possible with designed controls | Must be explicitly implemented and tested |

# Regulated-workflow guardrails and claim language

| Topic | Use this language | Avoid |
|---|---|---|
| Fraud | “Aura helps investigators find patterns and assemble evidence.” | Claims that Aura directly stops a transaction |
| AML | “Aura supports alert prioritization and human review.” | “Aura clears alerts automatically.” |
| Credit | “Aura organizes applicant evidence and portfolio context.” | “Aura makes credit decisions.” |
| Audit | “The answer can be inspected using the SQL and metadata this environment exposes.” | Claims of formal audit suitability without validation |
| Autonomy | “The application may route a result into an approved workflow.” | Claims that the system makes decisions without accountable review |
| Confidence | “This confidence indicator is a sample-app element,” if true. | Presenting custom confidence as native |
| Lineage | “The app displays configured source mappings,” if true. | Claiming native end-to-end lineage without proof |
| Access | “This demo proves the configured Domain and role scope.” | Claiming row-level isolation without implementation |
| Freshness | “The committed event was queryable in the next request.” | Universal latency promises from one demo |
| Outcomes | “This delta is a hypothesis to validate against your baseline.” | Guaranteed savings, uplift, or loss reduction |
| Preview | “Aura Analyst and its API are Preview. We will confirm production requirements.” | Implying full production readiness without review |

### Presenter guardrails

- Use synthetic identities and masked account numbers.
- Never expose bearer keys, connection strings, or internal URLs.
- Predefine which questions are unsupported and demonstrate a safe response if asked.
- Do not let a generated answer directly trigger payments, transaction blocks, alert dispositions, filings, credit decisions, or customer communications.
- Keep accountable human approval visible in risk and compliance flows.
- State that legal, compliance, security, and model-risk teams define deployment controls.
- Separate observed technical behavior from projected business impact.

# Demo readiness checklist

## Story and value

- [ ] Customer GIO is written in one sentence.
- [ ] Primary persona, business issue, and KPI owner are known.
- [ ] One anchor and no more than necessary proofs are selected.
- [ ] Opening Tell references discovery or a bounded hypothesis.
- [ ] Closing Tell and one-to-three-word takeaway are rehearsed.
- [ ] Numeric deltas are labeled as observed behavior or hypotheses.
- [ ] Final stage gate has an owner and proposed date.

## Data and Domain

- [ ] Data is synthetic, current, complete, and resettable.
- [ ] Joins, metric definitions, time zones, currencies, and status definitions are tested.
- [ ] Domain descriptions, instructions, relationships, and saved logic are reviewed.
- [ ] Golden prompts return expected results.
- [ ] Ambiguous, unsupported, and adversarial prompts have safe outcomes.
- [ ] Quality-monitoring results meet the demo threshold.

## API and application

- [ ] `/chat` streaming and session continuity work.
- [ ] `/query` response parsing handles available output types.
- [ ] Keys are Domain-scoped, protected server-side, and absent from logs and screen captures.
- [ ] Timeouts, empty results, errors, and retries have presentable states.
- [ ] Native, foundation, and sample-app elements are visibly labeled.
- [ ] P2 write path is reversible and isolated.
- [ ] API latency is measured rather than claimed.

## Delivery

- [ ] Timing includes context, proof, dialogue, and stage gate.
- [ ] Presenter can recover using screenshots or recorded outputs.
- [ ] Browser, zoom, notifications, credentials, and sample identity are prepared.
- [ ] Regulated-workflow disclaimer is included where relevant.
- [ ] No prohibited claims appear in slides, data, UI, or talk track.

# Demo Crimes self-check

Score one point for each “yes.” Zero to two is ready. Three to five requires edits. Six or more requires a rebuild.

- [ ] **So What?** Did I show a feature without business impact?
- [ ] **Show-Tell-Tell.** Did I click before framing the problem?
- [ ] **Whole Meal.** Did I include modules without a known buyer need?
- [ ] **I Love This Part.** Did presenter preference drive scope?
- [ ] **Lost Leading Lost.** Is the route or expected result unclear?
- [ ] **Teaching.** Did I turn persuasion into product training?
- [ ] **Technobabble.** Did jargon replace buyer language?
- [ ] **Ugly Baby.** Did I apologize for Preview status or the UI?
- [ ] **Field by Field.** Did I inspect every control instead of one proof?
- [ ] **Presentation Crutch.** Did slides replace the live proof?

Add four fintech checks:

- [ ] Did I imply a regulated decision without human review?
- [ ] Did I blur native Aura and custom application behavior?
- [ ] Did I state a numeric outcome as fact without evidence?
- [ ] Did I end without a stage gate?

# Recommended next stage gates

| Gate | When to use | Customer commitment | SingleStore output |
|---|---|---|---|
| GIO validation | Early discovery | Confirm priority, urgency, sponsor, and decision | One-page GIO and problem statement |
| Value baseline workshop | Business interest exists | Provide KPI owner and baseline data | Value hypothesis and measurement plan |
| Data and Domain workshop | Use case selected | Provide schema owners, definitions, and sample data | Domain map and golden questions |
| Regulated workflow review | Risk, AML, or credit involved | Include compliance, security, and accountable owner | Guardrail and approval design |
| Architecture review | Platform team engaged | Share integration, identity, network, and latency requirements | Target architecture and gap list |
| API build session | Embedded use case selected | Provide developer and product owner | Working `/chat` or `/query` thin slice |
| Scoped validation | Material value and fit | Approve success criteria, dataset, owners, and timeline | Measured technical and business results |
| Executive readout | Validation completed | Economic buyer reviews evidence and options | Outcome, risks, economics, and recommendation |
| Mutual action plan | Decision path confirmed | Agree milestones, owners, and dates | Joint path to decision |

### Default closing questions

- Business: “Which decision and KPI should we validate first with your data?”
- Risk: “Who owns the human review and evidence standard for this workflow?”
- Technical: “Can we agree the Domain, API, access, latency, and quality criteria for a thin slice?”
- Executive: “If the hypothesis is validated, what initiative, funding path, and decision date does it support?”

# Sources

- [United Bank sales and account plan](https://docs.google.com/document/d/1Tlmk_XMbv8IlMAB1Vr-sdqXI3HLP0J2WgI37Iug_4Zo)
- [Socure account plan](https://docs.google.com/document/d/1EMmNLhhDQ1dyvvJ1t-fKSyupiXkEmkj2nnRMxrPW00k)
- [Aura Analyst overview](https://docs.singlestore.com/cloud/ai/aura-analyst/)
- [Aura Analyst API](https://docs.singlestore.com/cloud/ai/aura-analyst/aura-analyst-api/)
- [Demo best practices and Demo2Win guidance](https://docs.google.com/presentation/d/1FVWUNaHsBClcx08k3wvS-h7xHs9v_yfLUfHHjifWTXE)
- [Finance modular demo precedent](https://docs.google.com/presentation/d/18HZhn4zwCiDTiBwtU2as6Bfpg7uW4Pwl65batOyr19g)
- [SingleStore fintech and payment processing](https://www.singlestore.com/solutions/financial-services/fintech-and-payment-processing/)
