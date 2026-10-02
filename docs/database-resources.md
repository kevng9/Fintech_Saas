# Database resources

This is the source-controlled inventory for the Fintech SaaS demo. It describes
objects defined by the migrations and Domain manifests; it is not, by itself,
proof that an object currently exists in SingleStore or the Portal. Deployment
status is taken from `environment-manifest.yaml`.

## Summary

- **Database:** 1 (`fintech_demo`, created by the simulator bootstrap)
- **Tables:** 41 (7 control-plane, 9 shared dimensions, 25 anchor facts)
- **Views:** 24 (3 curated `aa_*` views for each of A1–A8)
- **Aura Analyst Domains:** 8 manifests, each exposing exactly 3 views
- **Declared keys:** 16 primary keys, 21 shard keys, and 21 sort keys
- **Other persistent schema objects:** none. The migrations define no standalone
  indexes, procedures, functions, pipelines, sequences, links, roles, or users.

All tables and views are in `fintech_demo`. Bootstrap runs
`CREATE DATABASE IF NOT EXISTS fintech_demo` before applying the migrations.

## Scope and reset model

Most synthetic data tables carry `run_id`. The pristine baseline is stored as
template run `run_id = 0`; reset clones it into a replacement run, verifies the
baseline fingerprint/checksum, and atomically changes the singleton
`demo_active_run` pointer. Curated views join that pointer and filter against its
`logical_time`, so Aura sees the active run at demo time rather than wall time.
`dim_geography` is the only global, non-run-scoped dimension.

## Control-plane tables

These seven rowstore tables are operational resources and are never exposed to
an Aura Domain.

- **`demo_run`** — one row per template or reset run; stores seed, fixture
  version, logical epoch, baseline range, row counts, fingerprint, and checksum.
  Global run registry. **Primary key:** `(run_id)`.
- **`demo_active_run`** — singleton active-run pointer and logical clock,
  including stream state, speed, sequence/minute cursor, Analyst mode, state
  version, and simulator leader heartbeat. Global singleton.
  **Primary key:** `(singleton_id)`.
- **`demo_scenario`** — fixture-versioned catalog of A1–A8 scenario definitions,
  metric windows, and expected deltas. Global configuration.
  **Primary key:** `(scenario_id)`.
- **`demo_scenario_execution`** — idempotent scenario injection attempts and
  before/after fingerprints, scoped to a run and scenario.
  **Primary key:** `(run_id, scenario_id, idempotency_key)`.
- **`demo_event_log`** — ordered operational/event-stream log for a run,
  including logical event time and optional scenario source.
  **Primary key:** `(run_id, sequence_no)`.
- **`demo_command`** — app-to-simulator command queue with optimistic state
  version, claim/completion state, result, and errors. Commands target a run.
  **Primary key:** `(command_id)`.
- **`demo_audit`** — administrator/control action audit trail, optionally tied
  to an anchor, run, and state version. Global append-style audit resource.
  **Primary key:** `(audit_id)`.

Operational baseline resources represented by these rows include the template
run, active-run pointer, scenario catalog and executions, command queue, event
log, audit records, logical clock, and leader heartbeat. They are rows in the
tables above, not additional schema objects.

## Shared dimensions

All dimensions except `dim_geography` are template-seeded and cloned per run.

- **`dim_customer`** — synthetic customer profile and consent/risk attributes;
  run-scoped, one row per customer. **Primary key:** `(run_id, customer_id)`.
- **`dim_account`** — synthetic customer accounts; run-scoped, one row per
  account. **Primary key:** `(run_id, account_id)`.
- **`dim_merchant`** — synthetic merchant/category/region lookup; run-scoped,
  one row per merchant. **Primary key:** `(run_id, merchant_id)`.
- **`dim_processor`** — processor, rail, and contracted latency SLA;
  run-scoped, one row per processor. **Primary key:** `(run_id, processor_id)`.
- **`dim_geography`** — country, region, and risk-band lookup; global rather
  than run-scoped, one row per geography. **Primary key:** `(geography_id)`.
- **`dim_product`** — product name, family, channel, and an illustrative
  first-year value per opened account (`annual_value_usd`, set per family);
  run-scoped, one row per product. **Primary key:** `(run_id, product_id)`.
- **`dim_device`** — device type, OS family, and risk band; run-scoped, one row
  per device. **Primary key:** `(run_id, device_id)`.
- **`dim_entity`** — legal/treasury entity and currency; run-scoped, one row per
  entity. **Primary key:** `(run_id, entity_id)`.
- **`dim_counterparty`** — settlement counterparty and country/risk band;
  run-scoped, one row per counterparty.
  **Primary key:** `(run_id, counterparty_id)`.

