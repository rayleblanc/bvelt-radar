-- Migration 0015: Central Daily Budget Governor and Circuit Breakers
CREATE TABLE IF NOT EXISTS daily_budgets (
  tenant_id TEXT NOT NULL,
  day TEXT NOT NULL, -- YYYY-MM-DD
  discovery_units INTEGER DEFAULT 0,
  enrichment_units INTEGER DEFAULT 0,
  ai_units INTEGER DEFAULT 0,
  hunter_units INTEGER DEFAULT 0,
  outreach_units INTEGER DEFAULT 0,
  finalize_units INTEGER DEFAULT 0,
  PRIMARY KEY (tenant_id, day)
);

CREATE TABLE IF NOT EXISTS circuit_breakers (
  id TEXT PRIMARY KEY,
  status TEXT DEFAULT 'closed', -- 'closed', 'open'
  reason TEXT,
  opened_at TEXT,
  last_error TEXT,
  manual_reset_required INTEGER DEFAULT 0
);
