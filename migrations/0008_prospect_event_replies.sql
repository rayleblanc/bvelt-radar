-- Migration 0008: Prospect Reply Events & Classification Tracking

ALTER TABLE prospects ADD COLUMN response_type TEXT;
ALTER TABLE prospects ADD COLUMN last_reply_content TEXT;

CREATE TABLE IF NOT EXISTS prospect_events (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  response_type TEXT,
  content TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_prospect_id ON prospect_events (prospect_id);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON prospect_events (event_type);
