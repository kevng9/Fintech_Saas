-- Shared synthetic dimensions (spec section 8.4).
-- Every row is scoped to a run_id so a reset can build a replacement run
-- alongside the active one and switch the pointer atomically.
-- Phase 2 seeds the dimensions A2 Payment Pulse needs. Dimensions for the
-- remaining anchors (device, entity, counterparty, product) arrive with their
-- anchor phases.

DROP TABLE IF EXISTS dim_customer;

DROP TABLE IF EXISTS dim_account;

DROP TABLE IF EXISTS dim_merchant;

DROP TABLE IF EXISTS dim_processor;

DROP TABLE IF EXISTS dim_geography;

CREATE ROWSTORE TABLE dim_customer (
    run_id             BIGINT       NOT NULL,
    customer_id        VARCHAR(24)  NOT NULL,
    synthetic_name     VARCHAR(64)  NOT NULL,
    segment            VARCHAR(32)  NOT NULL,
    region             VARCHAR(32)  NOT NULL,
    relationship_start DATE         NOT NULL,
    risk_tier          VARCHAR(16)  NOT NULL,
    consent_scope      VARCHAR(32)  NOT NULL,
    PRIMARY KEY (run_id, customer_id)
);

CREATE ROWSTORE TABLE dim_account (
    run_id       BIGINT      NOT NULL,
    account_id   VARCHAR(24) NOT NULL,
    customer_id  VARCHAR(24) NOT NULL,
    account_type VARCHAR(24) NOT NULL,
    currency     VARCHAR(3)  NOT NULL,
    opened_at    DATE        NOT NULL,
    status       VARCHAR(16) NOT NULL,
    PRIMARY KEY (run_id, account_id)
);

CREATE ROWSTORE TABLE dim_merchant (
    run_id            BIGINT      NOT NULL,
    merchant_id       VARCHAR(24) NOT NULL,
    merchant_name     VARCHAR(64) NOT NULL,
    merchant_category VARCHAR(48) NOT NULL,
    region            VARCHAR(32) NOT NULL,
    PRIMARY KEY (run_id, merchant_id)
);

CREATE ROWSTORE TABLE dim_processor (
    run_id            BIGINT      NOT NULL,
    processor_id      VARCHAR(16) NOT NULL,
    processor_name    VARCHAR(64) NOT NULL,
    rail              VARCHAR(24) NOT NULL,
    contracted_sla_ms INT         NOT NULL,
    PRIMARY KEY (run_id, processor_id)
);

CREATE ROWSTORE TABLE dim_geography (
    geography_id VARCHAR(8)  NOT NULL,
    country      VARCHAR(2)  NOT NULL,
    country_name VARCHAR(48) NOT NULL,
    region       VARCHAR(32) NOT NULL,
    risk_band    VARCHAR(16) NOT NULL,
    PRIMARY KEY (geography_id)
);
