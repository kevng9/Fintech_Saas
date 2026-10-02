-- A1 Digital Journey fact tables and curated Aura views (spec sections 8.5,
-- 8.6). Synthetic account-opening funnel only: session start, application
-- submission, optional manual-review referral, and a human/system outcome.
-- No protected-characteristic fields are generated.
--
-- current_stage / outcome_status on `application` move through
-- 'submitted' -> 'manual_review' -> 'decided', with outcome_status settling
-- on 'pending', 'approved', or 'declined'. `manual_review.status` settles on
-- 'open', 'approved', or 'declined'.
--
-- `submitted_value_usd` and `opened_value_usd` on aa_digital_intent_cohort
-- price each application at its product's illustrative first-year value
-- (dim_product.annual_value_usd). Lost value for a cohort is
-- submitted_value_usd x its baseline submit-to-open rate - opened_value_usd.

DROP VIEW IF EXISTS aa_digital_intent_cohort;

DROP VIEW IF EXISTS aa_digital_review_comparison;

DROP VIEW IF EXISTS aa_digital_funnel;

DROP TABLE IF EXISTS manual_review;

DROP TABLE IF EXISTS application;

DROP TABLE IF EXISTS digital_event;

DROP TABLE IF EXISTS digital_session;

CREATE TABLE digital_session (
    run_id        BIGINT       NOT NULL,
    session_id    VARCHAR(40)  NOT NULL,
    customer_id   VARCHAR(24)  NOT NULL,
    channel       VARCHAR(24)  NOT NULL,
    device_id     VARCHAR(24)  NOT NULL,
    campaign      VARCHAR(64)  NOT NULL,
    intent_cohort VARCHAR(32)  NOT NULL,
    started_at    DATETIME(6)  NOT NULL,
    scenario_id   VARCHAR(64)  NULL,
    SHARD KEY (run_id, session_id),
    SORT KEY (run_id, started_at)
);

CREATE TABLE digital_event (
    run_id      BIGINT       NOT NULL,
    event_id    VARCHAR(40)  NOT NULL,
    session_id  VARCHAR(40)  NOT NULL,
    event_time  DATETIME(6)  NOT NULL,
    stage       VARCHAR(32)  NOT NULL,
    event_type  VARCHAR(48)  NOT NULL,
    sequence_no BIGINT       NOT NULL,
    scenario_id VARCHAR(64)  NULL,
    SHARD KEY (run_id, event_id),
    SORT KEY (run_id, event_time)
);

CREATE TABLE application (
    run_id          BIGINT        NOT NULL,
    application_id  VARCHAR(40)   NOT NULL,
    session_id      VARCHAR(40)   NOT NULL,
    product_id      VARCHAR(24)   NOT NULL,
    submitted_at    DATETIME(6)   NOT NULL,
    current_stage   VARCHAR(32)   NOT NULL,
    outcome_status  VARCHAR(24)   NOT NULL,
    decision_at     DATETIME(6)   NULL,
    scenario_id     VARCHAR(64)   NULL,
    SHARD KEY (run_id, application_id),
    SORT KEY (run_id, submitted_at)
);

CREATE TABLE manual_review (
    run_id          BIGINT       NOT NULL,
    review_id       VARCHAR(40)  NOT NULL,
    application_id  VARCHAR(40)  NOT NULL,
    referred_at     DATETIME(6)  NOT NULL,
    reason_code     VARCHAR(32)  NOT NULL,
    status          VARCHAR(24)  NOT NULL,
    resolved_at     DATETIME(6)  NULL,
    scenario_id     VARCHAR(64)  NULL,
    SHARD KEY (run_id, review_id),
    SORT KEY (run_id, referred_at)
);

CREATE VIEW aa_digital_funnel AS
SELECT
    DATE(ds.started_at) AS session_date,
    ds.channel AS channel,
    COUNT(DISTINCT ds.session_id) AS sessions_started,
    COUNT(DISTINCT a.application_id) AS applications_submitted,
    COUNT(DISTINCT mr.review_id) AS referred_to_review,
    SUM(CASE WHEN a.outcome_status = 'approved' THEN 1 ELSE 0 END) AS applications_approved,
    SUM(CASE WHEN a.outcome_status = 'declined' THEN 1 ELSE 0 END) AS applications_declined,
    COUNT(DISTINCT a.application_id) / COUNT(DISTINCT ds.session_id) AS completion_rate,
    COUNT(DISTINCT mr.review_id) / NULLIF(COUNT(DISTINCT a.application_id), 0) AS referral_rate
