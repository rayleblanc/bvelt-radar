-- Migration 0010: Queue Job Control & Idempotency Table

CREATE TABLE IF NOT EXISTS radar_jobs (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  prospect_id TEXT,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT,
  last_error TEXT,
  available_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_radar_jobs_status_available ON radar_jobs (status, available_at);
CREATE INDEX IF NOT EXISTS idx_radar_jobs_run ON radar_jobs (run_id);
CREATE INDEX IF NOT EXISTS idx_radar_jobs_prospect ON radar_jobs (prospect_id);
