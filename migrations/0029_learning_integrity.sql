CREATE TABLE IF NOT EXISTS learning_events (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('founder', 'tenant')),
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  city TEXT,
  trade TEXT,
  variant_id TEXT,
  angle TEXT,
  value_usd REAL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  idempotency_key TEXT NOT NULL UNIQUE,
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_learning_events_scope_time
  ON learning_events (mode, tenant_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_learning_events_prospect
  ON learning_events (mode, tenant_id, prospect_id, occurred_at);
