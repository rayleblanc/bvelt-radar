DROP INDEX IF EXISTS idx_prospects_identity;
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_identity_scoped ON prospects (COALESCE(tenant_id,'founder'), identity_key);
