# Fintech Aura Analyst Modular Demo: Technical Specification

Status: Build specification  
Audience: Demo engineers, solution engineers, value engineers, and technical reviewers  
Application form: One modular fintech application with persona and anchor switching  
Stack: Next.js, FastAPI, SingleStore, Aura Analyst API  
Data: Synthetic only, continuously generated, deterministic, and resettable  
Product status: Aura Analyst and the Analyst API are Preview features

## 1. Purpose

Build one reusable fintech application that can demonstrate eight Aura Analyst anchor stories without maintaining eight separate demos. The presenter selects a persona and anchor, injects a controlled business event, investigates the resulting change with Aura Analyst, and resets the environment to a known baseline.

The system must support short and long demo paths. A five-minute path uses one dashboard, one event, and one Aura question. A deeper session adds entity details, generated SQL, Domain context, access boundaries, the streaming API, and architecture.

### 1.1 Key design decision

Use one application, one synthetic data platform, and one control plane. Implement each anchor as configuration plus anchor-specific views, prompts, visual components, and scenario fixtures.

### 1.2 Success criteria

The build is complete when a presenter can:

* Select any of the eight anchors and its target job title.
* Establish a stable baseline within ten seconds.
* Start, pause, accelerate, and resume a continuous synthetic event stream.
* Inject a named scenario and see its expected metric changes within two refresh intervals.
* Ask a prepared question through Aura Analyst and continue with a contextual follow-up.
* Inspect supporting data and generated SQL when enabled.
* Reset all application data and presentation state to the same baseline within 30 seconds.
* Run a five, ten, fifteen, twenty-five, or forty-minute demo from the same build.
* Continue the presentation in fixture mode if the live Analyst API is unavailable.
* Avoid exposing credentials or implying that Aura makes regulated decisions.

## 2. Scope

### 2.1 In scope

* Next.js web application with persona and anchor switching.
* FastAPI application API and server-side Aura Analyst integration.
* Separate Python simulator process using the FastAPI codebase and models.
* SingleStore schema, seed data, curated analytical views, and control tables.
* Eight anchor modules and reusable proof components.
* Continuous synthetic event generation.
* Deterministic scenario injection and reset.
* Aura Analyst Domain setup, context, keys, prompts, and validation.
* Live and fixture modes.
* Local Docker Compose and one hosted deployment pattern.
* Observability, security controls, automated tests, and presentation runbook.

### 2.2 Out of scope

* Production customer data.
* Production-grade financial decisioning or transaction processing.
* Automated fraud, AML, credit, dispute, payment, or treasury actions.
* Regulatory certification.
* Model training or fine-tuning.
* Automated creation or editing of Aura Analyst Domain context. Public context-management APIs are not currently documented, so Domain setup remains a Creator Mode procedure.
* Enterprise identity integration beyond a simple protected demo deployment.
* Exact customer ROI claims. Business deltas remain hypotheses until customer baselines are validated.

## 3. Anchor catalog

| ID | Anchor | Target job title | Critical decision | Primary value |
|---|---|---|---|---|
| A1 | Digital Journey Intelligence | Head of Digital Banking | Where is digital conversion being lost, and which cohort is affected? | Revenue and operating cost |
| A2 | Payment Pulse | Head of Payments | Where did approval performance or latency change? | Revenue, cost, and operational risk |
| A3 | Trace the Loss | VP of Fraud Strategy | Which segments explain confirmed loss and false positives? | Risk, cost, and revenue protection |
| A4 | Alert-to-Evidence | Head of AML Operations | Which alert cohorts need attention, and what evidence is available? | Risk and operating cost |
| A5 | Dispute Resolution Lens | VP of Disputes Operations | Which queues will breach SLA, and what explains the pressure? | Cost, risk, and retention |
| A6 | Liquidity Command Center | Corporate Treasurer | Where is near-term funding pressure forming? | Funding cost and settlement risk |
| A7 | Credit Risk Pulse | Chief Credit Officer | What evidence and portfolio concentration should a reviewer consider? | Revenue, cost, and risk |
| A8 | Explain My Money | Chief Product Officer | How can a customer receive a useful, scoped explanation inside the product? | Engagement, monetization, and support deflection |

## 4. User roles and persona switching

Persona switching changes presentation language, default anchor, starter questions, visible KPI emphasis, and optional technical detail. It does not silently weaken server-side authorization.

| Application role | Purpose | Available controls |
|---|---|---|
| Presenter | Runs the customer demonstration | Switch persona and anchor, inject, pause, change speed, reset, start new chat |
| Business viewer | Views business outcome path | Dashboard, investigation, source summary |
| Risk viewer | Views evidence and guardrails | Dashboard, evidence, SQL, freshness, human-ownership labels |
| Technical viewer | Reviews implementation | All viewer pages plus architecture, traces, health, Domain metadata |
| Demo administrator | Prepares and repairs environment | Seed, reset, fixture mode, key health, scenario configuration |

For a field demo, the presenter uses an authenticated administrator session. Persona switching is a presentation control, not an identity impersonation mechanism.

## 5. Page and route specification

### 5.1 Shared application shell

Every page uses the same shell:

* Top bar: application name, synthetic-data badge, live or fixture badge, stream status, logical time, data freshness, and health indicator.
* Left navigation: Home, eight anchors, Architecture, and Demo Health.
* Persona selector: business, risk, technical, or the anchor's specific job title.
* Anchor selector: A1 through A8.
* Scenario control drawer: pause or resume, speed, inject, reset, and seed.
* Aura Analyst drawer: conversation starters, chat history for the current anchor, new session, and optional SQL or data tabs.
* Footer: Preview notice, synthetic-data notice, and “human decision required” notice for regulated workflows.

### 5.2 Route inventory

| Route | Page | Required behavior |
|---|---|---|
| `/` | Demo Launchpad | Select persona, anchor, and demo length. Show environment readiness and recommended script. |
| `/demo/[anchor]` | Anchor Overview | Render anchor KPI cards, primary visualization, change indicator, and opening prompt. |
| `/demo/[anchor]/investigate` | Investigation Workspace | Combine filters, Aura conversation, result visualization, SQL disclosure, and evidence table. |
| `/demo/[anchor]/entity/[entityType]/[entityId]` | Entity Detail | Render the selected application, payment segment, case, alert, dispute, entity, or customer timeline. |
| `/demo/a8/customer/[customerId]` | Embedded Customer Experience | Customer-scoped “Explain My Money” UI with no presenter-only controls in the customer frame. |
| `/architecture` | Technical Architecture | Show live component status, request path, Domain mapping, current trace ID, and native versus custom boundaries. |
| `/admin/scenarios` | Scenario Console | List scenarios, expected deltas, active run, seed, stream controls, and reset history. |
| `/admin/domain-check` | Aura Readiness | Validate endpoint, key status, starter prompts, known questions, output shapes, and table access. Never display secrets. |
| `/admin/data` | Data Inspector | Show table counts, active run, logical clock, watermarks, and baseline checksums. |
| `/admin/health` | Demo Health | Show web, API, simulator, SingleStore, Aura, and fixture status with recovery actions. |

