-- Migration 022: albo d'oro con titoli separati
-- titles       → ernesto_titles (titoli Ernesto Cup / In-Season Tournament, dalle schermate)
-- nba_titles   → titoli NBA (anelli), ancora da inserire: default 0

ALTER TABLE albo_doro RENAME COLUMN titles TO ernesto_titles;

ALTER TABLE albo_doro
  ADD COLUMN nba_titles integer NOT NULL DEFAULT 0 CHECK (nba_titles >= 0);
