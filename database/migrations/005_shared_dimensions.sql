-- Shared synthetic dimensions used by more than one anchor (spec section 8.4).
-- dim_customer, dim_account, dim_merchant, dim_processor, and dim_geography
-- were seeded in 002_dimensions.sql for A2. This migration adds the remaining
-- shared dimensions needed by A1 and A3 through A8: product, device, entity,
-- and counterparty. Every row is scoped to a run_id so a reset can build a
-- replacement run alongside the active one and switch the pointer atomically.

DROP TABLE IF EXISTS dim_counterparty;

DROP TABLE IF EXISTS dim_entity;

DROP TABLE IF EXISTS dim_device;

DROP TABLE IF EXISTS dim_product;

CREATE ROWSTORE TABLE dim_product (
    run_id         BIGINT      NOT NULL,
    product_id     VARCHAR(24) NOT NULL,
    product_name   VARCHAR(64) NOT NULL,
    product_family VARCHAR(32) NOT NULL,
    channel        VARCHAR(24) NOT NULL,
    -- Illustrative first-year revenue per opened account, set per product
    -- family. Used to put a dollar value on lost account openings (A1).
    annual_value_usd DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (run_id, product_id)
);

CREATE ROWSTORE TABLE dim_device (
    run_id      BIGINT      NOT NULL,
    device_id   VARCHAR(24) NOT NULL,
    device_type VARCHAR(24) NOT NULL,
    os_family   VARCHAR(24) NOT NULL,
    risk_band   VARCHAR(16) NOT NULL,
    PRIMARY KEY (run_id, device_id)
);

CREATE ROWSTORE TABLE dim_entity (
    run_id      BIGINT      NOT NULL,
    entity_id   VARCHAR(24) NOT NULL,
    entity_name VARCHAR(64) NOT NULL,
    entity_type VARCHAR(32) NOT NULL,
    region      VARCHAR(32) NOT NULL,
    currency    VARCHAR(3)  NOT NULL,
    PRIMARY KEY (run_id, entity_id)
);

CREATE ROWSTORE TABLE dim_counterparty (
    run_id             BIGINT      NOT NULL,
    counterparty_id    VARCHAR(24) NOT NULL,
    counterparty_name  VARCHAR(64) NOT NULL,
    country            VARCHAR(2)  NOT NULL,
    risk_band          VARCHAR(16) NOT NULL,
    PRIMARY KEY (run_id, counterparty_id)
);
