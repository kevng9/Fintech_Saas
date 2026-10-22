-- Fintech Aura Analyst demo: control plane
-- Spec section 8.3. These tables are never exposed to an Aura Domain.
-- Statements are separated by a semicolon at end of line.
-- No statement may contain a semicolon inside a string literal.

DROP TABLE IF EXISTS demo_audit;

DROP TABLE IF EXISTS demo_command;

DROP TABLE IF EXISTS demo_event_log;

DROP TABLE IF EXISTS demo_scenario_execution;

DROP TABLE IF EXISTS demo_scenario;

DROP TABLE IF EXISTS demo_active_run;

DROP TABLE IF EXISTS demo_run;

CREATE ROWSTORE TABLE demo_run (
    run_id            BIGINT       NOT NULL,
    seed              BIGINT       NOT NULL,
    fixture_version   VARCHAR(20)  NOT NULL,
    status            VARCHAR(20)  NOT NULL,
    logical_epoch     DATETIME(6)  NOT NULL,
    baseline_from     DATETIME(6)  NOT NULL,
    created_at        DATETIME(6)  NOT NULL,
    baseline_checksum VARCHAR(64)  NOT NULL,
    row_counts        JSON         NOT NULL,
    fingerprint       JSON         NOT NULL,
    notes             VARCHAR(256) NULL,
    PRIMARY KEY (run_id)
);

CREATE ROWSTORE TABLE demo_active_run (
    singleton_id        TINYINT      NOT NULL,
    run_id              BIGINT       NOT NULL,
    logical_time        DATETIME(6)  NOT NULL,
    stream_status       VARCHAR(20)  NOT NULL,
    speed_multiplier    DECIMAL(5,2) NOT NULL,
    sequence_no         BIGINT       NOT NULL,
    minute_cursor       BIGINT       NOT NULL,
    analyst_mode        VARCHAR(10)  NOT NULL,
    state_version       BIGINT       NOT NULL,
    leader_id           VARCHAR(64)  NULL,
    leader_heartbeat_at DATETIME(6)  NULL,
    updated_at          DATETIME(6)  NOT NULL,
    PRIMARY KEY (singleton_id)
);

CREATE ROWSTORE TABLE demo_scenario (
    scenario_id     VARCHAR(64)  NOT NULL,
    anchor_id       VARCHAR(4)   NOT NULL,
    name            VARCHAR(128) NOT NULL,
    description     TEXT         NOT NULL,
    fixture_version VARCHAR(20)  NOT NULL,
    metric_window   VARCHAR(64)  NOT NULL,
    expected_deltas JSON         NOT NULL,
    enabled         BOOL         NOT NULL,
    PRIMARY KEY (scenario_id)
);

CREATE ROWSTORE TABLE demo_scenario_execution (
    run_id                 BIGINT       NOT NULL,
    scenario_id            VARCHAR(64)  NOT NULL,
    idempotency_key        VARCHAR(64)  NOT NULL,
    execution_id           VARCHAR(64)  NOT NULL,
    status                 VARCHAR(20)  NOT NULL,
    requested_at           DATETIME(6)  NOT NULL,
    completed_at           DATETIME(6)  NULL,
    logical_injection_time DATETIME(6)  NULL,
    injection_sequence_no  BIGINT       NULL,
    window_start           DATETIME(6)  NULL,
    window_end             DATETIME(6)  NULL,
    rows_inserted          JSON         NULL,
    before_fingerprint     JSON         NULL,
    after_fingerprint      JSON         NULL,
    error_text             TEXT         NULL,
    PRIMARY KEY (run_id, scenario_id, idempotency_key)
);

CREATE ROWSTORE TABLE demo_event_log (
    run_id             BIGINT      NOT NULL,
    sequence_no        BIGINT      NOT NULL,
    anchor_id          VARCHAR(4)  NULL,
    event_type         VARCHAR(64) NOT NULL,
    logical_event_time DATETIME(6) NOT NULL,
    payload            JSON        NULL,
    source_scenario    VARCHAR(64) NULL,
    ingested_at        DATETIME(6) NOT NULL,
    PRIMARY KEY (run_id, sequence_no)
);

CREATE ROWSTORE TABLE demo_command (
    command_id             VARCHAR(64) NOT NULL,
    run_id                 BIGINT      NOT NULL,
    command_type           VARCHAR(32) NOT NULL,
    payload                JSON        NULL,
    status                 VARCHAR(20) NOT NULL,
    expected_state_version BIGINT      NULL,
    requested_by           VARCHAR(64) NOT NULL,
    requested_role         VARCHAR(32) NOT NULL,
    created_at             DATETIME(6) NOT NULL,
    claimed_at             DATETIME(6) NULL,
    completed_at           DATETIME(6) NULL,
    result                 JSON        NULL,
    error_text             TEXT        NULL,
    PRIMARY KEY (command_id)
);

CREATE ROWSTORE TABLE demo_audit (
    audit_id      VARCHAR(64)  NOT NULL,
    occurred_at   DATETIME(6)  NOT NULL,
    actor_id      VARCHAR(64)  NOT NULL,
    actor_role    VARCHAR(32)  NOT NULL,
    action        VARCHAR(64)  NOT NULL,
    anchor_id     VARCHAR(4)   NULL,
    request_id    VARCHAR(64)  NOT NULL,
    run_id        BIGINT       NULL,
    state_version BIGINT       NULL,
    outcome       VARCHAR(32)  NOT NULL,
    detail        VARCHAR(512) NULL,
    PRIMARY KEY (audit_id)
);
