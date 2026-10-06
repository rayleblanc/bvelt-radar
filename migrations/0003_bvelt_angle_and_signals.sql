-- Migration 0003: bvelt_angle column for Prospects
ALTER TABLE prospects ADD COLUMN bvelt_angle TEXT;
