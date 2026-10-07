-- Migration 0013: Add signal_event and signal_area columns to prospects
ALTER TABLE prospects ADD COLUMN signal_event TEXT;
ALTER TABLE prospects ADD COLUMN signal_area TEXT;
