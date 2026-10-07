-- Migration 0012: Seed Businesses for Pre-populated License Data
CREATE TABLE IF NOT EXISTS seed_businesses (
  id TEXT PRIMARY KEY,
  source TEXT,
  name TEXT,
  trade TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  website TEXT,
  email TEXT,
  license_status TEXT,
  license_issued TEXT,
  used_at TEXT
);
