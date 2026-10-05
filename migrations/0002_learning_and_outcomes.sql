-- Migration 0002: Learning, Outcomes & Multi-Factor Scoring

-- Add outcome tracking to prospects for lightweight feedback learning
ALTER TABLE prospects ADD COLUMN outcome TEXT;

-- Add variant identifier for A/B testing copy
ALTER TABLE prospects ADD COLUMN variant_id TEXT;

-- Add explicit score breakdown column
ALTER TABLE prospects ADD COLUMN score_breakdown TEXT;

-- Index to quickly calculate learning stats by city, trade, and decision outcome
CREATE INDEX IF NOT EXISTS idx_prospects_learning ON prospects (city, trade, outcome);

-- Aggregated learning metrics table (can be updated on decision or computed on-the-fly)
CREATE TABLE IF NOT EXISTS learning_stats (
  key TEXT PRIMARY KEY,               -- e.g. "city:Tampa, FL", "trade:plumbing", "variant:missed_calls"
  sent_count INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);
