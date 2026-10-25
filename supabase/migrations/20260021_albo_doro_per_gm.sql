-- Migration 021: albo d'oro come riepilogo per GM (Ernesto Cup / In-Season Tournament)
-- Sostituisce la tabella per stagione della migrazione 020 (mai usata in produzione).
-- Dati dalle schermate del torneo: V-S e titoli storici. Lettura pubblica, scrittura solo admin.

DROP TABLE IF EXISTS albo_doro;

CREATE TABLE albo_doro (
  username     text        PRIMARY KEY,           -- nome utente (es. TrueAlpha0)
  player_name  text        NOT NULL,              -- nome del giocatore (es. Alessio)
  wins         integer     NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses       integer     NOT NULL DEFAULT 0 CHECK (losses >= 0),
  titles       integer     NOT NULL DEFAULT 0 CHECK (titles >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE albo_doro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "albo_doro: public read"
  ON albo_doro FOR SELECT
  USING (true);

CREATE POLICY "albo_doro: admin write"
  ON albo_doro FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
