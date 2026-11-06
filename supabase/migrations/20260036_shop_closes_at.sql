-- Migration 036: data di chiusura automatica dello shop.
-- Se closes_at è nel passato, lo shop risulta chiuso anche senza che nessuno
-- lo chiuda a mano (il calcolo avviene in lib/league/shop-state.ts).

ALTER TABLE shop_state ADD COLUMN IF NOT EXISTS closes_at timestamptz;
