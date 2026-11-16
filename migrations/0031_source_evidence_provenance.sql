-- P1: canonical evidence provenance and tenant-scoped idempotency.
-- Rebuild preserves all existing evidence while classifying legacy website-scrape claims as DECLARED.
ALTER TABLE source_evidence RENAME TO source_evidence_legacy_p1;

CREATE TABLE source_evidence (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('founder', 'tenant')),
  realm TEXT NOT NULL CHECK (realm IN ('FOUNDER', 'TENANT')),
  tenant_id TEXT NOT NULL,
  prospect_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_label TEXT NOT NULL,
  source_url TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('VERIFIED', 'DECLARED', 'ESTIMATED', 'MODELED', 'BENCHMARK', 'DEMO', 'UNKNOWN')),
  method TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  extractor_version TEXT NOT NULL,
  confidence REAL,
  unit TEXT,
  period_json TEXT,
  sample_size INTEGER,
  observed_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  valid_until TEXT,
  limitations_json TEXT NOT NULL DEFAULT '[]',
  usage_policy_json TEXT,
  profile_snapshot_version TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE (mode, realm, tenant_id, prospect_id, source_id, evidence_type, content_hash)
);

INSERT INTO source_evidence (
  id, run_id, mode, realm, tenant_id, prospect_id, subject_id, source_id, source_label,
  source_url, evidence_type, evidence_status, method, evidence_json, content_hash,
  extractor_version, confidence, unit, period_json, sample_size, observed_at, fetched_at,
  valid_until, limitations_json, usage_policy_json, profile_snapshot_version, schema_version, created_at
)
SELECT
  id, run_id, mode,
  CASE WHEN mode = 'founder' THEN 'FOUNDER' ELSE 'TENANT' END,
  tenant_id, prospect_id, prospect_id, source_id, source_id,
  source_url, evidence_type, 'DECLARED', 'WEBSITE_SCRAPE', evidence_json, content_hash,
  extractor_version, confidence, NULL, NULL, NULL, observed_at, created_at,
  NULL, '[]', NULL, NULL, 1, created_at
FROM source_evidence_legacy_p1;

DROP TABLE source_evidence_legacy_p1;

CREATE INDEX IF NOT EXISTS idx_source_evidence_run_tenant
  ON source_evidence (run_id, tenant_id, mode);
CREATE INDEX IF NOT EXISTS idx_source_evidence_prospect
  ON source_evidence (prospect_id, tenant_id, mode);
CREATE INDEX IF NOT EXISTS idx_source_evidence_observed
  ON source_evidence (observed_at);
CREATE INDEX IF NOT EXISTS idx_source_evidence_status_subject
  ON source_evidence (evidence_status, subject_id, realm, tenant_id);