FROM digital_session ds
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = ds.run_id
LEFT JOIN application a
    ON a.run_id = ds.run_id AND a.session_id = ds.session_id AND a.submitted_at <= ar.logical_time
LEFT JOIN manual_review mr
    ON mr.run_id = a.run_id AND mr.application_id = a.application_id AND mr.referred_at <= ar.logical_time
WHERE ds.started_at <= ar.logical_time
GROUP BY DATE(ds.started_at), ds.channel;

CREATE VIEW aa_digital_review_comparison AS
SELECT
    CASE WHEN mr.review_id IS NOT NULL THEN 'manual_review' ELSE 'straight_through' END AS review_path,
    a.product_id AS product_id,
    COUNT(DISTINCT a.application_id) AS applications,
    SUM(CASE WHEN a.outcome_status = 'approved' THEN 1 ELSE 0 END) AS approved,
    SUM(CASE WHEN a.outcome_status = 'declined' THEN 1 ELSE 0 END) AS declined,
    SUM(CASE WHEN a.outcome_status = 'approved' THEN 1 ELSE 0 END) / COUNT(DISTINCT a.application_id) AS approval_rate,
    AVG(TIMESTAMPDIFF(MINUTE, a.submitted_at, a.decision_at)) AS avg_minutes_to_decision
FROM application a
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = a.run_id
LEFT JOIN manual_review mr ON mr.run_id = a.run_id AND mr.application_id = a.application_id
WHERE a.submitted_at <= ar.logical_time
GROUP BY
    CASE WHEN mr.review_id IS NOT NULL THEN 'manual_review' ELSE 'straight_through' END,
    a.product_id;

CREATE VIEW aa_digital_intent_cohort AS
SELECT
    DATE(ds.started_at) AS session_date,
    ds.intent_cohort AS intent_cohort,
    ds.channel AS channel,
    COUNT(DISTINCT ds.session_id) AS sessions_started,
    COUNT(DISTINCT a.application_id) AS applications_submitted,
    COUNT(DISTINCT mr.review_id) AS referred_to_review,
    SUM(CASE WHEN a.outcome_status = 'approved' THEN 1 ELSE 0 END) AS applications_opened,
    COUNT(DISTINCT a.application_id) / COUNT(DISTINCT ds.session_id) AS submit_rate,
    SUM(CASE WHEN a.outcome_status = 'approved' THEN 1 ELSE 0 END)
        / NULLIF(COUNT(DISTINCT a.application_id), 0) AS submit_to_open_rate,
    COUNT(DISTINCT mr.review_id) / NULLIF(COUNT(DISTINCT a.application_id), 0) AS referral_rate,
    SUM(dp.annual_value_usd) AS submitted_value_usd,
    SUM(CASE WHEN a.outcome_status = 'approved' THEN dp.annual_value_usd ELSE 0 END) AS opened_value_usd,
    MAX(CASE
        WHEN ds.scenario_id IS NOT NULL OR a.scenario_id IS NOT NULL OR mr.scenario_id IS NOT NULL THEN 1
        ELSE 0
    END) AS has_scenario_activity
FROM digital_session ds
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = ds.run_id
LEFT JOIN application a
    ON a.run_id = ds.run_id AND a.session_id = ds.session_id AND a.submitted_at <= ar.logical_time
LEFT JOIN manual_review mr
    ON mr.run_id = a.run_id AND mr.application_id = a.application_id AND mr.referred_at <= ar.logical_time
LEFT JOIN dim_product dp ON dp.run_id = a.run_id AND dp.product_id = a.product_id
WHERE ds.started_at <= ar.logical_time
GROUP BY DATE(ds.started_at), ds.intent_cohort, ds.channel;