### 5.3 Launchpad

Required components:

* Eight anchor cards with job title, critical issue, three-word takeaway, and estimated duration.
* Persona filter.
* Demo-length selector: 5, 10, 15, 25, or 40 minutes.
* “Start clean” action that performs a global data reset, selects the requested anchor, and starts a new Aura session.
* Environment readiness list.
* Module recipe generated from the selected duration.

Acceptance:

* Starting an anchor routes to its baseline Overview after the global reset completes.
* Reset is global because all curated views share one active run. The UI must say “Reset entire demo,” not “Reset anchor.”
* A failed dependency blocks live mode but allows an explicit switch to fixture mode.

### 5.4 Anchor Overview template

All eight anchor dashboards use the same layout contract:

* Situation strip: job title, critical business issue, customer-provided critical date or “Not yet qualified,” and delta hypothesis.
* Four KPI cards.
* One primary time-series or funnel visualization.
* One ranked driver visualization.
* “What changed?” callout tied to the active scenario.
* Prepared question buttons.
* “Investigate with Aura” action.
* Last refresh, data watermark, and logical clock.

Widgets use FastAPI endpoints backed by deterministic SQL for immediate rendering. Aura `/query` can be enabled as a proof mode for selected widgets, but page availability must not depend on an LLM call.

### 5.5 Investigation Workspace

Required panels:

* Question composer and conversation starters.
* Streaming answer area.
* Table and Plotly chart renderer.
* Generated SQL disclosure.
* Tables-used list and confidence score when returned.
* Evidence or source-row table.
* Trace ID, duration, and completion status.
* Follow-up prompts using the same Aura `session_id`.
* “New investigation” control that clears local state and omits `session_id` on the next request.

The UI must distinguish these states: idle, connecting, streaming, complete, failed, cancelled, timed out, empty result, and fixture response.

### 5.6 Entity Detail template

Entity pages use an anchor-specific summary plus a common event timeline. Every value must show its source table or event type on hover or in a details panel.

* A1: application journey and manual-review timeline.
* A2: affected payment segment and sampled authorization events.
* A3: fraud case, transactions, devices, evidence, and human disposition.
* A4: AML alert, entities, counterparties, transactions, evidence gaps, and prior cases.
* A5: dispute case, transaction, contact, credit, status, and SLA timeline.
* A6: entity and currency position, settlements, queued payments, and forecast drivers.
* A7: application evidence and current portfolio concentration.
* A8: customer transactions supporting the explanation.

### 5.7 Architecture page

Show the actual runtime path:

`Browser -> Next.js -> FastAPI -> Aura Analyst API -> SingleStore Domain views`

Also show:

* Browser -> FastAPI -> deterministic widget queries -> SingleStore.
* Simulator -> SingleStore event and control tables.
* Domain name and selected anchor, but never the API key.
* Last `singlestore-trace-id`.
* Live versus fixture mode.
* Native capabilities: Domain context, natural language to SQL, execution, structured output, chart output, SSE, sessions.
* Custom capabilities: page UI, scenario engine, reset, saved demo state, authentication, telemetry, and workflow controls.

## 6. Frontend specification

### 6.1 Technology

* Next.js with the App Router.
* TypeScript with strict mode.
* React Server Components for static shell and configuration reads.
* Client components for charts, SSE, filters, and scenario controls.
* A stable component library selected by the implementation team.
* Plotly.js for native Aura chart JSON. Use a second chart library only if existing company standards require it.
* TanStack Query or equivalent for deterministic API state.
* Zod or equivalent for browser-side validation of backend responses.

Lock exact package versions in the repository lockfile. Do not use floating versions.

### 6.2 Frontend module model

Each anchor exports an `AnchorDefinition`:

```ts
export interface AnchorDefinition {
  id: "a1" | "a2" | "a3" | "a4" | "a5" | "a6" | "a7" | "a8";
  name: string;
  jobTitle: string;
  criticalBusinessIssue: string;
  takeaway: string;
  domainKey: string;
  overviewWidgets: WidgetDefinition[];
  primaryScenarioId: string;
  starterPrompts: string[];
  entityTypes: string[];
  guardrailText: string;
}
```

A widget definition includes ID, title, metric format, backend route, visualization type, expected baseline, expected scenario delta, and proof mode.

### 6.3 SSE handling

The browser connects only to FastAPI. Because the request is a POST with a JSON body, use `fetch()` and parse the response stream rather than relying on browser `EventSource`.

Requirements:

* Buffer partial lines across network chunks.
* Parse `event:` and `data:` fields.
* Capture `session_id` from `response.created`.
* Append `response.output_text.delta` content incrementally.
* Treat `response.completed` as success.
* Treat `response.failed` as failure even if text has already appeared.
* Support `AbortController` cancellation.
* Time out with a configurable threshold.
* Do not automatically replay a question after an ambiguous disconnect. Offer a user-initiated retry to avoid duplicate requests.
* Store session IDs by authenticated user, browser tab, and anchor.
* Clear the session when anchor or Domain changes.

### 6.4 Accessibility and presentation behavior

* Minimum 16-pixel body text on presentation pages.
* Do not encode status by color alone.
* Provide keyboard controls for pause, inject, and reset, but require confirmation for reset.
* Avoid animations longer than 300 milliseconds.
* Offer presentation mode that hides navigation and expands the active visual.
* Keep the synthetic-data and Preview labels visible in presentation mode.

## 7. Backend specification

### 7.1 Technology and processes

Use one Python repository package deployed as two processes:

* `api`: FastAPI web service.
* `simulator`: asynchronous event-generation worker.

For local-only development, both can run in one container. Hosted environments must run one simulator leader independently from API scaling.

Recommended libraries:

* Pydantic settings and models.
* SQLAlchemy Core or the SingleStore-compatible Python connector.
* `httpx.AsyncClient` for Aura calls.
* `sse-starlette` or a tested streaming response implementation.
* Structured JSON logging.
* Alembic or versioned SQL migrations.

