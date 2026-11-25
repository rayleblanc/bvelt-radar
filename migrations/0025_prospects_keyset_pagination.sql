-- Bounded keyset pagination for the Founder/Tenant prospect workbench.
-- Expression matches the canonical tenant predicate used by the API and preserves
-- legacy Founder rows whose tenant_id is NULL.
CREATE INDEX IF NOT EXISTS idx_prospects_tenant_created_id
  ON prospects (COALESCE(tenant_id, 'founder'), created_at DESC, id DESC);
