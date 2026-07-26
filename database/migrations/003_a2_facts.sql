-- A2 Payment Pulse fact table (spec section 8.5).
-- Synthetic authorization attempts only. No PAN, CVV, bank account number, or
-- any other real payment credential is stored or generated.
--
-- amount is the presentment amount in the issuer currency. amount_usd is the
-- same attempt converted with the fixed synthetic rates in the simulator's
-- model module, so value totals can be summed across issuer countries. The
-- rates are constants of the demo fixture, not market data.

DROP TABLE IF EXISTS payment_event;

CREATE TABLE payment_event (
    run_id         BIGINT        NOT NULL,
    payment_id     VARCHAR(40)   NOT NULL,
    sequence_no    BIGINT        NOT NULL,
    event_time     DATETIME(6)   NOT NULL,
    customer_id    VARCHAR(24)   NOT NULL,
    merchant_id    VARCHAR(24)   NOT NULL,
    processor_id   VARCHAR(16)   NOT NULL,
    rail           VARCHAR(24)   NOT NULL,
    card_network   VARCHAR(24)   NOT NULL,
    amount         DECIMAL(12,2) NOT NULL,
    amount_usd     DECIMAL(12,2) NOT NULL,
    currency       VARCHAR(3)    NOT NULL,
    response_code  VARCHAR(32)   NOT NULL,
    approved       BOOL          NOT NULL,
    latency_ms     INT           NOT NULL,
    issuer_country VARCHAR(2)    NOT NULL,
    scenario_id    VARCHAR(64)   NULL,
    SHARD KEY (run_id, payment_id),
    SORT KEY (run_id, event_time)
);