## Per-anchor fact tables

All 25 fact tables are run-scoped, template/reset cloned, and columnstore tables
with explicit shard and sort keys. The keys below are the complete physical-key
inventory for these tables.

### A1 — Digital Funnel Performance

- **`digital_session`** — one account-opening session/customer/channel/intent
  cohort. **Shard:** `(run_id, session_id)`; **sort:** `(run_id, started_at)`.
- **`digital_event`** — one ordered funnel event within a session.
  **Shard:** `(run_id, event_id)`; **sort:** `(run_id, event_time)`.
- **`application`** — one submitted application and its current/final outcome
  state. **Shard:** `(run_id, application_id)`; **sort:** `(run_id, submitted_at)`.
- **`manual_review`** — one manual-review referral and resolution for an
  application. **Shard:** `(run_id, review_id)`; **sort:** `(run_id, referred_at)`.

### A2 — Payment Performance Management

- **`payment_event`** — one synthetic authorization attempt, including response,
  latency, processor, merchant, customer, and normalized amount.
  **Shard:** `(run_id, payment_id)`; **sort:** `(run_id, event_time)`.

### A3 — Fraud Strategy Optimization

- **`fraud_alert`** — one scored alert linked to a payment and optional device;
  an alert is not a fraud disposition. **Shard:** `(run_id, alert_id)`;
  **sort:** `(run_id, created_at)`.
- **`fraud_case`** — one investigator case with human disposition and confirmed
  loss. **Shard:** `(run_id, case_id)`; **sort:** `(run_id, opened_at)`.
- **`fraud_evidence`** — one observed evidence item attached to a case.
  **Shard:** `(run_id, evidence_id)`; **sort:** `(run_id, observed_at)`.

### A4 — Financial Crime Operations

- **`aml_alert`** — one AML alert with rule, risk, queue, status, and SLA.
  **Shard:** `(run_id, alert_id)`; **sort:** `(run_id, created_at)`.
- **`aml_alert_transaction`** — alert-to-payment bridge, one linked transaction
  row. **Shard:** `(run_id, alert_id)`; **sort:** `(run_id, alert_id)`.
- **`aml_evidence`** — one factual evidence item and completeness state for an
  alert. **Shard:** `(run_id, evidence_id)`; **sort:** `(run_id, observed_at)`.
- **`aml_case_history`** — one previously closed human-dispositioned AML case.
  **Shard:** `(run_id, prior_case_id)`; **sort:** `(run_id, opened_at)`.

### A5 — Dispute Operations Performance

- **`dispute_case`** — one payment dispute with queue, owner, due time, status,
  priority, and amount. **Shard:** `(run_id, dispute_id)`;
  **sort:** `(run_id, opened_at)`.
- **`dispute_event`** — one lifecycle event for a dispute.
  **Shard:** `(run_id, event_id)`; **sort:** `(run_id, event_time)`.
- **`customer_contact`** — one inbound/outbound contact on a dispute.
  **Shard:** `(run_id, contact_id)`; **sort:** `(run_id, occurred_at)`.
- **`provisional_credit`** — one provisional-credit event and status.
  **Shard:** `(run_id, credit_id)`; **sort:** `(run_id, event_time)`.

### A6 — Liquidity and Funding Management

- **`cash_position_snapshot`** — one balance snapshot per entity/account/currency.
  **Shard:** `(run_id, entity_id, account_id)`; **sort:** `(run_id, snapshot_time)`.
- **`settlement`** — one inbound/outbound settlement obligation.
  **Shard:** `(run_id, settlement_id)`; **sort:** `(run_id, due_at)`.
- **`queued_payment`** — one known queued outbound payment.
  **Shard:** `(run_id, queued_payment_id)`; **sort:** `(run_id, due_at)`.
- **`cash_flow_forecast`** — one forecast bucket per entity/currency/model.
  **Shard:** `(run_id, entity_id, bucket_time)`; **sort:** `(run_id, bucket_time)`.

### A7 — Credit and Exposure Management

- **`credit_application`** — one credit request and operational review state;
  it does not encode an Aura decision. **Shard:** `(run_id, application_id)`;
  **sort:** `(run_id, submitted_at)`.
- **`credit_evidence`** — one observed, provenance-bearing metric for an
  application. **Shard:** `(run_id, evidence_id)`; **sort:** `(run_id, observed_at)`.
- **`portfolio_exposure_snapshot`** — one booked facility exposure at a
  portfolio snapshot time. **Shard:** `(run_id, facility_id)`;
  **sort:** `(run_id, as_of_time)`.

### A8 — Embedded Insights Strategy

