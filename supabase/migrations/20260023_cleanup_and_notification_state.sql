-- Migration 023: pulizia dati di test e stato delle notifiche admin
--
-- 1) Elimina le transazioni GM Shop orfane (senza upgrade): sono resti dei test.
-- 2) Elimina la colonna league_members.games_played: la fonte unica delle partite è franchise_season_games.
-- 3) Crea admin_notification_state: una riga per notifica segnata come effettuata dall'admin.
--    Le fonti (ledger, transazioni, roster) non vengono toccate: il ledger è append-only.

-- 1) Transazioni orfane
DELETE FROM gm_shop_transactions t
WHERE NOT EXISTS (
  SELECT 1 FROM gm_shop_upgrades u WHERE u.transaction_id = t.id
);

-- 2) Partite duplicate
ALTER TABLE league_members DROP COLUMN IF EXISTS games_played;

-- 3) Stato notifiche
CREATE TABLE admin_notification_state (
  notification_id  text        PRIMARY KEY,           -- id della notifica (es. 'shop-<uuid>', 'gc-<uuid>')
  done_at          timestamptz NOT NULL DEFAULT now(),
  done_by          uuid        NOT NULL REFERENCES auth.users(id)
);

ALTER TABLE admin_notification_state ENABLE ROW LEVEL SECURITY;

-- Solo admin legge e scrive lo stato
CREATE POLICY "admin_notification_state: admin all"
  ON admin_notification_state FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