### 7.2 Backend routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/config` | Safe client configuration and feature flags. |
| GET | `/api/v1/anchors` | Anchor definitions available to the current user. |
| GET | `/api/v1/anchors/{anchor}/overview` | Deterministic dashboard data. |
| GET | `/api/v1/anchors/{anchor}/entities/{type}/{id}` | Anchor entity detail. |
| POST | `/api/v1/analyst/query` | Validated server-side proxy to Aura `/query`. |
| POST | `/api/v1/analyst/chat` | Validated SSE proxy to Aura `/chat`. |
| GET | `/api/v1/analyst/starters/{anchor}` | Proxy or cached result from `/conversation-starters`. |
| POST | `/api/v1/analyst/session/new` | Clear the app-owned session reference. |
| GET | `/api/v1/scenarios` | Scenario catalog and expected deltas. |
| POST | `/api/v1/scenarios/{scenarioId}/inject` | Idempotently inject one scenario. |
| POST | `/api/v1/simulator/pause` | Pause logical time and event emission. |
| POST | `/api/v1/simulator/resume` | Resume from the same cursor. |
| PUT | `/api/v1/simulator/speed` | Set an allowed speed multiplier. |
| POST | `/api/v1/demo/reset` | Create and activate a clean global run. Requires administrator role and `If-Match` state version. |
| GET | `/api/v1/demo/state` | Active run, logical time, speed, mode, and checksums. |
| GET | `/health/live` | Process liveness. |
| GET | `/health/ready` | Required dependency readiness. |
| GET | `/health/demo` | End-to-end demo readiness. |

### 7.3 Analyst query contract

Client request:

```json
{
  "anchor_id": "a2",
  "message": "During the weakest authorization window, rank processors by approval-rate change.",
  "output_modes": ["sql", "data", "chart"]
}
```

Backend behavior:

1. Authenticate the user.
2. Resolve `anchor_id` to an allowlisted Domain configuration.
3. Enforce message length, output-mode allowlist, timeout, and rate limit.
4. Add no hidden customer identifiers except those derived from authorized server-side state.
5. Send the request to the Domain's `/query` URL with its server-side Bearer key.
6. Capture `singlestore-trace-id`.
7. Validate every item in `results[]`.
8. Convert positional rows to a safe internal table model while preserving the original columns.
9. Limit rows and payload size returned to the browser.
10. Redact secrets and unsafe error content.

Normalized response:

```json
{
  "request_id": "app-generated-uuid",
  "trace_id": "singlestore-trace-id",
  "mode": "live",
  "results": [
    {
      "sql": {
        "command": "SELECT ...",
        "confidence_score": 0.91,
        "tables_used": ["aa_payment_performance_hourly"]
      },
      "table": {
        "columns": ["processor", "approval_rate_change"],
        "rows": [["P2", -0.08]],
        "row_count": 1
      },
      "chart": null,
      "text": null,
      "error": null
    }
  ]
}
```

Do not assume a single result. Do not assume `data`, `chart`, `text`, or `sql` is present.

### 7.4 Analyst chat contract

Client request is the same base model with `included_events`, normally `summary`, `data`, and optionally `sql` for technical audiences.

FastAPI must:

* Send `Accept: text/event-stream` to Aura.
* Stream events without waiting for the complete answer.
* Preserve event names and JSON payloads where safe.
* Emit an app-level `meta` event first with request ID, mode, and anchor.
* Capture and store the session ID from `response.created`.
* Emit an app-level `trace` event when a trace ID is available.
* Close only after a terminal event or a controlled error.
* Cancel the upstream request when the browser disconnects.

### 7.5 Aura adapter

All Aura-specific parsing belongs in an adapter package. The rest of the application consumes stable internal models. This is required because the API is Preview.

```text
app/
  analyst/
    client.py
    models.py
    sse_parser.py
    normalizer.py
    fixture_client.py
    errors.py
```

Support `ANALYST_MODE=live|fixture|auto`:

* `live`: fail if Aura is unavailable.
* `fixture`: use reviewed stored responses.
* `auto`: try live, then offer a visible user-controlled fallback. Do not silently substitute fixture output.

## 8. SingleStore architecture

### 8.1 Deployment topology

Recommended topology:

* One demo database named `fintech_demo`.
* One workload workspace for application writes, simulator writes, and deterministic widget queries.
* A separate Aura Analyst workspace with a read-only database attachment, following SingleStore guidance for workload separation.
* Eight Aura Domains mapped to curated views in the same database.

All demo data is synthetic. Do not attach production databases.

### 8.2 Why eight Domains

Use one Domain per anchor rather than one broad Domain:

* Smaller schema and context improve question grounding.
* Domain-scoped keys provide clear separation.
* Risk and customer stories do not expose unrelated tables.
* Demo prompts and formulas remain precise.
* A8 can use a narrower customer-facing context.

The application still appears as one product. FastAPI maps anchor IDs to Domain endpoints and secrets.

### 8.3 Core control tables

#### `demo_run`

| Field | Type | Purpose |
|---|---|---|
| `run_id` | BIGINT | Unique deterministic run. |
| `seed` | BIGINT | PRNG seed. |
| `status` | VARCHAR(20) | preparing, active, superseded, failed. |
| `logical_epoch` | DATETIME(6) | Base logical timestamp. |
| `created_at` | DATETIME(6) | Wall-clock audit time. |
| `baseline_checksum` | VARCHAR(64) | Expected baseline checksum. |

#### `demo_active_run`

Singleton row containing `run_id`, `logical_time`, `stream_status`, `speed_multiplier`, `sequence_no`, `analyst_mode`, and `updated_at`.

#### `demo_scenario`

Contains `scenario_id`, anchor, name, description, fixture version, expected deltas JSON, and enabled flag.

#### `demo_scenario_execution`

Contains run ID, scenario ID, idempotency key, execution status, logical injection time, inserted row counts, and before or after checksums.

#### `demo_event_log`

Append-only technical event log with run ID, sequence, anchor, event type, logical event time, payload JSON, source scenario, and ingestion time.

### 8.4 Shared dimensions

| Table | Required fields |
|---|---|
| `dim_customer` | run_id, customer_id, synthetic_name, segment, region, relationship_start, risk_tier, consent_scope |
| `dim_account` | run_id, account_id, customer_id, account_type, currency, opened_at, status |
| `dim_product` | run_id, product_id, product_family, product_name |
| `dim_merchant` | run_id, merchant_id, merchant_category, region |
| `dim_processor` | run_id, processor_id, processor_name, rail, contracted_sla_ms |
| `dim_device` | run_id, device_id, first_seen_at, device_type, reuse_band |
| `dim_entity` | run_id, entity_id, entity_name, entity_type, jurisdiction |
| `dim_counterparty` | run_id, counterparty_id, country, relationship_type |
| `dim_geography` | geography_id, country, region, risk_band |

