-- Migration 0007: Email Verifications & Sender Governor State

CREATE TABLE IF NOT EXISTS email_verifications (
  email TEXT PRIMARY KEY,
  is_valid INTEGER NOT NULL,
  deliverability TEXT,
  is_disposable INTEGER DEFAULT 0,
  is_catchall INTEGER DEFAULT 0,
  quality_score REAL,
  reason TEXT,
  verified_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sender_governor_state (
  id TEXT PRIMARY KEY,
  daily_limit INTEGER DEFAULT 5,
  sends_today INTEGER DEFAULT 0,
  bounces_today INTEGER DEFAULT 0,
  complaints_today INTEGER DEFAULT 0,
  unsubscribes_today INTEGER DEFAULT 0,
  last_reset_day TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  reason TEXT,
  updated_at TEXT NOT NULL
);
