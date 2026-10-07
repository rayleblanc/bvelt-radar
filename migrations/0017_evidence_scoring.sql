-- Migration 0016: Evidence, pain hypothesis, opportunity score, and confidence tracking
ALTER TABLE prospects ADD COLUMN opportunity_score INTEGER DEFAULT 0;
ALTER TABLE prospects ADD COLUMN confidence_score INTEGER DEFAULT 0;
ALTER TABLE prospects ADD COLUMN evidence_json TEXT DEFAULT '[]';
ALTER TABLE prospects ADD COLUMN commercial_value_band TEXT DEFAULT 'unknown';
ALTER TABLE prospects ADD COLUMN pain_hypothesis_json TEXT DEFAULT '{}';