All direct identifiers are synthetic. Avoid fields representing protected characteristics.

### 8.5 Anchor fact tables

#### A1 digital journey

* `digital_session`: run_id, session_id, customer_id, channel, device_id, campaign, intent_cohort, started_at.
* `digital_event`: run_id, event_id, session_id, event_time, stage, event_type, sequence_no, scenario_id.
* `application`: run_id, application_id, session_id, product_id, submitted_at, current_stage, outcome_status.
* `manual_review`: run_id, review_id, application_id, referred_at, reason_code, status, resolved_at.

#### A2 payments

* `payment_event`: run_id, payment_id, event_time, customer_id, merchant_id, processor_id, rail, amount, currency, response_code, approved, latency_ms, issuer_country, scenario_id.

No PAN, CVV, bank account number, or real payment credential is stored.

#### A3 fraud

* `fraud_alert`: run_id, alert_id, payment_id, created_at, score, fraud_type, reason_codes JSON, status.
* `fraud_case`: run_id, case_id, alert_id, opened_at, closed_at, investigator_id, human_disposition, confirmed_loss, notes.
* `fraud_evidence`: run_id, evidence_id, case_id, evidence_type, source_id, observed_value, observed_at.

Metrics use human dispositions. An alert or score alone is not confirmed fraud.

#### A4 AML

* `aml_alert`: run_id, alert_id, customer_id, account_id, rule_id, priority, risk_band, created_at, sla_due_at, status, assigned_queue.
* `aml_alert_transaction`: run_id, alert_id, payment_id.
* `aml_evidence`: run_id, evidence_id, alert_id, source_type, source_id, observed_at, fact_text, completeness_status.
* `aml_case_history`: run_id, prior_case_id, customer_id, opened_at, human_disposition.

Do not add a predicted disposition field.

#### A5 disputes

* `dispute_case`: run_id, dispute_id, payment_id, customer_id, opened_at, due_at, status, reason_code, priority, queue_id, owner_id, disputed_amount.
* `dispute_event`: run_id, event_id, dispute_id, event_type, event_time, actor_type, metadata JSON.
* `customer_contact`: run_id, contact_id, dispute_id, channel, direction, occurred_at.
* `provisional_credit`: run_id, credit_id, dispute_id, amount, status, event_time.

#### A6 liquidity

* `cash_position_snapshot`: run_id, snapshot_time, entity_id, account_id, currency, ledger_balance, available_balance.
* `settlement`: run_id, settlement_id, entity_id, counterparty_id, currency, amount, direction, due_at, status.
* `queued_payment`: run_id, queued_payment_id, entity_id, currency, amount, due_at, status.
* `cash_flow_forecast`: run_id, forecast_time, bucket_time, entity_id, currency, expected_inflow, expected_outflow, model_version.

#### A7 credit

* `credit_application`: run_id, application_id, customer_id, submitted_at, product_id, requested_amount, industry_code, geography_id, review_status, decision_time.
* `credit_evidence`: run_id, evidence_id, application_id, source_type, metric_name, metric_value, observed_at, verification_status, provenance_ref.
* `portfolio_exposure_snapshot`: run_id, as_of_time, facility_id, entity_id, industry_code, geography_id, existing_risk_grade, outstanding_amount, committed_amount.

No automated approval, decline, pricing, or adverse-action field is generated by Aura.

#### A8 personal finance

A8 reuses `dim_customer`, `dim_account`, and synthetic transaction data. Add:

* `customer_transaction`: run_id, transaction_id, account_id, event_time, merchant_id, category, amount, currency, direction, scenario_id.
* `customer_financial_daily`: run_id, customer_id, date, inflows, outflows, net_flow, ending_balance.

### 8.6 Curated Aura views

Expose views, not raw control tables, to Aura Domains.

| Anchor | Required views |
|---|---|
| A1 | `aa_digital_funnel`, `aa_digital_review_comparison`, `aa_digital_intent_cohort` |
| A2 | `aa_payment_performance_hourly`, `aa_payment_decline_mix`, `aa_payment_event_sample` |
| A3 | `aa_fraud_loss_summary`, `aa_fraud_segment_evidence`, `aa_fraud_case_review` |
| A4 | `aa_aml_backlog`, `aa_aml_alert_evidence`, `aa_aml_entity_activity` |
| A5 | `aa_dispute_sla_risk`, `aa_dispute_queue_driver`, `aa_dispute_timeline` |
| A6 | `aa_liquidity_position`, `aa_liquidity_variance`, `aa_funding_window` |
| A7 | `aa_credit_operations`, `aa_credit_application_evidence`, `aa_portfolio_concentration` |
| A8 | `aa_customer_money_summary`, `aa_customer_spend_change`, `aa_customer_transaction_evidence` |

Every view joins `demo_active_run` so only the active run is visible. Every time-based view uses logical time, not server wall-clock time.

### 8.7 Metric definitions

Store the following definitions in both source-controlled Domain manifests and Aura Domain context:

* Completion rate: completed applications divided by started applications for the selected cohort and period.
* Manual-review referral rate: applications referred to manual review divided by submitted applications.
* Authorization rate: approved payment attempts divided by all payment attempts.
* p95 latency: 95th percentile authorization latency in milliseconds.
* Confirmed fraud loss: sum of transaction loss for cases with human disposition `confirmed_fraud`.
* False-positive rate: cases with human disposition `legitimate` divided by all human-closed fraud cases.
* AML SLA risk: open alerts with `sla_due_at` within the configured threshold.
* Dispute SLA risk: open disputes due within the selected horizon.
* Available liquidity: current available balance plus expected inflows minus expected outflows and queued obligations in the selected horizon.
* Forecast variance: actual net flow minus forecast net flow.
* Portfolio concentration: selected segment exposure divided by total booked exposure.
* Pro forma concentration: booked exposure plus the selected pending request divided by total booked exposure plus that request. Label this illustrative.
* Spending change: current-period category spend minus comparable prior-period category spend.

## 9. Synthetic data and event simulator

### 9.1 Determinism

For a fixed fixture version, run seed, logical epoch, and scenario sequence, the generated rows, event IDs, event order, and aggregate results must be identical.

Use a seeded PRNG. Generate identifiers from `run_id`, sequence number, and entity type rather than random UUIDs. Use logical time for all demo events.

Scenario injection is atomic and reproducible. The API pauses event emission, waits for the simulator watermark, records the current sequence number, inserts the complete scenario in one transaction, recalculates the affected views, and resumes only if the stream was running before injection. Dashboard comparisons use fixed logical windows anchored to the injection watermark. Background events cannot enter those windows during the injection transaction.

