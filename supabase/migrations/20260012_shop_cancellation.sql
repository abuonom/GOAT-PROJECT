-- Migration 012: Shop transaction cancellation
ALTER TABLE gm_shop_transactions
  ADD COLUMN IF NOT EXISTS cancelled_at  timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by  uuid REFERENCES auth.users(id);
