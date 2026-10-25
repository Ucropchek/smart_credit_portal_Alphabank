-- Goods search of a credit application, started by the backend handoff (POST / of the ML service).
-- The service runs the same statement on start, so an existing volume gets the table too.
CREATE SCHEMA IF NOT EXISTS ml;

CREATE TABLE IF NOT EXISTS ml.goods_searches (
    application_id bigint PRIMARY KEY,
    amount numeric(15, 2) NOT NULL,
    categories jsonb NOT NULL,
    status text NOT NULL,
    results jsonb NOT NULL DEFAULT '[]'::jsonb,
    error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_goods_searches_amount CHECK (amount > 0),
    CONSTRAINT ck_goods_searches_status CHECK (status IN ('queued', 'running', 'done', 'failed', 'no_categories'))
);
