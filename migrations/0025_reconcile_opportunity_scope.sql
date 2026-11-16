-- Reconcile legacy opportunity scope from the authoritative prospect row.
-- Founder and Tenant remain isolated; rows without a matching prospect are untouched.
UPDATE opportunities
SET
  tenant_id = COALESCE(NULLIF(TRIM((SELECT p.tenant_id FROM prospects p WHERE p.id = opportunities.prospect_id)), ''), 'founder'),
  mode = CASE
    WHEN COALESCE(NULLIF(TRIM((SELECT p.tenant_id FROM prospects p WHERE p.id = opportunities.prospect_id)), ''), 'founder') = 'founder'
    THEN 'founder'
    ELSE 'tenant'
  END,
  updated_at = datetime('now')
WHERE EXISTS (
  SELECT 1 FROM prospects p
  WHERE p.id = opportunities.prospect_id
    AND (
      COALESCE(NULLIF(TRIM(opportunities.tenant_id), ''), 'founder')
        <> COALESCE(NULLIF(TRIM(p.tenant_id), ''), 'founder')
      OR COALESCE(NULLIF(TRIM(opportunities.mode), ''), 'founder')
        <> CASE WHEN COALESCE(NULLIF(TRIM(p.tenant_id), ''), 'founder') = 'founder' THEN 'founder' ELSE 'tenant' END
    )
);
