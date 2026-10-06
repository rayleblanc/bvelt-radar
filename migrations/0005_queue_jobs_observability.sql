-- Migration 0005: Cloudflare Queues Job Observability & Event Tracking

CREATE TABLE IF NOT EXISTS queue_jobs (
  job_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  attempt INTEGER DEFAULT 1,
  status TEXT NOT NULL, -- 'pending', 'processing', 'completed', 'failed'
  error TEXT,
  payload_json TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_jobs_run_id ON queue_jobs (run_id);
CREATE INDEX IF NOT EXISTS idx_queue_jobs_status ON queue_jobs (status);