- **`customer_transaction`** — one synthetic account transaction across all
  customers in the run; Domain views later isolate one demo customer.
  **Shard:** `(run_id, transaction_id)`; **sort:** `(run_id, event_time)`.
- **`customer_financial_daily`** — one customer's daily inflows, outflows, net
  flow, and ending balance. **Shard:** `(run_id, customer_id)`;
  **sort:** `(run_id, date)`.

## Curated Aura views

Every view joins `demo_active_run` on `run_id` and applies the active logical
clock. The Domain manifests expose these views only; control and base tables are
not attached to Domains.

### A1 — Digital Funnel Performance

- **`aa_digital_funnel`** — daily/channel funnel volume and conversion;
  logical-time filters sessions, applications, and referrals.
- **`aa_digital_review_comparison`** — review-path × product outcomes over the
  active run; applications are visible only through logical time.
- **`aa_digital_intent_cohort`** — daily intent-cohort × channel conversion,
  submitted and opened value at illustrative product values, and scenario
  activity; all contributing events are logically time-bounded.

### A2 — Payment Performance Management

- **`aa_payment_performance_hourly`** — logical hour × processor × rail × network
  × issuer-country authorization performance through logical time.
- **`aa_payment_decline_mix`** — logical hour × processor/network/country/
  merchant-category/response-code decline composition through logical time.
- **`aa_payment_event_sample`** — one authorization attempt, limited to the last
  six logical hours and enriched with processor, merchant, and geography.

### A3 — Fraud Strategy Optimization

- **`aa_fraud_loss_summary`** — channel × fraud-type case outcomes and
  human-confirmed loss through logical time.
- **`aa_fraud_segment_evidence`** — one case with alert reason codes (a JSON
  array), payment, merchant, customer, account-age, and device evidence; cases
  are visible through logical time.
- **`aa_fraud_case_review`** — one case with alert and evidence counts for human
  review; cases are visible through logical time.

### A4 — Financial Crime Operations

- **`aa_aml_backlog`** — open backlog at rule × risk × queue × priority grain,
  with age and SLA risk computed from logical time.
- **`aa_aml_alert_evidence`** — one evidence item per alert, through logical
  observation time, preserving recorded completeness rather than predicting a
  disposition.
- **`aa_aml_entity_activity`** — customer/account-level linked transaction and
  prior-case activity; alerts and linked payments are logically time-bounded.

### A5 — Dispute Operations Performance

- **`aa_dispute_sla_risk`** — opened day × queue × reason × priority × merchant
  open disputes and SLA risk, evaluated against logical time. The merchant
  comes from the disputed payment.
- **`aa_dispute_queue_driver`** — opened day × queue × reason × merchant
  volume/value through logical time.
- **`aa_dispute_timeline`** — one unioned case, contact, or provisional-credit
  timeline event per dispute, each source filtered through logical time.

### A6 — Liquidity and Funding Management

- **`aa_liquidity_position`** — latest logical-time position per
  entity/account/currency plus pending settlements and queued payments.
- **`aa_liquidity_variance`** — logical hour × entity × currency forecast versus
  settled flow; both forecast and bucket are bounded by logical time.
- **`aa_funding_window`** — one queued payment created by logical time and due
  within seven logical days, with a next-24-hours flag.

### A7 — Credit and Exposure Management

- **`aa_credit_operations`** — submitted day × product × channel application
  volume and operational review metrics through logical time.
- **`aa_credit_application_evidence`** — one evidence item per application,
  bounded by logical observation time.
- **`aa_portfolio_concentration`** — latest logical-time booked exposure at
  industry × geography × risk-grade grain, with explicitly illustrative pending
  application pro forma amounts.

### A8 — Embedded Insights Strategy

All three A8 views have defense-in-depth customer isolation: in addition to
active-run and logical-time filtering, SQL physically enforces
`customer_id = 'CUST-0001'`, retains `customer_id` in the output, and allows the
API layer to verify the authenticated demo identity before returning rows.

- **`aa_customer_money_summary`** — one daily cash-flow/balance row for
  `CUST-0001`, through the logical date.
- **`aa_customer_spend_change`** — month × category spend for `CUST-0001`,
  through logical transaction time.
- **`aa_customer_transaction_evidence`** — one enriched transaction for
  `CUST-0001`, through logical transaction time.

## Aura Analyst Domains

The target Portal environment/cluster for every Domain is
**`kng-demo-environment`**. Current manifest names already satisfy the Portal
limit of 20 characters, and current descriptions satisfy the 100-character
limit. The name shown below is therefore both the source name and required
Portal name. Each manifest has context version `1.0.0`.

`environment-manifest.yaml` currently records `domain_built: false`,
`domain_key_configured: false`, and `known_questions_passed_at: null` for every
anchor. Thus all eight are **defined in source but not confirmed deployed or
validated in Portal by the deployment manifest**, even though each application
anchor has repository status `available`.

