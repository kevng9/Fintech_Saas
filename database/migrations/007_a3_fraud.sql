-- A3 Fraud Strategy fact tables and curated Aura views (spec sections 8.5,
-- 8.6). An alert or model score alone is never confirmed fraud: every loss
-- and false-positive metric is derived from `fraud_case.human_disposition`,
-- which settles on 'confirmed_fraud', 'legitimate', or stays 'open'.
-- `confirmed_loss` is non-zero only when human_disposition = 'confirmed_fraud';
-- the simulator enforces this at generation time, not the schema.

DROP VIEW IF EXISTS aa_fraud_case_review;

DROP VIEW IF EXISTS aa_fraud_segment_evidence;

DROP VIEW IF EXISTS aa_fraud_loss_summary;

DROP TABLE IF EXISTS fraud_evidence;

DROP TABLE IF EXISTS fraud_case;

DROP TABLE IF EXISTS fraud_alert;

CREATE TABLE fraud_alert (
    run_id       BIGINT        NOT NULL,
    alert_id     VARCHAR(40)   NOT NULL,
    payment_id   VARCHAR(40)   NOT NULL,
    device_id    VARCHAR(24)   NULL,
    channel      VARCHAR(24)   NOT NULL,
    created_at   DATETIME(6)   NOT NULL,
    score        DECIMAL(5,4)  NOT NULL,
    fraud_type   VARCHAR(32)   NOT NULL,
    reason_codes JSON          NOT NULL,
    status       VARCHAR(24)   NOT NULL,
    scenario_id  VARCHAR(64)   NULL,
    SHARD KEY (run_id, alert_id),
    SORT KEY (run_id, created_at)
);

CREATE TABLE fraud_case (
    run_id            BIGINT        NOT NULL,
    case_id           VARCHAR(40)   NOT NULL,
    alert_id          VARCHAR(40)   NOT NULL,
    opened_at         DATETIME(6)   NOT NULL,
    closed_at         DATETIME(6)   NULL,
    investigator_id   VARCHAR(24)   NOT NULL,
    human_disposition VARCHAR(24)   NOT NULL,
    confirmed_loss    DECIMAL(12,2) NOT NULL DEFAULT 0,
    notes             VARCHAR(512)  NULL,
    scenario_id       VARCHAR(64)   NULL,
    SHARD KEY (run_id, case_id),
    SORT KEY (run_id, opened_at)
);

CREATE TABLE fraud_evidence (
    run_id         BIGINT       NOT NULL,
    evidence_id    VARCHAR(40)  NOT NULL,
    case_id        VARCHAR(40)  NOT NULL,
    evidence_type  VARCHAR(32)  NOT NULL,
    source_id      VARCHAR(40)  NOT NULL,
    observed_value VARCHAR(256) NOT NULL,
    observed_at    DATETIME(6)  NOT NULL,
    scenario_id    VARCHAR(64)  NULL,
    SHARD KEY (run_id, evidence_id),
    SORT KEY (run_id, observed_at)
);

CREATE VIEW aa_fraud_loss_summary AS
SELECT
    fa.channel AS channel,
    fa.fraud_type AS fraud_type,
    COUNT(DISTINCT fc.case_id) AS cases_total,
    SUM(CASE WHEN fc.human_disposition = 'confirmed_fraud' THEN 1 ELSE 0 END) AS confirmed_fraud_cases,
    SUM(CASE WHEN fc.human_disposition = 'legitimate' THEN 1 ELSE 0 END) AS legitimate_cases,
    SUM(CASE WHEN fc.human_disposition = 'open' THEN 1 ELSE 0 END) AS open_cases,
    SUM(CASE WHEN fc.human_disposition = 'confirmed_fraud' THEN fc.confirmed_loss ELSE 0 END) AS confirmed_loss_usd,
    SUM(CASE WHEN fc.human_disposition = 'legitimate' THEN 1 ELSE 0 END)
        / NULLIF(SUM(CASE WHEN fc.human_disposition IN ('confirmed_fraud', 'legitimate') THEN 1 ELSE 0 END), 0)
        AS false_positive_rate
FROM fraud_case fc
JOIN fraud_alert fa ON fa.run_id = fc.run_id AND fa.alert_id = fc.alert_id
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = fc.run_id
WHERE fc.opened_at <= ar.logical_time
GROUP BY fa.channel, fa.fraud_type;

CREATE VIEW aa_fraud_segment_evidence AS
SELECT
    fc.case_id AS case_id,
    fa.alert_id AS alert_id,
    fa.channel AS channel,
    fa.fraud_type AS fraud_type,
    fa.score AS score,
    fa.reason_codes AS reason_codes,
    pe.merchant_id AS merchant_id,
    dm.merchant_name AS merchant_name,
    dm.merchant_category AS merchant_category,
    pe.customer_id AS customer_id,
    dc.risk_tier AS customer_risk_tier,
    DATEDIFF(fa.created_at, dc.relationship_start) AS account_age_days,
    fa.device_id AS device_id,
    dd.device_type AS device_type,
    dd.risk_band AS device_risk_band,
    COUNT(*) OVER (PARTITION BY fa.device_id) AS device_alert_count,
    COUNT(*) OVER (PARTITION BY pe.customer_id) AS customer_alert_count,
    pe.amount_usd AS amount_usd,
    fc.human_disposition AS human_disposition,
    fc.confirmed_loss AS confirmed_loss_usd
FROM fraud_case fc
JOIN fraud_alert fa ON fa.run_id = fc.run_id AND fa.alert_id = fc.alert_id
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = fc.run_id
JOIN payment_event pe ON pe.run_id = fa.run_id AND pe.payment_id = fa.payment_id
JOIN dim_merchant dm ON dm.run_id = pe.run_id AND dm.merchant_id = pe.merchant_id
JOIN dim_customer dc ON dc.run_id = pe.run_id AND dc.customer_id = pe.customer_id
LEFT JOIN dim_device dd ON dd.run_id = fa.run_id AND dd.device_id = fa.device_id
WHERE fc.opened_at <= ar.logical_time;

CREATE VIEW aa_fraud_case_review AS
SELECT
    fc.case_id AS case_id,
    fc.alert_id AS alert_id,
    fa.fraud_type AS fraud_type,
    fa.channel AS channel,
    fa.score AS score,
    fc.opened_at AS opened_at,
    fc.closed_at AS closed_at,
    fc.investigator_id AS investigator_id,
    fc.human_disposition AS human_disposition,
    fc.confirmed_loss AS confirmed_loss_usd,
    fc.notes AS notes,
    COUNT(fe.evidence_id) AS evidence_count,
    MAX(fe.observed_at) AS latest_evidence_at
FROM fraud_case fc
JOIN fraud_alert fa ON fa.run_id = fc.run_id AND fa.alert_id = fc.alert_id
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = fc.run_id
LEFT JOIN fraud_evidence fe ON fe.run_id = fc.run_id AND fe.case_id = fc.case_id
WHERE fc.opened_at <= ar.logical_time
GROUP BY
    fc.case_id, fc.alert_id, fa.fraud_type, fa.channel, fa.score,
    fc.opened_at, fc.closed_at, fc.investigator_id, fc.human_disposition,
    fc.confirmed_loss, fc.notes;
