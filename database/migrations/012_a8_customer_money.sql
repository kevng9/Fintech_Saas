-- A8 Customer Money fact tables and curated Aura views (spec sections 8.5,
-- 8.6, and the A8 customer-scoping rule in section 12.3).
--
-- The spec names the field-facing identity `CUST-DEMO-001`. This build's
-- customer dimension is seeded as `CUST-0001` through `CUST-0500`
-- (`dim_customer`, see `simulator/fintech_demo/model.py:customer_id`), so
-- `CUST-0001` is the demo customer used everywhere a single A8 identity is
-- required. Do not rely on natural-language scoping alone: every A8
-- evidence view below is physically filtered to `customer_id = 'CUST-0001'`
-- in addition to joining `demo_active_run`, and every view still selects
-- `customer_id` so the FastAPI layer can verify the row belongs to the
-- authenticated A8 identity before returning it.

DROP VIEW IF EXISTS aa_customer_transaction_evidence;

DROP VIEW IF EXISTS aa_customer_spend_change;

DROP VIEW IF EXISTS aa_customer_money_summary;

DROP TABLE IF EXISTS customer_financial_daily;

DROP TABLE IF EXISTS customer_transaction;

CREATE TABLE customer_transaction (
    run_id         BIGINT        NOT NULL,
    transaction_id VARCHAR(40)   NOT NULL,
    customer_id    VARCHAR(24)   NOT NULL,
    account_id     VARCHAR(24)   NOT NULL,
    event_time     DATETIME(6)   NOT NULL,
    merchant_id    VARCHAR(24)   NOT NULL,
    category       VARCHAR(32)   NOT NULL,
    amount         DECIMAL(12,2) NOT NULL,
    amount_usd     DECIMAL(12,2) NOT NULL,
    currency       VARCHAR(3)    NOT NULL,
    direction      VARCHAR(12)   NOT NULL,
    scenario_id    VARCHAR(64)   NULL,
    SHARD KEY (run_id, transaction_id),
    SORT KEY (run_id, event_time)
);

CREATE TABLE customer_financial_daily (
    run_id         BIGINT        NOT NULL,
    customer_id    VARCHAR(24)   NOT NULL,
    date           DATE          NOT NULL,
    inflows        DECIMAL(12,2) NOT NULL,
    outflows       DECIMAL(12,2) NOT NULL,
    net_flow       DECIMAL(12,2) NOT NULL,
    ending_balance DECIMAL(12,2) NOT NULL,
    SHARD KEY (run_id, customer_id),
    SORT KEY (run_id, date)
);

CREATE VIEW aa_customer_money_summary AS
SELECT
    cfd.customer_id AS customer_id,
    cfd.date AS activity_date,
    cfd.inflows AS inflows,
    cfd.outflows AS outflows,
    cfd.net_flow AS net_flow,
    cfd.ending_balance AS ending_balance
FROM customer_financial_daily cfd
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = cfd.run_id
WHERE cfd.date <= DATE(ar.logical_time)
  AND cfd.customer_id = 'CUST-0001';

CREATE VIEW aa_customer_spend_change AS
SELECT
    ct.customer_id AS customer_id,
    DATE_TRUNC('month', ct.event_time) AS spend_month,
    ct.category AS category,
    COUNT(*) AS transaction_count,
    SUM(CASE WHEN ct.direction = 'outflow' THEN ct.amount_usd ELSE 0 END) AS category_spend_usd
FROM customer_transaction ct
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = ct.run_id
WHERE ct.event_time <= ar.logical_time
  AND ct.customer_id = 'CUST-0001'
GROUP BY ct.customer_id, DATE_TRUNC('month', ct.event_time), ct.category;

CREATE VIEW aa_customer_transaction_evidence AS
SELECT
    ct.transaction_id AS transaction_id,
    ct.customer_id AS customer_id,
    ct.account_id AS account_id,
    ct.event_time AS event_time,
    ct.merchant_id AS merchant_id,
    dm.merchant_name AS merchant_name,
    ct.category AS category,
    ct.amount AS amount,
    ct.amount_usd AS amount_usd,
    ct.currency AS currency,
    ct.direction AS direction,
    CASE WHEN ct.scenario_id IS NULL THEN 0 ELSE 1 END AS is_scenario_event,
    ct.scenario_id AS scenario_id
FROM customer_transaction ct
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = ct.run_id
LEFT JOIN dim_merchant dm ON dm.run_id = ct.run_id AND dm.merchant_id = ct.merchant_id
WHERE ct.event_time <= ar.logical_time
  AND ct.customer_id = 'CUST-0001';
