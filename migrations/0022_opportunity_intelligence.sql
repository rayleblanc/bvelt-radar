-- Radar Fusion: Opportunity Intelligence layer.
-- Preserves all Autonomous migrations 0001-0021 and adds a separate opportunity ledger.
CREATE TABLE IF NOT EXISTS radar_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  mode TEXT NOT NULL,
  tenant_id TEXT,
  goal TEXT NOT NULL,
  query_json TEXT NOT NULL,
  rationale TEXT,
  priority REAL DEFAULT 0,
  status TEXT DEFAULT 'planned',
  result_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL,
  mission_id TEXT,
  mode TEXT NOT NULL,
  tenant_id TEXT,
  stage TEXT DEFAULT 'discovered',
  priority REAL DEFAULT 0,
  expected_value REAL DEFAULT 0,
  confidence REAL DEFAULT 0,
  why_now TEXT,
  next_action TEXT,
  action_reason TEXT,
  evidence_json TEXT,
  graph_json TEXT,
  first_seen_at TEXT NOT NULL,
  last_signal_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(prospect_id)
);

CREATE TABLE IF NOT EXISTS opportunity_signals (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  signal_value TEXT,
  strength REAL DEFAULT 0,
  freshness REAL DEFAULT 1,
  source TEXT,
  observed_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS opportunity_actions (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  channel TEXT,
  status TEXT DEFAULT 'recommended',
  reason TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  executed_at TEXT
);

CREATE TABLE IF NOT EXISTS opportunity_outcomes (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  value REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_missions_run ON missions(run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_missions_mode_status ON missions(mode, status, created_at);
CREATE INDEX IF NOT EXISTS idx_opportunities_priority ON opportunities(priority DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_tenant ON opportunities(tenant_id, mode, stage);
CREATE INDEX IF NOT EXISTS idx_signals_opportunity ON opportunity_signals(opportunity_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_actions_opportunity ON opportunity_actions(opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outcomes_opportunity ON opportunity_outcomes(opportunity_id, created_at DESC);
