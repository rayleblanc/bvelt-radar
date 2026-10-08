-- Migration 0023: Outbound Email Dispatcher & Open Technical Audits
-- Adds email dispatch audit log, delivery tracking, PageSpeed, and DoH DNS security

ALTER TABLE prospects ADD COLUMN dispatch_provider TEXT;
ALTER TABLE prospects ADD COLUMN dispatch_message_id TEXT;
ALTER TABLE prospects ADD COLUMN dispatch_status TEXT;
ALTER TABLE prospects ADD COLUMN dispatch_error TEXT;
ALTER TABLE prospects ADD COLUMN pagespeed_score INTEGER;
ALTER TABLE prospects ADD COLUMN dns_has_dmarc INTEGER;
ALTER TABLE prospects ADD COLUMN weather_context TEXT;

CREATE TABLE IF NOT EXISTS email_dispatch_logs (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'founder',
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  message_id TEXT,
  error_message TEXT,
  payload_preview TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_dispatch_prospect ON email_dispatch_logs (prospect_id);
CREATE INDEX IF NOT EXISTS idx_email_dispatch_status ON email_dispatch_logs (status);
