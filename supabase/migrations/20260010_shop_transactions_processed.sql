-- Migration 010: Add admin_processed_at and processed_by to gm_shop_transactions
-- Allows admins to mark a GM Shop upgrade as "applied on PS"

ALTER TABLE gm_shop_transactions
  ADD COLUMN IF NOT EXISTS admin_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS processed_by       uuid REFERENCES auth.users(id);