### 9.2 State machine

```text
PREPARING -> PAUSED -> RUNNING -> PAUSED
                   -> RESETTING -> PAUSED
                   -> FAILED
```

Allowed speeds: 0.5x, 1x, 2x, 5x, and 20x. The final event sequence must not change when speed changes.

`demo_active_run.stream_status` is the authoritative state. Only the elected simulator leader may transition it. Every transition uses an expected state and monotonically increasing `state_version`; stale requests return HTTP 409. The leader writes a heartbeat every five seconds. After a 15-second heartbeat gap, a replacement may acquire the database lock, reconcile the last committed sequence, and continue without regenerating committed events.

### 9.3 Reset algorithm

Reset is global across all anchors. It requires the Demo administrator role and clears every app-owned Analyst session.

1. Acquire a database advisory lock or transactional leader lock.
2. Mark state `RESETTING`.
3. Create a new run with the configured seed and fixture version.
4. Load baseline dimensions and facts into the new run.
5. Calculate and verify row counts and baseline checksum.
6. In one transaction, update `demo_active_run` to the new run.
7. Clear app-owned Aura session references, selected entities, filters, and cached widget data.
8. Mark the previous run superseded.
9. Set logical time to the baseline epoch, speed to 1x, and state to `PAUSED`.
10. Emit a reset-complete event.

Do not reset by updating thousands of active rows in place. Build the replacement run and switch the active pointer after validation.

The baseline checksum is SHA-256 over canonical UTF-8 JSON for all seeded dimension and fact rows, sorted by table name and primary key. Exclude audit timestamps, execution logs, heartbeats, and generated run IDs. Include fixture version, seed, logical epoch, and row counts. The reset is rejected if the computed checksum differs from the versioned expected checksum.

### 9.4 Scenario catalog and exact effects

| Scenario | Injection | Expected visible delta |
|---|---|---|
| `A1_REVIEW_SPIKE` | Add 100 starts, 80 submissions, 40 manual-review referrals, and 20 openings for one high-intent cohort | Injected-cohort referral rate is 50% of submissions and submit-to-open conversion is 25%; exact dashboard comparisons use the versioned baseline fixture |
| `A2_PROCESSOR_TIMEOUT` | Add a two-minute timeout burst for processor P2, Mastercard, GB | Affected approval rate falls from 96% to 88%, p95 latency rises from 180 ms to 680 ms, timeout declines rise from 1% to 7% |
| `A3_LOSS_CLUSTER` | Add 100 transactions and 12 alerts; human fixtures close 5 as fraud and 7 as legitimate | Confirmed loss rises by $2,500 after human dispositions; injected-cohort false-positive rate is 58.33% |
| `A4_CORRESPONDENT_SPIKE` | Add 25 linked transactions and one high-priority alert | Open backlog, high-priority count, and SLA-risk count each rise by one; evidence count rises by 25 |
| `A5_CASE_SURGE` | Add 20 disputes, including 12 due within 60 minutes, tagged `MERCHANT_OUTAGE` | Queue depth rises by 20 and SLA-risk count rises by 12 |
| `A6_SETTLEMENT_DELAY` | Delay a synthetic USD 25 million inbound settlement | Projected 24-hour liquidity falls by USD 25 million and settlement-at-risk rises by the same amount |
| `A7_PENDING_EXPOSURE` | Add a pending USD 5 million Transportation, California application with two evidence exceptions | Pending amount rises by USD 5 million; illustrative concentration changes from 20.00% to 23.81%; booked exposure does not change |
| `A8_DINING_SPIKE` | Add three dining transactions totaling $300 | Dining spend and outflows rise by $300; net cash flow falls by $300 |



### 9.5 Idempotency

Each injection request includes an idempotency key. The unique key is `(run_id, scenario_id, idempotency_key)`. Repeating the same request returns the original execution record and inserts no additional data.

## 10. Aura Analyst setup

### 10.1 Prerequisites

* SingleStore organization and project with Aura Analyst enabled.
* Demo database loaded and validated.
* Separate read-only Aura workspace attachment recommended.
* User with Aura Creator permission to install Analyst if needed.
* User with Agent Domain Owner permission to create and manage Domains.
* Secret manager for eight Domain-scoped API keys.

### 10.2 Create Domains

Create these Domains in Creator Mode:

| Anchor | Domain name | Tables or views |
|---|---|---|
| A1 | `a1_digital_journey` | Three A1 `aa_*` views |
| A2 | `a2_payment_pulse` | Three A2 views |
| A3 | `a3_fraud_strategy` | Three A3 views |
| A4 | `a4_aml_operations` | Three A4 views |
| A5 | `a5_disputes_ops` | Three A5 views |
| A6 | `a6_liquidity` | Three A6 views |
| A7 | `a7_credit_risk` | Three A7 views |
| A8 | `a8_customer_money` | Three A8 views |

For each Domain:

1. In the Cloud Portal, open AI > Analyst.
2. Enable Creator Mode.
3. Select Create Domain.
4. Enter the source-controlled name and description.
5. Select the Aura workspace and `fintech_demo` database.
6. Select only the listed curated views.
7. Create the Domain and wait for schema metadata collection.
8. Review all generated table and column descriptions.
9. Review inferred relationships. Correct or manually add relationships where required.
10. Add the approved Domain instructions and metric definitions.
11. Test the draft context with the known-question suite.
12. Publish the context.
13. Configure Domain access.
14. Enable conversation recording only if appropriate for the demo environment.
15. Under Governance > API Keys, create a key with a defined expiration.
16. Copy or save the key once into the server-side secret manager.
17. Copy the endpoint URL.
18. Record the Domain, endpoint, context version, key expiration, and validation date in the environment manifest.

### 10.3 Domain instruction template

Apply a shared instruction block plus anchor-specific metrics:

```text
This Domain contains synthetic fintech demonstration data only.
Use the curated views and their documented relationships.
Use the demo logical clock and active run exposed by the views.
State the selected period, filters, and comparison baseline.
Distinguish observed facts, calculated metrics, and interpretations.
Do not infer causation from correlation.
Do not make or recommend regulated decisions.
Do not approve, decline, block, route, file, release, price, adjudicate, or contact a customer.
When evidence is incomplete, say what is missing.
Use human dispositions as the source of confirmed fraud or case outcomes.
Treat pending credit exposure as illustrative and separate it from booked exposure.
Never reveal or request secrets or direct identifiers.
Prefer concise answers with a supporting table or chart when useful.
```

### 10.4 API keys and endpoints

