-- Radar 16: isolate daily missions and runs by tenant.
-- Existing migrations 0001-0019 are immutable; this migration rebuilds only
-- daily_missions because its old primary key was day-only.

ALTER TABLE runs ADD COLUMN tenant_id TEXT;
CREATE INDEX IF NOT EXISTS idx_runs_day_mode_tenant ON runs(day, mode, tenant_id);

CREATE TABLE IF NOT EXISTS daily_missions_v2 (
  tenant_id TEXT NOT NULL,
  day TEXT NOT NULL,
  goal TEXT NOT NULL,
  markets TEXT NOT NULL,
  icp TEXT NOT NULL,
  budget TEXT NOT NULL,
  target_qualified INTEGER DEFAULT 3,
  target_outreach INTEGER DEFAULT 3,
  qualified_count INTEGER DEFAULT 0,
  outreach_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  PRIMARY KEY (tenant_id, day)
);

INSERT OR IGNORE INTO daily_missions_v2
  (tenant_id, day, goal, markets, icp, budget, target_qualified, target_outreach, qualified_count, outreach_count, status)
SELECT
  'founder', day, goal, markets, icp, budget, target_qualified, target_outreach, qualified_count, outreach_count, status
FROM daily_missions;

DROP TABLE daily_missions;
ALTER TABLE daily_missions_v2 RENAME TO daily_missions;
CREATE INDEX IF NOT EXISTS idx_daily_missions_day_status ON daily_missions(day, status);
