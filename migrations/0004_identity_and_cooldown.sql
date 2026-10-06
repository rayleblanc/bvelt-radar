-- Migration 0004: Identity, deduplication, suppression & cooldown tracking

ALTER TABLE prospects ADD COLUMN identity_key TEXT;
ALTER TABLE prospects ADD COLUMN dedupe_reason TEXT;
ALTER TABLE prospects ADD COLUMN suppression_reason TEXT;
ALTER TABLE prospects ADD COLUMN cooldown_until TEXT;
ALTER TABLE prospects ADD COLUMN last_contact_at TEXT;
ALTER TABLE prospects ADD COLUMN last_reply_at TEXT;

-- Create an index to quickly scan for duplicates and ensure atomic checks
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_identity ON prospects (identity_key);
