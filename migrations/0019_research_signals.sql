-- Migration 0019: public research enrichment signals
-- Adds postal code so optional Census ZIP-level evidence can be attached
-- without changing the existing Gemini/Groq pipeline.
ALTER TABLE prospects ADD COLUMN postal_code TEXT;
CREATE INDEX IF NOT EXISTS idx_prospects_postal_code ON prospects (postal_code);
