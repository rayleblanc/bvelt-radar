-- Migration 0009: Tenant Configurations for Bvelt Client Prospecting

CREATE TABLE IF NOT EXISTS tenant_config (
  tenant_id TEXT PRIMARY KEY,
  tenant_name TEXT NOT NULL,
  industry TEXT NOT NULL,
  niche TEXT NOT NULL,
  subniches_json TEXT NOT NULL,
  services_json TEXT NOT NULL,
  service_areas_json TEXT NOT NULL,
  countries_json TEXT NOT NULL,
  regions_json TEXT NOT NULL,
  cities_json TEXT NOT NULL,
  languages_json TEXT NOT NULL,
  icp_description TEXT NOT NULL,
  icp_keywords_json TEXT NOT NULL,
  minimum_score INTEGER DEFAULT 50,
  daily_outreach_limit INTEGER DEFAULT 10,
  allowed_markets_json TEXT NOT NULL,
  campaign_goal TEXT NOT NULL,
  messaging_angle TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_config_industry ON tenant_config (industry);
