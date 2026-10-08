-- Migration 0020: Tenant scoping for runs and composite key on daily_missions
ALTER TABLE runs ADD COLUMN tenant_id TEXT DEFAULT 'founder';
CREATE INDEX IF NOT EXISTS idx_runs_tenant_id ON runs (tenant_id);

CREATE TABLE IF NOT EXISTS daily_missions_scoped (
  tenant_id TEXT NOT NULL DEFAULT 'founder',
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

INSERT OR IGNORE INTO daily_missions_scoped (tenant_id, day, goal, markets, icp, budget, target_qualified, target_outreach, qualified_count, outreach_count, status)
SELECT 'founder', day, goal, markets, icp, budget, target_qualified, target_outreach, qualified_count, outreach_count, status
FROM daily_missions;

DROP TABLE daily_missions;
ALTER TABLE daily_missions_scoped RENAME TO daily_missions;

CREATE INDEX IF NOT EXISTS idx_daily_missions_tenant_day ON daily_missions (tenant_id, day);
