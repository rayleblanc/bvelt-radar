-- Migration 0006: Trust-Stack Governor Decisions & Audit Log

CREATE TABLE IF NOT EXISTS trust_decisions (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL, -- 'approved', 'rejected', 'hold'
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trust_decisions_prospect ON trust_decisions (prospect_id);
CREATE INDEX IF NOT EXISTS idx_trust_decisions_run ON trust_decisions (run_id);