### A1

- **Portal/source name:** `a1_digital_journey`
- **Views:** `aa_digital_funnel`, `aa_digital_intent_cohort`,
  `aa_digital_review_comparison`
- **Domain-scoped secret variables:** `ANALYST_A1_API_KEY`,
  `ANALYST_A1_ENDPOINT`
- **Deployment record:** not built; key not configured; no known-question
  validation timestamp

### A2

- **Portal/source name:** `a2_payment_pulse`
- **Views:** `aa_payment_performance_hourly`, `aa_payment_decline_mix`,
  `aa_payment_event_sample`
- **Domain-scoped secret variables:** `ANALYST_A2_API_KEY`,
  `ANALYST_A2_ENDPOINT`
- **Deployment record:** not built; key not configured; no known-question
  validation timestamp

### A3

- **Portal/source name:** `a3_fraud_strategy`
- **Views:** `aa_fraud_loss_summary`, `aa_fraud_case_review`,
  `aa_fraud_segment_evidence`
- **Domain-scoped secret variables:** `ANALYST_A3_API_KEY`,
  `ANALYST_A3_ENDPOINT`
- **Deployment record:** not built; key not configured; no known-question
  validation timestamp

### A4

- **Portal/source name:** `a4_aml_operations`
- **Views:** `aa_aml_backlog`, `aa_aml_entity_activity`,
  `aa_aml_alert_evidence`
- **Domain-scoped secret variables:** `ANALYST_A4_API_KEY`,
  `ANALYST_A4_ENDPOINT`
- **Deployment record:** not built; key not configured; no known-question
  validation timestamp

### A5

- **Portal/source name:** `a5_disputes_ops`
- **Views:** `aa_dispute_sla_risk`, `aa_dispute_queue_driver`,
  `aa_dispute_timeline`
- **Domain-scoped secret variables:** `ANALYST_A5_API_KEY`,
  `ANALYST_A5_ENDPOINT`
- **Deployment record:** not built; key not configured; no known-question
  validation timestamp

### A6

- **Portal/source name:** `a6_liquidity`
- **Views:** `aa_liquidity_position`, `aa_liquidity_variance`,
  `aa_funding_window`
- **Domain-scoped secret variables:** `ANALYST_A6_API_KEY`,
  `ANALYST_A6_ENDPOINT`
- **Deployment record:** not built; key not configured; no known-question
  validation timestamp

### A7

- **Portal/source name:** `a7_credit_risk`
- **Views:** `aa_credit_operations`, `aa_credit_application_evidence`,
  `aa_portfolio_concentration`
- **Domain-scoped secret variables:** `ANALYST_A7_API_KEY`,
  `ANALYST_A7_ENDPOINT`
- **Deployment record:** not built; key not configured; no known-question
  validation timestamp

### A8

- **Portal/source name:** `a8_customer_money`
- **Views:** `aa_customer_money_summary`, `aa_customer_spend_change`,
  `aa_customer_transaction_evidence`
- **Domain-scoped secret variables:** `ANALYST_A8_API_KEY`,
  `ANALYST_A8_ENDPOINT`
- **Deployment record:** not built; key not configured; no known-question
  validation timestamp

## Reproducibility and deployment

- **Database:** `fintech_demo`
- **Fixture version:** `1.1.0`
- **Seed:** `20260725`
- **Logical epoch:** `2026-07-25T09:00:00Z`
- **Baseline checksum:** `cdb666fbd53c8735104c436c03a9e417927f7054cf36d09f6d84f1cf263897a5`
- **Recorded baseline rows:** 322,000
- **Recorded data verification:** 2026-07-25
- **Engine deployment record:** workspace `aws-virginia-8`, engine `10.1.0`;
  Aura read-only attachment remains recorded as `false`

Migrations are applied in lexical order:

1. `001_control.sql`
2. `002_dimensions.sql`
3. `003_a2_facts.sql`
4. `004_a2_views.sql`
5. `005_shared_dimensions.sql`
6. `006_a1_digital.sql`
7. `007_a3_fraud.sql`
8. `008_a4_aml.sql`
9. `009_a5_disputes.sql`
10. `010_a6_liquidity.sql`
11. `011_a7_credit.sql`
12. `012_a8_customer_money.sql`

The migration files are destructive/idempotent rebuild definitions: they drop
their owned objects before creating them. `python -m fintech_demo bootstrap`
creates/selects the database, applies all migrations, seeds template run 0, and
activates a cloned reset run. The environment manifest is the deployment record;
the migrations and Domain manifests remain the source of intent.
