-- Migration 015: Demo session flag
ALTER TABLE goat_draft_sessions ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
