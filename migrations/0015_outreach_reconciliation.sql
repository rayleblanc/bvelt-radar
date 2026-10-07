-- Migration 0014: Provider Sequence & Reconciliation Fields
ALTER TABLE outreach_idempotency ADD COLUMN tenant_id TEXT;
ALTER TABLE outreach_idempotency ADD COLUMN provider_reference TEXT;

ALTER TABLE prospects ADD COLUMN provider_recipient_id TEXT;
ALTER TABLE prospects ADD COLUMN provider_sequence_id TEXT;
ALTER TABLE prospects ADD COLUMN provider_status TEXT;
