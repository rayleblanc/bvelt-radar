-- Migration 0017: Daily Missions Tracking
CREATE TABLE IF NOT EXISTS daily_missions (
  day TEXT PRIMARY KEY, -- YYYY-MM-DD
  goal TEXT NOT NULL,
  markets TEXT NOT NULL, -- JSON array of cities
  icp TEXT NOT NULL, -- JSON object of ICP description and keywords
  budget TEXT NOT NULL, -- JSON object of budget limits
  target_qualified INTEGER DEFAULT 3,
  target_outreach INTEGER DEFAULT 3,
  qualified_count INTEGER DEFAULT 0,
  outreach_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active'
);