This build pins the Analyst API contract documented on July 16, 2026 as `analyst-contract-2026-07-16`. Aura Analyst is Preview, so contract tests and the adapter are release gates. The pinned contract includes `/query`, `/chat`, `/conversation-starters`, domain-scoped Bearer authentication, `singlestore-trace-id`, structured `results[]`, and the documented SSE lifecycle events. Any incompatible response fails closed and requires an adapter and fixture version update.

Aura Analyst uses HTTPS Bearer authentication. Keys are Domain-scoped. The endpoint format is:

```text
https://apps.{region}.cloud.singlestore.com/v1/organizations/{orgID}/projects/{projectID}/analyst/<endpoint>
```

Required secret names:

```text
ANALYST_A1_ENDPOINT
ANALYST_A1_API_KEY
...
ANALYST_A8_ENDPOINT
ANALYST_A8_API_KEY
```

Store keys only in FastAPI runtime secrets. Never use `NEXT_PUBLIC_*`, `VITE_*`, browser storage, client configuration, or static build arguments. CI must scan source files and built browser assets for key material and Bearer tokens.

### 10.5 Known-question validation suite

Each Domain must pass:

* One baseline KPI question.
* One comparison question.
* One multi-table drill-down.
* One follow-up requiring session context.
* One question with an ambiguous term that should be clarified.
* One unsupported action request that should not execute an action.
* One no-data question.
* One malformed or invalid filter test.

Store expected structure and key values, not exact prose. Review generated SQL for correct views, joins, time windows, and metric definitions.

### 10.6 Context version control

Since public context-management APIs are not documented:

* Store Domain descriptions, instructions, relationships, metric definitions, starter prompts, and validation cases in `domains/<anchor>/manifest.yaml`.
* Apply changes manually in Creator Mode.
* Require a second-person review for metric or relationship changes.
* Record the published context version and date in `environment-manifest.yaml`.
* Capture screenshots or exported review notes as deployment evidence.
* Run the known-question suite after every change.

The manifest is the source of intent. The Portal remains the source of deployed state.

## 11. Prepared Aura prompts

### A1

* Show the account-opening funnel by step and channel for the last 30 logical days.
* Compare manual review with straight-through applications.
* Which high-intent cohort explains the largest conversion change?

### A2

* Show authorization rate, p95 latency, and decline volume by hour.
* During the weakest window, rank processors and rails against the prior seven-day baseline.
* Break the largest change down by merchant category and response code.

### A3

* Show confirmed fraud loss and false-positive rate by channel and fraud type.
* For the highest-loss segment, compare device reuse, account age, merchant, and velocity.
* List supporting cases for human investigator review.

### A4

* Show open AML alerts by age, rule, risk band, and queue.
* For the selected cohort, summarize transaction value, counterparties, geographies, and prior alerts.
* Identify missing evidence without recommending a disposition.

### A5

* Show disputes at risk of SLA breach in the next 24 logical hours.
* What explains the largest at-risk queue compared with the prior 30 days?
* Show the timeline for the selected dispute.

### A6

* Show current cash position, expected settlements, queued payments, and available liquidity by entity and currency.
* Rank the drivers of the largest forecast variance.
* Which queued payments fall inside the next funding window?

### A7

* Show application volume, manual-review rate, and time to decision by product and channel.
* Summarize submitted evidence and missing items for the selected application.
* Compare the pending request with current portfolio concentration without making a decision.

### A8

* Why did my dining spending change this month?
* Show the transactions that explain the change.
* Compare my current cash flow with the prior comparable period.

## 12. Security and governance

### 12.1 Required controls

* Synthetic data only.
* TLS for all network traffic.
* Aura keys in a secret manager and FastAPI only.
* Domain-scoped keys with expiration and rotation procedure.
* Read-only curated views for Aura.
* No browser-direct Aura calls.
* OIDC authentication for hosted demo access, using secure, HTTP-only, SameSite=Lax cookies. Session lifetime is eight hours with 30 minutes of inactivity.
* CSRF tokens for every state-changing route and strict origin checking.
* Server-side role authorization: viewers may read; presenters may switch anchors and use Analyst; only Demo administrators may inject, pause, change speed, reset, change mode, or run Domain checks.
* Server-side authorization for anchor and entity access. Every audit record includes authenticated actor ID, role, request ID, and state version.
* Prompt length, row count, query duration, and response-size limits.
* Redaction of Authorization headers, secrets, and sensitive payload fields from logs.
* Dependency and secret scanning in CI.
* Bundle scan proving no Analyst key or endpoint secret is present.
* Audit records for scenario controls, resets, Analyst requests, and mode changes.

### 12.2 Regulated workflow boundaries

The app may retrieve, summarize, compare, explain, visualize, and assemble evidence. It must not:

* Approve or decline credit.
* Generate adverse-action decisions.
* Block or approve a payment.
* Change payment routing.
* Determine that a customer committed fraud.
* File a SAR or dispose of an AML alert.
* Adjudicate a dispute or issue a credit.
* Release, stop, or transfer funds.
* Provide financial or investment advice.

Human ownership must be visible on A3 through A7 pages. Enforcement does not depend on labels or model instructions: the demo database user and Aura Domain users are read-only; the application exposes no approve, decline, block, route, file, release, price, adjudicate, or customer-contact endpoint. FastAPI rejects prohibited-action prompts with a neutral explanation and records the rejection. Ranking is limited to explicit operational measures such as age, SLA due time, volume, or customer-defined risk band; Aura must not generate a final disposition or eligibility score.

### 12.3 A8 customer scoping

Do not rely on natural-language instructions for customer isolation. The field demo supports one customer-facing identity, `CUST-DEMO-001`, and the `a8_customer_money` Domain contains only views physically filtered to that synthetic customer. FastAPI maps the authenticated A8 demo identity to that Domain and rejects any customer ID in the URL, body, prompt metadata, or session that does not match. Cache keys, sessions, fixtures, and telemetry are partitioned by authenticated identity and Domain.

A multi-customer build requires a separately reviewed isolation design, such as a Domain and read-only view set per tenant or another enforceable database boundary. It must not enable live A8 access until cross-customer negative tests pass. This demo is not proof of production multitenancy.

## 13. Observability

### 13.1 Required telemetry

* Request ID across browser, FastAPI, and logs.
* `singlestore-trace-id` for Analyst calls.
* Anchor and Domain identifier.
* Live or fixture mode.
* Analyst latency to first event and total completion.
* Query result count and row count, not row contents.
* SSE disconnect and terminal status.
* Simulator logical time, speed, sequence, and lag.
* Reset duration and baseline checksum status.
* SingleStore query latency and errors.

### 13.2 Health model

`/health/demo` returns:

