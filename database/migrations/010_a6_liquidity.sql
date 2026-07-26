-- A6 Liquidity fact tables and curated Aura views (spec sections 8.5, 8.6).
-- Positions and forecasts can be denominated in any of the demo's synthetic
-- currencies, so every table also carries a *_usd column for cross-currency
-- aggregation. `created_at` on `settlement` and `queued_payment` is when the
-- obligation became known to the ledger (filtered against the logical
-- clock); `due_at` is the forward-looking date used for funding-window and
-- variance math and is allowed to be later than the current logical time.
--
-- "Latest row per key" lookups (current cash position) are written as a
-- GROUP BY + join derived table rather than a correlated subquery, since
-- SingleStore's distributed query engine cannot always rewrite a correlated
-- subquery into a join.

DROP VIEW IF EXISTS aa_funding_window;

DROP VIEW IF EXISTS aa_liquidity_variance;

DROP VIEW IF EXISTS aa_liquidity_position;

DROP TABLE IF EXISTS cash_flow_forecast;

DROP TABLE IF EXISTS queued_payment;

DROP TABLE IF EXISTS settlement;

DROP TABLE IF EXISTS cash_position_snapshot;

CREATE TABLE cash_position_snapshot (
    run_id                BIGINT        NOT NULL,
    snapshot_time         DATETIME(6)   NOT NULL,
    entity_id             VARCHAR(24)   NOT NULL,
    account_id            VARCHAR(24)   NOT NULL,
    currency              VARCHAR(3)    NOT NULL,
    ledger_balance        DECIMAL(18,2) NOT NULL,
    available_balance     DECIMAL(18,2) NOT NULL,
    ledger_balance_usd    DECIMAL(18,2) NOT NULL,
    available_balance_usd DECIMAL(18,2) NOT NULL,
    SHARD KEY (run_id, entity_id, account_id),
    SORT KEY (run_id, snapshot_time)
);

CREATE TABLE settlement (
    run_id          BIGINT        NOT NULL,
    settlement_id   VARCHAR(40)   NOT NULL,
    entity_id       VARCHAR(24)   NOT NULL,
    counterparty_id VARCHAR(24)   NOT NULL,
    currency        VARCHAR(3)    NOT NULL,
    amount          DECIMAL(18,2) NOT NULL,
    amount_usd      DECIMAL(18,2) NOT NULL,
    direction       VARCHAR(12)   NOT NULL,
    created_at      DATETIME(6)   NOT NULL,
    due_at          DATETIME(6)   NOT NULL,
    status          VARCHAR(24)   NOT NULL,
    scenario_id     VARCHAR(64)   NULL,
    SHARD KEY (run_id, settlement_id),
    SORT KEY (run_id, due_at)
);

CREATE TABLE queued_payment (
    run_id             BIGINT        NOT NULL,
    queued_payment_id  VARCHAR(40)   NOT NULL,
    entity_id          VARCHAR(24)   NOT NULL,
    currency           VARCHAR(3)    NOT NULL,
    amount             DECIMAL(18,2) NOT NULL,
    amount_usd         DECIMAL(18,2) NOT NULL,
    created_at         DATETIME(6)   NOT NULL,
    due_at             DATETIME(6)   NOT NULL,
    status             VARCHAR(24)   NOT NULL,
    SHARD KEY (run_id, queued_payment_id),
    SORT KEY (run_id, due_at)
);

CREATE TABLE cash_flow_forecast (
    run_id              BIGINT        NOT NULL,
    forecast_time       DATETIME(6)   NOT NULL,
    bucket_time         DATETIME(6)   NOT NULL,
    entity_id           VARCHAR(24)   NOT NULL,
    currency            VARCHAR(3)    NOT NULL,
    expected_inflow     DECIMAL(18,2) NOT NULL,
    expected_outflow    DECIMAL(18,2) NOT NULL,
    expected_inflow_usd DECIMAL(18,2) NOT NULL,
    expected_outflow_usd DECIMAL(18,2) NOT NULL,
    model_version       VARCHAR(20)   NOT NULL,
    SHARD KEY (run_id, entity_id, bucket_time),
    SORT KEY (run_id, bucket_time)
);

CREATE VIEW aa_liquidity_position AS
SELECT
    cp.entity_id AS entity_id,
    de.entity_name AS entity_name,
    cp.account_id AS account_id,
    cp.currency AS currency,
    cp.snapshot_time AS as_of_time,
    cp.ledger_balance AS ledger_balance,
    cp.available_balance AS available_balance,
    cp.available_balance_usd AS available_balance_usd,
    COALESCE(s.expected_inbound_usd, 0) AS expected_inbound_settlements_usd,
    COALESCE(s.expected_outbound_usd, 0) AS expected_outbound_settlements_usd,
    COALESCE(q.queued_outbound_usd, 0) AS queued_payments_usd,
    cp.available_balance_usd
        + COALESCE(s.expected_inbound_usd, 0)
        - COALESCE(s.expected_outbound_usd, 0)
        - COALESCE(q.queued_outbound_usd, 0) AS available_liquidity_24h_usd
