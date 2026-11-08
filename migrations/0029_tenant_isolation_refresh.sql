-- Migration 0029: Tenant isolation index and refresh log table
-- Ensures robust round-robin tracking and tenant-scoped prospect queries without modifying historical migrations.

CREATE TABLE IF NOT EXISTS tenant_refresh_log (
  tenant_id TEXT PRIMARY KEY,
  last_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_refresh_log_last_at ON tenant_refresh_log (last_at);
CREATE INDEX IF NOT EXISTS idx_prospects_tenant_created ON prospects (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tenant_config_updated_at ON tenant_config (updated_at);
