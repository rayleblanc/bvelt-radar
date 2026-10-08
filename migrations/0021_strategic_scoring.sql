-- Migration 0021: Strategic Scoring & Decision State for Prospects
ALTER TABLE prospects ADD COLUMN fit_score INTEGER DEFAULT 0;
ALTER TABLE prospects ADD COLUMN intent_score INTEGER DEFAULT 0;
ALTER TABLE prospects ADD COLUMN pain_score INTEGER DEFAULT 0;
ALTER TABLE prospects ADD COLUMN ability_to_pay_score INTEGER DEFAULT 0;
ALTER TABLE prospects ADD COLUMN contactability_score INTEGER DEFAULT 0;
ALTER TABLE prospects ADD COLUMN timing_score INTEGER DEFAULT 0;
ALTER TABLE prospects ADD COLUMN evidence_score INTEGER DEFAULT 0;
ALTER TABLE prospects ADD COLUMN decision_state TEXT DEFAULT 'pending';
ALTER TABLE prospects ADD COLUMN why_now_json TEXT DEFAULT '{}';
ALTER TABLE prospects ADD COLUMN expected_value REAL DEFAULT 0;
ALTER TABLE prospects ADD COLUMN signal_freshness_score INTEGER DEFAULT 100;

CREATE INDEX IF NOT EXISTS idx_prospects_fit_score ON prospects (fit_score);
CREATE INDEX IF NOT EXISTS idx_prospects_decision_state ON prospects (decision_state);
CREATE INDEX IF NOT EXISTS idx_prospects_timing_score ON prospects (timing_score);
CREATE INDEX IF NOT EXISTS idx_prospects_signal_freshness ON prospects (signal_freshness_score);
CREATE INDEX IF NOT EXISTS idx_prospects_expected_value ON prospects (expected_value);
