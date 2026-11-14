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

CREATE TABLE IF NOT EXISTS learning_stats_scoped (
  mode TEXT NOT NULL CHECK (mode IN ('founder', 'tenant')),
  tenant_id TEXT NOT NULL,
  key TEXT NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  opened_count INTEGER NOT NULL DEFAULT 0,
  clicked_count INTEGER NOT NULL DEFAULT 0,
  bounced_count INTEGER NOT NULL DEFAULT 0,
  replied_count INTEGER NOT NULL DEFAULT 0,
  qualified_count INTEGER NOT NULL DEFAULT 0,
  booked_count INTEGER NOT NULL DEFAULT 0,
  won_count INTEGER NOT NULL DEFAULT 0,
  lost_count INTEGER NOT NULL DEFAULT 0,
  contacted_count INTEGER NOT NULL DEFAULT 0,
  unknown_count INTEGER NOT NULL DEFAULT 0,
  total_events INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (mode, tenant_id, key)
);

CREATE INDEX IF NOT EXISTS idx_learning_stats_scoped_scope
  ON learning_stats_scoped (mode, tenant_id, sent_count);
