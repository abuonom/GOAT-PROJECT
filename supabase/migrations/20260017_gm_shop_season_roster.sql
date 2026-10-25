-- Migration 017: GM Shop su roster stagionale dichiarato dal GM
-- Il GM dichiara valore attuale e valore finale (solo +1 per upgrade).
-- Il roster del GM è per stagione; cambia durante l'anno, verificato dall'admin.
-- I rookie nascono nel gioco e non sono in nba2kapi: il GM li inserisce a mano.
-- Le regole di costo restano in lib/gm-shop/rules.ts (preview) e nel calcolo server.

-- 1) Roster stagionale del GM: giocatori che possiede nella stagione
-- 'list'   = giocatore preso dalla lista esistente
-- 'manual' = inserito a mano dal GM (incluso rookie creato nel gioco)
CREATE TYPE gm_player_origin AS ENUM ('list', 'manual');

CREATE TABLE gm_season_roster (
  id            uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id     uuid            NOT NULL REFERENCES seasons(id),
  user_id       uuid            NOT NULL REFERENCES auth.users(id),
  franchise_id  uuid            NOT NULL REFERENCES franchises(id),
  player_slug   text            NOT NULL,
  origin        gm_player_origin NOT NULL,
  added_by      uuid            NOT NULL REFERENCES auth.users(id),
  added_at      timestamptz     NOT NULL DEFAULT now(),
  removed_at    timestamptz,
  UNIQUE(season_id, user_id, player_slug)
);

-- Un giocatore può essere attivo in un solo roster GM per stagione
CREATE UNIQUE INDEX gm_season_roster_active_unique
  ON gm_season_roster(season_id, player_slug)
  WHERE removed_at IS NULL;

-- 2) Giocatori inseriti a mano (rookie creati nel gioco o giocatori non in lista)
CREATE TABLE gm_manual_players (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id     uuid        NOT NULL REFERENCES seasons(id),
  slug          text        NOT NULL,
  name          text        NOT NULL,
  overall       integer     NOT NULL CHECK (overall BETWEEN 40 AND 99),
  positions     text[]      NOT NULL DEFAULT '{}',
  is_rookie     boolean     NOT NULL DEFAULT false,
  added_by      uuid        NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(season_id, slug)
);

-- 3) Upgrade: valore dichiarato dal GM, sempre +1
ALTER TABLE gm_shop_upgrades
  ADD CONSTRAINT gm_shop_upgrades_plus_one
  CHECK (old_value IS NULL OR new_value = old_value + 1);

-- 4) RLS
ALTER TABLE gm_season_roster   ENABLE ROW LEVEL SECURITY;
ALTER TABLE gm_manual_players  ENABLE ROW LEVEL SECURITY;

-- GM legge il proprio roster; admin legge tutto
CREATE POLICY "gm_season_roster: own read"
  ON gm_season_roster FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

-- GM scrive solo nel proprio roster; admin scrive tutto
CREATE POLICY "gm_season_roster: own write"
  ON gm_season_roster FOR INSERT
  WITH CHECK ((user_id = auth.uid() AND added_by = auth.uid()) OR is_admin());

CREATE POLICY "gm_season_roster: own update"
  ON gm_season_roster FOR UPDATE
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "gm_manual_players: authenticated read"
  ON gm_manual_players FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "gm_manual_players: own write"
  ON gm_manual_players FOR INSERT
  WITH CHECK (added_by = auth.uid() OR is_admin());
