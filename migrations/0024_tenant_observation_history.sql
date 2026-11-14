CREATE TABLE IF NOT EXISTS tenant_observation_events (
  event_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  prospect_id TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'snapshot_observed',
  snapshot_hash TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  UNIQUE (tenant_id, prospect_id, snapshot_hash)
);

CREATE INDEX IF NOT EXISTS idx_tenant_observation_events_scope_time
  ON tenant_observation_events (tenant_id, observed_at);

CREATE INDEX IF NOT EXISTS idx_tenant_observation_events_prospect_time
  ON tenant_observation_events (tenant_id, prospect_id, observed_at);
