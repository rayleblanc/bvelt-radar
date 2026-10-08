-- Migration 0022: Opportunity Intelligence Architecture
-- Tables: radar_settings, missions, opportunities, opportunity_signals, opportunity_actions, opportunity_outcomes

CREATE TABLE IF NOT EXISTS radar_settings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'founder',
  setting_key TEXT NOT NULL,
  setting_value_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_radar_settings_tenant_key ON radar_settings (tenant_id, setting_key);

CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'founder',
  name TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  markets_json TEXT NOT NULL,
  icp_json TEXT NOT NULL,
  budget_json TEXT NOT NULL,
  target_qualified INTEGER DEFAULT 5,
  target_outreach INTEGER DEFAULT 5,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_missions_tenant_status ON missions (tenant_id, status);

CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'founder',
  title TEXT NOT NULL,
  strategic_score INTEGER DEFAULT 0,
  fit_score INTEGER DEFAULT 0,
  intent_score INTEGER DEFAULT 0,
  pain_score INTEGER DEFAULT 0,
  ability_to_pay_score INTEGER DEFAULT 0,
  contactability_score INTEGER DEFAULT 0,
  timing_score INTEGER DEFAULT 0,
  evidence_score INTEGER DEFAULT 0,
  signal_freshness_score INTEGER DEFAULT 100,
  expected_value REAL DEFAULT 0,
  decision_state TEXT DEFAULT 'identified',
  why_now_json TEXT DEFAULT '{}',
  priority_tier TEXT DEFAULT 'medium',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_opportunities_tenant ON opportunities (tenant_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_prospect ON opportunities (prospect_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_score ON opportunities (strategic_score);
CREATE INDEX IF NOT EXISTS idx_opportunities_decision ON opportunities (decision_state);
CREATE INDEX IF NOT EXISTS idx_opportunities_priority ON opportunities (priority_tier);

CREATE TABLE IF NOT EXISTS opportunity_signals (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  observed_evidence TEXT NOT NULL,
  inferred_reasoning TEXT,
  confidence REAL DEFAULT 0.8,
  freshness_score INTEGER DEFAULT 100,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_opportunity_signals_opp ON opportunity_signals (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_signals_type ON opportunity_signals (signal_type);

CREATE TABLE IF NOT EXISTS opportunity_actions (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT DEFAULT 'proposed',
  details_json TEXT,
  proposed_at TEXT NOT NULL,
  executed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_opportunity_actions_opp ON opportunity_actions (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_actions_status ON opportunity_actions (status);

CREATE TABLE IF NOT EXISTS opportunity_outcomes (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  action_id TEXT,
  outcome_type TEXT NOT NULL,
  value_realized REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_opportunity_outcomes_opp ON opportunity_outcomes (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_outcomes_type ON opportunity_outcomes (outcome_type);
