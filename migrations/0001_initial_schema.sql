-- Initial schema migration for bvelt-radar D1 Database

-- 1. Prospects table
CREATE TABLE IF NOT EXISTS prospects (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,                  -- 'founder' or 'tenant'
  tenant_id TEXT,                      -- Nullable for founder mode
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  trade TEXT NOT NULL,
  website TEXT,
  phone TEXT,
  email TEXT,
  score INTEGER DEFAULT 0,
  signals_json TEXT,                   -- JSON metadata
  draft_subject TEXT,
  draft_body TEXT,
  status TEXT DEFAULT 'discovered',    -- 'discovered' | 'enriched' | 'drafted' | 'notified' | 'ready_to_send' | 'sent' | 'replied' | 'discarded' | 'suppressed'
  source TEXT NOT NULL,                -- 'bizdata' | 'overpass'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 2. Runs table (for auditing daily actions)
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,                   -- 'YYYY-MM-DD'
  mode TEXT NOT NULL,                  -- 'founder' or 'tenant'
  discovered INTEGER DEFAULT 0,
  finalized INTEGER DEFAULT 0,
  ai_calls INTEGER DEFAULT 0,
  hunter_calls INTEGER DEFAULT 0,
  errors_json TEXT,                    -- JSON array of errors
  created_at TEXT NOT NULL
);

-- 3. Optional Seeds table (for manual routing hints)
CREATE TABLE IF NOT EXISTS seeds_optional (
  id TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  trade TEXT NOT NULL,
  notes TEXT
);

-- 4. Suppression list (to prevent double contacting)
CREATE TABLE IF NOT EXISTS suppression (
  key TEXT PRIMARY KEY,                -- email, domain, or "name_city" slugified
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 5. Tenant Config
CREATE TABLE IF NOT EXISTS tenant_config (
  tenant_id TEXT PRIMARY KEY,
  daily_limit INTEGER DEFAULT 10,
  cities_json TEXT NOT NULL,           -- JSON array of cities, e.g. ["Tampa,FL"]
  trades_json TEXT NOT NULL            -- JSON array of trades, e.g. ["plumbing", "hvac"]
);