FROM cash_position_snapshot cp
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = cp.run_id
JOIN (
    -- Latest snapshot at or before the logical clock, per account and
    -- currency. A join-based "latest row" pattern instead of a correlated
    -- subquery, since SingleStore's distributed optimizer cannot always
    -- transform a correlated subquery into a join.
    SELECT cps.run_id, cps.entity_id, cps.account_id, cps.currency, MAX(cps.snapshot_time) AS latest_snapshot_time
    FROM cash_position_snapshot cps
    JOIN demo_active_run ar2
        ON ar2.singleton_id = 1 AND ar2.run_id = cps.run_id AND cps.snapshot_time <= ar2.logical_time
    GROUP BY cps.run_id, cps.entity_id, cps.account_id, cps.currency
) latest
    ON latest.run_id = cp.run_id
   AND latest.entity_id = cp.entity_id
   AND latest.account_id = cp.account_id
   AND latest.currency = cp.currency
   AND latest.latest_snapshot_time = cp.snapshot_time
JOIN dim_entity de ON de.run_id = cp.run_id AND de.entity_id = cp.entity_id
LEFT JOIN (
    SELECT run_id, entity_id, currency,
        SUM(CASE WHEN direction = 'inbound' THEN amount_usd ELSE 0 END) AS expected_inbound_usd,
        SUM(CASE WHEN direction = 'outbound' THEN amount_usd ELSE 0 END) AS expected_outbound_usd
    FROM settlement
    WHERE status = 'pending'
    GROUP BY run_id, entity_id, currency
) s ON s.run_id = cp.run_id AND s.entity_id = cp.entity_id AND s.currency = cp.currency
LEFT JOIN (
    SELECT run_id, entity_id, currency, SUM(amount_usd) AS queued_outbound_usd
    FROM queued_payment
    WHERE status = 'queued'
    GROUP BY run_id, entity_id, currency
) q ON q.run_id = cp.run_id AND q.entity_id = cp.entity_id AND q.currency = cp.currency
WHERE cp.snapshot_time <= ar.logical_time;

CREATE VIEW aa_liquidity_variance AS
SELECT
    cf.bucket_time AS bucket_time,
    cf.entity_id AS entity_id,
    de.entity_name AS entity_name,
    cf.currency AS currency,
    cf.expected_inflow_usd AS expected_inflow_usd,
    cf.expected_outflow_usd AS expected_outflow_usd,
    (cf.expected_inflow_usd - cf.expected_outflow_usd) AS forecast_net_flow_usd,
    COALESCE(a.actual_inflow_usd, 0) AS actual_inflow_usd,
    COALESCE(a.actual_outflow_usd, 0) AS actual_outflow_usd,
    (COALESCE(a.actual_inflow_usd, 0) - COALESCE(a.actual_outflow_usd, 0)) AS actual_net_flow_usd,
    (COALESCE(a.actual_inflow_usd, 0) - COALESCE(a.actual_outflow_usd, 0))
        - (cf.expected_inflow_usd - cf.expected_outflow_usd) AS forecast_variance_usd,
    cf.model_version AS model_version
FROM cash_flow_forecast cf
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = cf.run_id
JOIN dim_entity de ON de.run_id = cf.run_id AND de.entity_id = cf.entity_id
LEFT JOIN (
    SELECT run_id, entity_id, currency,
        DATE_TRUNC('hour', due_at) AS bucket_time,
        SUM(CASE WHEN direction = 'inbound' THEN amount_usd ELSE 0 END) AS actual_inflow_usd,
        SUM(CASE WHEN direction = 'outbound' THEN amount_usd ELSE 0 END) AS actual_outflow_usd
    FROM settlement
    WHERE status = 'settled'
    GROUP BY run_id, entity_id, currency, DATE_TRUNC('hour', due_at)
) a ON a.run_id = cf.run_id AND a.entity_id = cf.entity_id AND a.currency = cf.currency AND a.bucket_time = cf.bucket_time
WHERE cf.forecast_time <= ar.logical_time
  AND cf.bucket_time <= ar.logical_time;

CREATE VIEW aa_funding_window AS
SELECT
    qp.queued_payment_id AS queued_payment_id,
    qp.entity_id AS entity_id,
    de.entity_name AS entity_name,
    qp.currency AS currency,
    qp.amount AS amount,
    qp.amount_usd AS amount_usd,
    qp.due_at AS due_at,
    qp.status AS status,
    TIMESTAMPDIFF(MINUTE, ar.logical_time, qp.due_at) AS minutes_until_due,
    CASE WHEN qp.due_at <= DATE_ADD(ar.logical_time, INTERVAL 24 HOUR) THEN 1 ELSE 0 END AS in_next_funding_window
FROM queued_payment qp
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = qp.run_id
JOIN dim_entity de ON de.run_id = qp.run_id AND de.entity_id = qp.entity_id
WHERE qp.created_at <= ar.logical_time
  AND qp.status = 'queued'
  AND qp.due_at <= DATE_ADD(ar.logical_time, INTERVAL 7 DAY);
