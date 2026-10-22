-- Schema the ML package expects. Applied by the postgres service on first start.
CREATE SCHEMA IF NOT EXISTS ml;

CREATE TABLE IF NOT EXISTS ml.schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ml.feature_snapshots (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
