-- Migration 0011: Win Count for Learning & Auto-Outreach Execution Tracking

ALTER TABLE learning_stats ADD COLUMN win_count INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS outreach_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outreach_idempotency_prospect ON outreach_idempotency (prospect_id);
