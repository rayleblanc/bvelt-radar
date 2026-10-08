-- Migration 0019: Add postal_code to prospects
ALTER TABLE prospects ADD COLUMN postal_code TEXT;

CREATE INDEX IF NOT EXISTS idx_prospects_postal_code ON prospects (postal_code);
