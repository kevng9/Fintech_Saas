-- A5 Disputes Operations fact tables and curated Aura views (spec sections
-- 8.5, 8.6). `dispute_case.status` moves through 'open' -> 'pending_customer'
-- -> 'closed'; SLA risk is computed from `due_at` against the demo logical
-- clock, never wall-clock time. Merchant columns come from the disputed
-- payment (payment_event -> dim_merchant), so concentration on one merchant
-- is visible without storing merchant_id on dispute_case.

DROP VIEW IF EXISTS aa_dispute_timeline;

DROP VIEW IF EXISTS aa_dispute_queue_driver;

DROP VIEW IF EXISTS aa_dispute_sla_risk;

DROP TABLE IF EXISTS provisional_credit;

DROP TABLE IF EXISTS customer_contact;

DROP TABLE IF EXISTS dispute_event;

DROP TABLE IF EXISTS dispute_case;

CREATE TABLE dispute_case (
    run_id          BIGINT        NOT NULL,
    dispute_id      VARCHAR(40)   NOT NULL,
    payment_id      VARCHAR(40)   NOT NULL,
    customer_id     VARCHAR(24)   NOT NULL,
    opened_at       DATETIME(6)   NOT NULL,
    due_at          DATETIME(6)   NOT NULL,
    status          VARCHAR(24)   NOT NULL,
    reason_code     VARCHAR(32)   NOT NULL,
    priority        VARCHAR(16)   NOT NULL,
    queue_id        VARCHAR(24)   NOT NULL,
    owner_id        VARCHAR(24)   NOT NULL,
    disputed_amount DECIMAL(12,2) NOT NULL,
    scenario_id     VARCHAR(64)   NULL,
    SHARD KEY (run_id, dispute_id),
    SORT KEY (run_id, opened_at)
);

CREATE TABLE dispute_event (
    run_id      BIGINT      NOT NULL,
    event_id    VARCHAR(40) NOT NULL,
    dispute_id  VARCHAR(40) NOT NULL,
    event_type  VARCHAR(32) NOT NULL,
    event_time  DATETIME(6) NOT NULL,
    actor_type  VARCHAR(16) NOT NULL,
    metadata    JSON        NULL,
    scenario_id VARCHAR(64) NULL,
    SHARD KEY (run_id, event_id),
    SORT KEY (run_id, event_time)
);

CREATE TABLE customer_contact (
    run_id      BIGINT      NOT NULL,
    contact_id  VARCHAR(40) NOT NULL,
    dispute_id  VARCHAR(40) NOT NULL,
    channel     VARCHAR(24) NOT NULL,
    direction   VARCHAR(12) NOT NULL,
    occurred_at DATETIME(6) NOT NULL,
    SHARD KEY (run_id, contact_id),
    SORT KEY (run_id, occurred_at)
);

CREATE TABLE provisional_credit (
    run_id      BIGINT        NOT NULL,
    credit_id   VARCHAR(40)   NOT NULL,
    dispute_id  VARCHAR(40)   NOT NULL,
    amount      DECIMAL(12,2) NOT NULL,
    status      VARCHAR(24)   NOT NULL,
    event_time  DATETIME(6)   NOT NULL,
    SHARD KEY (run_id, credit_id),
    SORT KEY (run_id, event_time)
);

CREATE VIEW aa_dispute_sla_risk AS
SELECT
    DATE(dc.opened_at) AS opened_date,
    dc.queue_id AS queue_id,
    dc.reason_code AS reason_code,
    dc.priority AS priority,
    pe.merchant_id AS merchant_id,
    dm.merchant_name AS merchant_name,
    COUNT(*) AS open_dispute_count,
    SUM(CASE WHEN dc.due_at <= DATE_ADD(ar.logical_time, INTERVAL 24 HOUR) THEN 1 ELSE 0 END) AS sla_risk_count,
    SUM(CASE
        WHEN dc.due_at <= DATE_ADD(ar.logical_time, INTERVAL 24 HOUR) THEN dc.disputed_amount
        ELSE 0
    END) AS sla_risk_amount_total,
    SUM(dc.disputed_amount) AS disputed_amount_total,
    MIN(dc.due_at) AS nearest_due_at
FROM dispute_case dc
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = dc.run_id
LEFT JOIN payment_event pe ON pe.run_id = dc.run_id AND pe.payment_id = dc.payment_id
LEFT JOIN dim_merchant dm ON dm.run_id = pe.run_id AND dm.merchant_id = pe.merchant_id
WHERE dc.opened_at <= ar.logical_time
  AND dc.status <> 'closed'
GROUP BY DATE(dc.opened_at), dc.queue_id, dc.reason_code, dc.priority, pe.merchant_id, dm.merchant_name;

CREATE VIEW aa_dispute_queue_driver AS
SELECT
    DATE(dc.opened_at) AS opened_date,
    dc.queue_id AS queue_id,
    dc.reason_code AS reason_code,
    pe.merchant_id AS merchant_id,
    dm.merchant_name AS merchant_name,
    COUNT(*) AS dispute_count,
    SUM(dc.disputed_amount) AS disputed_amount_total,
    AVG(dc.disputed_amount) AS avg_disputed_amount,
    SUM(CASE WHEN dc.scenario_id IS NULL THEN 0 ELSE 1 END) AS scenario_dispute_count
FROM dispute_case dc
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = dc.run_id
LEFT JOIN payment_event pe ON pe.run_id = dc.run_id AND pe.payment_id = dc.payment_id
LEFT JOIN dim_merchant dm ON dm.run_id = pe.run_id AND dm.merchant_id = pe.merchant_id
WHERE dc.opened_at <= ar.logical_time
GROUP BY DATE(dc.opened_at), dc.queue_id, dc.reason_code, pe.merchant_id, dm.merchant_name;

CREATE VIEW aa_dispute_timeline AS
SELECT
    de.dispute_id AS dispute_id,
    de.event_time AS event_time,
    'case_event' AS timeline_type,
    de.event_type AS event_type,
    de.actor_type AS actor_type,
    NULL AS amount,
    de.metadata AS metadata
FROM dispute_event de
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = de.run_id
WHERE de.event_time <= ar.logical_time
UNION ALL
SELECT
    cc.dispute_id AS dispute_id,
    cc.occurred_at AS event_time,
    'customer_contact' AS timeline_type,
    CONCAT(cc.channel, '_', cc.direction) AS event_type,
    cc.direction AS actor_type,
    NULL AS amount,
    NULL AS metadata
FROM customer_contact cc
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = cc.run_id
WHERE cc.occurred_at <= ar.logical_time
UNION ALL
SELECT
    pc.dispute_id AS dispute_id,
    pc.event_time AS event_time,
    'provisional_credit' AS timeline_type,
    pc.status AS event_type,
    'system' AS actor_type,
    pc.amount AS amount,
    NULL AS metadata
FROM provisional_credit pc
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = pc.run_id
WHERE pc.event_time <= ar.logical_time;
