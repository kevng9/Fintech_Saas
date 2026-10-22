-- A4 AML Operations fact tables and curated Aura views (spec sections 8.5,
-- 8.6). No predicted-disposition field is stored or exposed anywhere in this
-- migration: `aml_case_history.human_disposition` records how a prior,
-- already-closed case was resolved by a human, never a model prediction for
-- the open alerts in `aml_alert`.

DROP VIEW IF EXISTS aa_aml_entity_activity;

DROP VIEW IF EXISTS aa_aml_alert_evidence;

DROP VIEW IF EXISTS aa_aml_backlog;

DROP TABLE IF EXISTS aml_case_history;

DROP TABLE IF EXISTS aml_evidence;

DROP TABLE IF EXISTS aml_alert_transaction;

DROP TABLE IF EXISTS aml_alert;

CREATE TABLE aml_alert (
    run_id         BIGINT      NOT NULL,
    alert_id       VARCHAR(40) NOT NULL,
    customer_id    VARCHAR(24) NOT NULL,
    account_id     VARCHAR(24) NOT NULL,
    rule_id        VARCHAR(24) NOT NULL,
    priority       VARCHAR(16) NOT NULL,
    risk_band      VARCHAR(16) NOT NULL,
    created_at     DATETIME(6) NOT NULL,
    sla_due_at     DATETIME(6) NOT NULL,
    status         VARCHAR(24) NOT NULL,
    assigned_queue VARCHAR(32) NOT NULL,
    scenario_id    VARCHAR(64) NULL,
    SHARD KEY (run_id, alert_id),
    SORT KEY (run_id, created_at)
);

CREATE TABLE aml_alert_transaction (
    run_id      BIGINT      NOT NULL,
    alert_id    VARCHAR(40) NOT NULL,
    payment_id  VARCHAR(40) NOT NULL,
    scenario_id VARCHAR(64) NULL,
    SHARD KEY (run_id, alert_id),
    SORT KEY (run_id, alert_id)
);

CREATE TABLE aml_evidence (
    run_id               BIGINT       NOT NULL,
    evidence_id          VARCHAR(40)  NOT NULL,
    alert_id             VARCHAR(40)  NOT NULL,
    source_type          VARCHAR(32)  NOT NULL,
    source_id            VARCHAR(40)  NOT NULL,
    observed_at          DATETIME(6)  NOT NULL,
    fact_text            VARCHAR(512) NOT NULL,
    completeness_status  VARCHAR(24)  NOT NULL,
    scenario_id          VARCHAR(64)  NULL,
    SHARD KEY (run_id, evidence_id),
    SORT KEY (run_id, observed_at)
);

CREATE TABLE aml_case_history (
    run_id            BIGINT      NOT NULL,
    prior_case_id     VARCHAR(40) NOT NULL,
    customer_id       VARCHAR(24) NOT NULL,
    opened_at         DATETIME(6) NOT NULL,
    human_disposition VARCHAR(24) NOT NULL,
    SHARD KEY (run_id, prior_case_id),
    SORT KEY (run_id, opened_at)
);

CREATE VIEW aa_aml_backlog AS
SELECT
    aa.rule_id AS rule_id,
    aa.risk_band AS risk_band,
    aa.assigned_queue AS assigned_queue,
    aa.priority AS priority,
    COUNT(*) AS open_alert_count,
    SUM(CASE WHEN aa.priority = 'high' THEN 1 ELSE 0 END) AS high_priority_count,
    SUM(CASE WHEN aa.sla_due_at <= DATE_ADD(ar.logical_time, INTERVAL 24 HOUR) THEN 1 ELSE 0 END) AS sla_risk_count,
    AVG(TIMESTAMPDIFF(HOUR, aa.created_at, ar.logical_time)) AS avg_age_hours,
    MIN(aa.created_at) AS oldest_alert_at
FROM aml_alert aa
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = aa.run_id
WHERE aa.created_at <= ar.logical_time
  AND aa.status <> 'closed'
GROUP BY aa.rule_id, aa.risk_band, aa.assigned_queue, aa.priority;

CREATE VIEW aa_aml_alert_evidence AS
SELECT
    ae.evidence_id AS evidence_id,
    ae.alert_id AS alert_id,
    aa.rule_id AS rule_id,
    aa.risk_band AS risk_band,
    aa.assigned_queue AS assigned_queue,
    ae.source_type AS source_type,
    ae.source_id AS source_id,
    ae.observed_at AS observed_at,
    ae.fact_text AS fact_text,
    ae.completeness_status AS completeness_status,
    CASE WHEN ae.scenario_id IS NULL THEN 0 ELSE 1 END AS is_scenario_event,
    ae.scenario_id AS scenario_id
FROM aml_evidence ae
JOIN aml_alert aa ON aa.run_id = ae.run_id AND aa.alert_id = ae.alert_id
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = ae.run_id
WHERE ae.observed_at <= ar.logical_time;

CREATE VIEW aa_aml_entity_activity AS
SELECT
    aa.customer_id AS customer_id,
    dc.risk_tier AS customer_risk_tier,
    aa.account_id AS account_id,
    aa.risk_band AS risk_band,
    aa.assigned_queue AS assigned_queue,
    COUNT(DISTINCT at.payment_id) AS linked_transaction_count,
    SUM(pe.amount_usd) AS linked_transaction_amount_usd,
    COUNT(DISTINCT pe.merchant_id) AS distinct_counterparties,
    COUNT(DISTINCT pe.issuer_country) AS distinct_geographies,
    COALESCE(ch.prior_case_count, 0) AS prior_case_count
FROM aml_alert aa
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = aa.run_id
JOIN dim_customer dc ON dc.run_id = aa.run_id AND dc.customer_id = aa.customer_id
LEFT JOIN aml_alert_transaction at ON at.run_id = aa.run_id AND at.alert_id = aa.alert_id
LEFT JOIN payment_event pe
    ON pe.run_id = aa.run_id AND pe.payment_id = at.payment_id AND pe.event_time <= ar.logical_time
LEFT JOIN (
    SELECT run_id, customer_id, COUNT(*) AS prior_case_count
    FROM aml_case_history
    GROUP BY run_id, customer_id
) ch ON ch.run_id = aa.run_id AND ch.customer_id = aa.customer_id
WHERE aa.created_at <= ar.logical_time
GROUP BY aa.customer_id, dc.risk_tier, aa.account_id, aa.risk_band, aa.assigned_queue, ch.prior_case_count;