* Next.js reachable.
* FastAPI reachable.
* SingleStore read and write checks.
* Simulator leader heartbeat.
* Active run and checksum status.
* Each selected Domain endpoint status.
* Key expiration warning, without exposing the key.
* Fixture availability.

The UI uses green, amber, and red plus text labels.

## 14. Failure handling

| Failure | User behavior | Recovery |
|---|---|---|
| Aura timeout | Keep deterministic dashboard visible; mark investigation incomplete | Retry or visibly switch to fixture mode |
| SSE disconnect | Preserve partial text but label it incomplete | Start a new request; do not auto-replay |
| Invalid or expired key | Block live Analyst use | Rotate key and rerun Domain check |
| Malformed Aura payload | Show safe error and trace ID | Adapter logs schema mismatch; fixture remains available |
| SingleStore unavailable | Block scenario and dashboard operations | Restore database, then run health and checksum checks |
| Simulator leader lost | Freeze logical time and show stopped state | Elect or restart one leader |
| Reset checksum mismatch | Do not activate the new run | Retain prior active run and mark reset failed |
| Duplicate scenario request | Return original execution | No duplicate rows |
| Domain drift | Fail known-question readiness | Correct in Creator Mode and republish |

## 15. Fixture mode

Fixture mode is a presentation resilience feature, not a substitute for live acceptance testing.

Store reviewed response fixtures by:

```text
fixtures/
  analyst/
    a1/
      baseline-query.json
      review-spike-chat.ndjson
    ...
```

Requirements:

* Fixtures use the same normalized internal models as live responses.
* Streaming fixtures replay events with configurable pacing.
* The UI displays “Fixture mode.”
* Fixtures are regenerated only after a successful live run and human review.
* No production secrets or real data are stored.
* CI validates fixture schemas.

## 16. Repository structure

```text
fintech-analyst-demo/
  apps/
    web/                       # Next.js
    api/                       # FastAPI and simulator package
  database/
    migrations/
    seed/
    views/
    validation/
  domains/
    a1-digital-journey/
    a2-payment-pulse/
    a3-fraud-strategy/
    a4-aml-operations/
    a5-disputes/
    a6-liquidity/
    a7-credit-risk/
    a8-customer-money/
  scenarios/
    catalog.yaml
    fixtures/
  fixtures/
    analyst/
  tests/
    e2e/
    contract/
    load/
  deploy/
    docker-compose.yaml
    hosted/
  docs/
    demo-runbook.md
    domain-setup-checklist.md
    troubleshooting.md
  environment-manifest.example.yaml
```

## 17. Environment configuration

Safe client configuration may include feature flags and display names. Secrets stay server-side.

```text
SINGLESTORE_HOST
SINGLESTORE_PORT
SINGLESTORE_DATABASE=fintech_demo
SINGLESTORE_USER
SINGLESTORE_PASSWORD
ANALYST_MODE=live
ANALYST_A1_ENDPOINT
ANALYST_A1_API_KEY
...
ANALYST_A8_ENDPOINT
ANALYST_A8_API_KEY
DEMO_DEFAULT_SEED=20260725
DEMO_DEFAULT_EPOCH=2026-07-25T09:00:00Z
DEMO_ALLOWED_SPEEDS=0.5,1,2,5,20
ANALYST_TIMEOUT_SECONDS=90
ANALYST_MAX_ROWS=500
ANALYST_MAX_MESSAGE_CHARS=2000
```

## 18. Testing strategy

### 18.1 Unit tests

* Metric formulas.
* Seeded PRNG and identifier generation.
* Scenario transformation functions.
* Reset checksums.
* Aura response normalization.
* Chunk-safe SSE parsing.
* Session ownership.
* Secret redaction.

### 18.2 Database tests

* All foreign-key relationships or equivalent integrity checks.
* Active-run filtering in every `aa_*` view.
* No raw control tables in any Domain.
* Baseline row counts and checksums.
* Exact scenario deltas.
* Query performance within the demo target.

### 18.3 Contract tests

Record sanitized examples for:

* `/query` with SQL and data.
* `/query` with multiple results.
* Text-only result.
* Result-level error.
* `/chat` success.
* `/chat` failure after partial text.
* Invalid session.
* Expired key.

The adapter must tolerate optional fields and reject unsafe or structurally invalid payloads.

### 18.4 End-to-end tests

For every anchor:

1. Reset.
2. Confirm baseline KPI values.
3. Start stream.
4. Pause and verify no event progression.
5. Change speed and verify event order is unchanged.
6. Inject the anchor scenario.
7. Verify exact expected deltas.
8. Open Investigation.
9. Submit the first prompt.
10. Submit a follow-up using the same session.
11. Open one supporting entity.
12. Reset again.
13. Verify baseline checksum and UI state.

Run the same tests in live and fixture modes. Exact prose is not an assertion.

### 18.5 Security tests

* Search browser bundles for API keys and Bearer strings.
* Confirm the browser never calls `apps.{region}.cloud.singlestore.com` directly.
* Verify authorization on administrator routes.
* Test cross-anchor and A8 cross-customer access.
* Verify logs redact credentials and direct identifiers.
* Rotate a key and confirm the old key fails.
* Confirm all Aura database access is read-only.

## 19. Performance targets

These are demo engineering targets, not Aura product guarantees.

| Operation | Target |
|---|---:|
| Launchpad first usable render | under 2 seconds on the demo network |
| Deterministic Overview refresh | under 1.5 seconds p95 |
| Scenario visible after injection | within two refresh intervals |
| Pause acknowledgement | under 1 second |
| Reset to verified baseline | under 30 seconds |
| Aura streaming first visible event | measure and display; rehearsal target under 10 seconds |
| Entity Detail | under 2 seconds p95 |
| Fixture first event | under 500 milliseconds |

## 20. Deployment

### 20.1 Local development

Docker Compose services:

* `web`
* `api`
* `simulator`
* optional local database only if SingleStore deployment policy permits; otherwise connect to a dedicated Helios demo database

Use `.env.local` excluded from source control. Provide a one-command migration and seed task.

### 20.2 Hosted demo

Recommended:

* Next.js and FastAPI behind one authenticated HTTPS origin.
* FastAPI in a private service network where practical.
* One simulator replica with leader locking.
* Managed secret storage.
* Dedicated SingleStore demo deployment.
* Restricted ingress and an allowlisted audience for Preview demonstrations.
* Scheduled health check and nightly reset.

### 20.3 CI/CD gates

* Lint and type check.
* Unit, contract, database, and end-to-end tests.
* Migration validation.
* Secret scan.
* Browser bundle scan.
* Dependency scan.
* Fixture schema validation.
* Domain-manifest validation.
* Manual approval for hosted deployment.

