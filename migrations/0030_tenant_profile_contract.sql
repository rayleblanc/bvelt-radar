-- P1: versioned Bvelt -> Radar Tenant profile contract.
-- Legacy tenant rows remain readable with contract_version=0 and UNKNOWN verification.
ALTER TABLE tenant_config ADD COLUMN contract_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tenant_config ADD COLUMN realm TEXT NOT NULL DEFAULT 'TENANT';
ALTER TABLE tenant_config ADD COLUMN profile_id TEXT;
ALTER TABLE tenant_config ADD COLUMN business_id TEXT;
ALTER TABLE tenant_config ADD COLUMN profile_snapshot_version TEXT;
ALTER TABLE tenant_config ADD COLUMN profile_snapshot_at TEXT;
ALTER TABLE tenant_config ADD COLUMN profile_source TEXT;
ALTER TABLE tenant_config ADD COLUMN location_source TEXT;
ALTER TABLE tenant_config ADD COLUMN verification_state TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE tenant_config ADD COLUMN territory_json TEXT;
ALTER TABLE tenant_config ADD COLUMN timezone TEXT;
ALTER TABLE tenant_config ADD COLUMN language TEXT;
ALTER TABLE tenant_config ADD COLUMN correlation_id TEXT;
ALTER TABLE tenant_config ADD COLUMN idempotency_key TEXT;
ALTER TABLE tenant_config ADD COLUMN source TEXT;

CREATE INDEX IF NOT EXISTS idx_tenant_config_profile_snapshot
  ON tenant_config (tenant_id, profile_snapshot_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_config_idempotency
  ON tenant_config (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
