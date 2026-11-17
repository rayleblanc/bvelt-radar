-- Start an explicit migration ledger after the legacy untracked migration history.
-- Earlier migrations (0001-0029) are intentionally not backfilled without reliable
-- deployment records; live schema inspection remains the authority for that history.
CREATE TABLE IF NOT EXISTS radar_schema_migrations (
  migration_id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL,
  details TEXT
);

INSERT OR IGNORE INTO radar_schema_migrations (migration_id, applied_at, details)
VALUES
  ('0030_tenant_profile_contract.sql', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
   'Applied and schema-verified before ledger initialization; legacy tenant rows retain UNKNOWN verification.'),
  ('0031_source_evidence_provenance.sql', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
   'Applied with a pre-migration backup; all legacy website-scrape evidence preserved as DECLARED.'),
  ('0032_schema_migration_ledger.sql', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
   'Created the migration ledger; older untracked migrations are not backfilled.');
