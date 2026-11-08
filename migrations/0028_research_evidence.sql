-- Additive research evidence layer. Do not edit or rename migrations 0001-0022.
-- Founder is represented by tenant_id='founder'; every Tenant keeps its own ID.

CREATE TABLE IF NOT EXISTS research_run_candidates (
  run_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('founder', 'tenant')),
  tenant_id TEXT NOT NULL,
  prospect_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, tenant_id, prospect_id)
);
CREATE INDEX IF NOT EXISTS idx_research_candidates_run_tenant
  ON research_run_candidates (run_id, tenant_id, mode);

CREATE TABLE IF NOT EXISTS sidecar_dispatches (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('founder', 'tenant')),
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  workflow_file TEXT NOT NULL DEFAULT 'radar-research.yml',
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (run_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_sidecar_dispatch_status
  ON sidecar_dispatches (status, updated_at);

CREATE TABLE IF NOT EXISTS source_evidence (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('founder', 'tenant')),
  tenant_id TEXT NOT NULL,
  prospect_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  extractor_version TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (prospect_id, source_id, evidence_type, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_source_evidence_run_tenant
  ON source_evidence (run_id, tenant_id, mode);
CREATE INDEX IF NOT EXISTS idx_source_evidence_prospect
  ON source_evidence (prospect_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_source_evidence_observed
  ON source_evidence (observed_at);