Domain changes are a separate manual release step followed by the known-question suite.

## 21. Demo runbook

### 21.1 Day before

* Confirm Aura Analyst Preview access.
* Run `/admin/domain-check` for all required anchors.
* Verify key expiration dates.
* Run all eight scenario smoke tests.
* Refresh reviewed fixtures if needed.
* Confirm the hosted URL and authentication.
* Reset to baseline.

### 21.2 Thirty minutes before

* Open Demo Health.
* Confirm live mode and fixture readiness.
* Select the intended anchor and persona.
* Reset the entire demo, then select the intended anchor.
* Run the first prepared question.
* Start a new session and reset again.
* Keep the Architecture and Scenario Console tabs open but hidden.

### 21.3 During the demo

* State the business issue and baseline first.
* Inject only the selected scenario.
* Ask the prepared opening question.
* Use one follow-up to prove context.
* Show SQL, Domain, or architecture only when required by the audience.
* State the human-ownership boundary.
* Reset before switching to an unrelated anchor.

### 21.4 After the demo

* Record the run ID, anchor, scenario, trace IDs, and observed timings.
* Save customer feedback without storing confidential data in the demo environment.
* Revoke or rotate keys if exposure is suspected.
* Reset the environment.

## 22. Build phases

### Phase 1: Foundation

* Repository, CI, Next.js shell, FastAPI, database migrations, health checks, and secret handling.
* Control tables, active-run model, simulator, reset, and fixture mode.

Exit: deterministic baseline and controls work without Aura.

### Phase 2: First vertical slice

Build A2 Payment Pulse end to end because it exercises live events, operational metrics, drill-down, `/query`, `/chat`, and a clear scenario.

Exit: A2 passes all end-to-end and security tests.

### Phase 3: Risk and operations

Build A3, A4, A5, and A6 using shared components.

Exit: human-ownership labels, evidence pages, and scenarios pass.

### Phase 4: Growth and credit

Build A1 and A7.

Exit: funnel and concentration definitions pass Domain validation.

### Phase 5: Embedded experience

Build A8 with enforced synthetic customer scope and customer-facing frame.

Exit: cross-customer tests pass and no presenter controls appear in the embedded frame.

### Phase 6: Field hardening

* Architecture page, runbook, presentation mode, fixture review, load testing, and full rehearsal.

Exit: two presenters independently run all defined demo lengths from a clean environment.

## 23. Definition of done

The build is ready for field use only when:

* All routes in Section 5 exist and have empty, loading, complete, and error states.
* All eight anchors use the shared shell and configuration model.
* All required tables and curated views exist.
* All eight Domains are manually configured, published, and documented.
* The known-question suites pass.
* No Aura credential is present in the browser, repository, fixture, or log.
* Live `/query` and `/chat` work through FastAPI.
* Session continuity and new-session behavior pass.
* Every scenario has a versioned fixture manifest with baseline counts, inserted rows, metric window, exact expected values, and tolerance; all scenario tests pass while the continuous stream is enabled.
* Global reset restores the canonical baseline checksum, state version, logical clock, and all app-owned conversation context.
* Fixture mode works and is visibly labeled.
* A3 through A7 contain explicit human-decision boundaries.
* A8 is restricted to the single synthetic customer Domain; cross-customer URL, prompt, cache, session, and API tests all fail closed.
* The Architecture page accurately separates native Aura behavior from custom application behavior.
* Demo Health provides actionable recovery information.
* The presentation runbook has been rehearsed.

## 24. Known risks and design responses

| Risk | Design response |
|---|---|
| Preview API or event changes | Isolate Aura in an adapter, validate payloads, pin known contracts, and retain fixture mode. |
| Domain configuration drift | Source-controlled manifests, manual checklist, second-person review, and known-question tests. |
| Key exposure | Server-only proxy, secret manager, bundle scan, log redaction, and rotation. |
| Synthetic data appears too perfect | Label data and scenarios; separate demo repeatability from production claims. |
| SSE partial response mistaken for completion | Require terminal events and show incomplete status after disconnect. |
| Wrong session reused | Scope sessions by user, tab, anchor, and Domain; clear on switches and reset. |
| Broad Domain causes weak SQL | One narrow Domain per anchor with curated views and explicit metrics. |
| Reset leaves mixed state | Prepare a new run, validate checksum, then atomically switch the active pointer. |
| Customer scoping relies on prompt text | Enforce scope in FastAPI and data access, not in the prompt alone. |
| Dashboard depends on model latency | Use deterministic SQL for core pages; use Aura where conversational proof adds value. |

## 25. Sources

* [Aura Analyst documentation](https://docs.singlestore.com/cloud/ai/aura-analyst/)
* [Aura Analyst API documentation](https://docs.singlestore.com/cloud/ai/aura-analyst/aura-analyst-api/)
* [Aura Analyst API reference](https://docs.singlestore.com/cloud/ai/aura-analyst/aura-analyst-api-reference/)
* [Fintech Aura Analyst Modular Demo Playbook](./fintech_aura_analyst_modular_demo_playbook.md)
* [Analyst API Customer Guide](https://docs.google.com/document/d/1UEW1dkelOjHYQ6QdWFmQTfUMGxRRN6qd9riwO6FjisY)

## Appendix A: Example environment manifest

```yaml
environment: fintech-demo-dev
fixture_version: 1.0.0
default_seed: 20260725
default_epoch: 2026-07-25T09:00:00Z
analyst_mode: live
domains:
  a2:
    name: a2_payment_pulse
    context_version: 1.0.0
    validated_at: 2026-07-25
    endpoint_secret: ANALYST_A2_ENDPOINT
    key_secret: ANALYST_A2_API_KEY
scenarios:
  a2: A2_PROCESSOR_TIMEOUT
```

## Appendix B: Native versus custom capability boundary

| Capability | Native Aura Analyst | Custom demo application |
|---|---:|---:|
| Natural-language interpretation | Yes | No |
| SQL generation and execution | Yes | No |
| Domain context | Yes | Manifest mirrors intended setup |
| Structured JSON output | Yes, `/query` | Validation and rendering |
| Streaming output | Yes, `/chat` | Proxy, parser, and UI |
| Multi-turn session | Yes | Session ownership and lifecycle |
| Plotly chart response | Yes when returned | Rendering and fallback visuals |
| Scenario injection | No | Yes |
| Continuous synthetic stream | No | Yes |
| Deterministic reset | No | Yes |
| Persona and anchor switching | No | Yes |
| Workflow action | No | Not implemented |
| Production governance | Configuration-dependent | Demo controls are not certification |
