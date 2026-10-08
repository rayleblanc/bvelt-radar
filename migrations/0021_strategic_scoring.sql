-- Radar 16: explicit decision dimensions for Founder and Tenant modes.
ALTER TABLE prospects ADD COLUMN fit_score INTEGER DEFAULT 0;
ALTER TABLE prospects ADD COLUMN intent_score INTEGER DEFAULT 0;
ALTER TABLE prospects ADD COLUMN pain_score INTEGER DEFAULT 0;
ALTER TABLE prospects ADD COLUMN ability_to_pay_score INTEGER DEFAULT 0;
ALTER TABLE prospects ADD COLUMN contactability_score INTEGER DEFAULT 0;
ALTER TABLE prospects ADD COLUMN timing_score INTEGER DEFAULT 0;
ALTER TABLE prospects ADD COLUMN evidence_score INTEGER DEFAULT 0;
ALTER TABLE prospects ADD COLUMN decision_state TEXT DEFAULT 'unscored';
ALTER TABLE prospects ADD COLUMN why_now_json TEXT DEFAULT '{}';
ALTER TABLE prospects ADD COLUMN expected_value REAL DEFAULT 0;
ALTER TABLE prospects ADD COLUMN signal_freshness_score INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_prospects_tenant_decision
  ON prospects(tenant_id, decision_state, opportunity_score);
CREATE INDEX IF NOT EXISTS idx_prospects_tenant_city_trade
  ON prospects(tenant_id, city, trade);
