-- Migration 018: partite giocate per franchigia e stagione, inserite dall'admin
-- I GC non si guadagnano più dal sito: si calcolano da queste partite con calculate_gc_earned.
-- Vale per tutte le 30 franchigie, anche senza GM assegnato.

CREATE TABLE franchise_season_games (
  season_id     uuid        NOT NULL REFERENCES seasons(id),
  franchise_id  uuid        NOT NULL REFERENCES franchises(id),
  games_played  integer     NOT NULL DEFAULT 0 CHECK (games_played BETWEEN 0 AND 82),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid        REFERENCES auth.users(id),
  PRIMARY KEY (season_id, franchise_id)
);

ALTER TABLE franchise_season_games ENABLE ROW LEVEL SECURITY;

-- Lettura: tutti gli utenti autenticati
CREATE POLICY "franchise_season_games: authenticated read"
  ON franchise_season_games FOR SELECT
  USING (auth.role() = 'authenticated');

-- Scrittura: solo admin (l'admin inserisce le partite)
CREATE POLICY "franchise_season_games: admin write"
  ON franchise_season_games FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Ricalcolo: le partite sono la fonte, i GC si ricavano con calculate_gc_earned
CREATE OR REPLACE FUNCTION franchise_gc_earned(p_franchise_id uuid, p_season_id uuid)
RETURNS integer AS $$
  SELECT calculate_gc_earned(COALESCE(
    (SELECT games_played FROM franchise_season_games
     WHERE franchise_id = p_franchise_id AND season_id = p_season_id),
    0
  ));
$$ LANGUAGE sql STABLE;
