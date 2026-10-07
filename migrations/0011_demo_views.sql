-- Migration 0011: Demo Views and Prospects Demo Token Column

CREATE TABLE IF NOT EXISTS demo_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id TEXT,
  viewed_at TEXT,
  ua TEXT
);

ALTER TABLE prospects ADD COLUMN demo_token TEXT;
