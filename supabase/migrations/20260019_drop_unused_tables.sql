-- Migration 019: rimozione tabelle non più usate
-- Verificate: 0 righe, nessuna FK, vista, funzione o riferimento nel codice.
--   gm_season_roster      → sostituita da roster_memberships (roster unico)
--   gm_manual_players     → rookie creati nel gioco vanno in players (teamType 'gm_created')
--   player_season_ratings → mai usata
--   saved_players         → legacy, superseded da roster_memberships
-- NON elimina: games (90 righe), che è ancora da valutare.

DROP TABLE IF EXISTS gm_season_roster;
DROP TABLE IF EXISTS gm_manual_players;
DROP TABLE IF EXISTS player_season_ratings;
DROP TABLE IF EXISTS saved_players;

-- Il tipo enum creato per gm_season_roster non serve più
DROP TYPE IF EXISTS gm_player_origin;
