-- Curated Aura views for A2 Payment Pulse (spec section 8.6).
-- Only these views are attached to the a2_payment_pulse Domain.
-- Every view joins demo_active_run so a Domain can only ever see the active
-- run, and every time filter uses the demo logical clock, never wall time.

DROP VIEW IF EXISTS aa_payment_performance_hourly;

DROP VIEW IF EXISTS aa_payment_decline_mix;

DROP VIEW IF EXISTS aa_payment_event_sample;

CREATE VIEW aa_payment_performance_hourly AS
SELECT
    DATE_TRUNC('hour', pe.event_time) AS hour_start,
    pe.processor_id AS processor_id,
    dp.processor_name AS processor_name,
    pe.rail AS rail,
    pe.card_network AS card_network,
    pe.issuer_country AS issuer_country,
    COUNT(*) AS attempts,
    SUM(pe.approved) AS approvals,
    SUM(1 - pe.approved) AS declines,
    SUM(CASE WHEN pe.response_code = 'TIMEOUT' THEN 1 ELSE 0 END) AS timeout_declines,
    SUM(pe.approved) / COUNT(*) AS approval_rate,
    SUM(CASE WHEN pe.response_code = 'TIMEOUT' THEN 1 ELSE 0 END) / COUNT(*) AS timeout_decline_rate,
    APPROX_PERCENTILE(pe.latency_ms, 0.95) AS p95_latency_ms,
    AVG(pe.latency_ms) AS avg_latency_ms,
    SUM(pe.amount_usd) AS amount_attempted_usd,
    SUM(CASE WHEN pe.approved = 1 THEN pe.amount_usd ELSE 0 END) AS amount_approved_usd,
    SUM(CASE WHEN pe.approved = 0 THEN pe.amount_usd ELSE 0 END) AS amount_declined_usd,
    dp.contracted_sla_ms AS contracted_sla_ms
FROM payment_event pe
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = pe.run_id
JOIN dim_processor dp ON dp.run_id = pe.run_id AND dp.processor_id = pe.processor_id
WHERE pe.event_time <= ar.logical_time
GROUP BY
    DATE_TRUNC('hour', pe.event_time),
    pe.processor_id,
    dp.processor_name,
    pe.rail,
    pe.card_network,
    pe.issuer_country,
    dp.contracted_sla_ms;

CREATE VIEW aa_payment_decline_mix AS
SELECT
    g.hour_start AS hour_start,
    g.processor_id AS processor_id,
    g.processor_name AS processor_name,
    g.card_network AS card_network,
    g.issuer_country AS issuer_country,
    g.merchant_category AS merchant_category,
    g.response_code AS response_code,
    g.decline_count AS decline_count,
    g.avg_latency_ms AS avg_latency_ms,
    g.declined_amount_usd AS declined_amount_usd,
    SUM(g.decline_count) OVER (PARTITION BY g.hour_start, g.processor_id) AS processor_hour_declines,
    g.decline_count / SUM(g.decline_count) OVER (PARTITION BY g.hour_start, g.processor_id) AS share_of_processor_hour_declines
FROM (
    SELECT
        DATE_TRUNC('hour', pe.event_time) AS hour_start,
        pe.processor_id AS processor_id,
        dp.processor_name AS processor_name,
        pe.card_network AS card_network,
        pe.issuer_country AS issuer_country,
        dm.merchant_category AS merchant_category,
        pe.response_code AS response_code,
        COUNT(*) AS decline_count,
        AVG(pe.latency_ms) AS avg_latency_ms,
        SUM(pe.amount_usd) AS declined_amount_usd
    FROM payment_event pe
    JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = pe.run_id
    JOIN dim_processor dp ON dp.run_id = pe.run_id AND dp.processor_id = pe.processor_id
    JOIN dim_merchant dm ON dm.run_id = pe.run_id AND dm.merchant_id = pe.merchant_id
    WHERE pe.event_time <= ar.logical_time
      AND pe.approved = 0
    GROUP BY
        DATE_TRUNC('hour', pe.event_time),
        pe.processor_id,
        dp.processor_name,
        pe.card_network,
        pe.issuer_country,
        dm.merchant_category,
        pe.response_code
) g;

CREATE VIEW aa_payment_event_sample AS
SELECT
    pe.payment_id AS payment_id,
    pe.event_time AS event_time,
    pe.processor_id AS processor_id,
    dp.processor_name AS processor_name,
    pe.rail AS rail,
    pe.card_network AS card_network,
    pe.issuer_country AS issuer_country,
    dg.country_name AS issuer_country_name,
    pe.merchant_id AS merchant_id,
    dm.merchant_name AS merchant_name,
    dm.merchant_category AS merchant_category,
    pe.customer_id AS customer_id,
    pe.amount AS amount,
    pe.amount_usd AS amount_usd,
    pe.currency AS currency,
    pe.response_code AS response_code,
    pe.approved AS approved,
    pe.latency_ms AS latency_ms,
    CASE WHEN pe.scenario_id IS NULL THEN 0 ELSE 1 END AS is_scenario_event,
    pe.scenario_id AS scenario_id
FROM payment_event pe
JOIN demo_active_run ar ON ar.singleton_id = 1 AND ar.run_id = pe.run_id
JOIN dim_processor dp ON dp.run_id = pe.run_id AND dp.processor_id = pe.processor_id
JOIN dim_merchant dm ON dm.run_id = pe.run_id AND dm.merchant_id = pe.merchant_id
LEFT JOIN dim_geography dg ON dg.country = pe.issuer_country
WHERE pe.event_time <= ar.logical_time
  AND pe.event_time >= DATE_SUB(ar.logical_time, INTERVAL 6 HOUR);
