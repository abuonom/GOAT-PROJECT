-- Migration 020: albo d'oro (campioni e Ernesto Cup per stagione)
-- Lettura pubblica (pagina senza login), scrittura solo admin.
-- Una riga per trofeo e stagione: 'campione' (anello) oppure 'coppa' (Ernesto Cup).

CREATE TABLE albo_doro (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_label  text        NOT NULL,            -- es. '2026/27'
  trophy        text        NOT NULL CHECK (trophy IN ('campione', 'coppa')),
  franchise_id  uuid        REFERENCES franchises(id),
  winner_name   text        NOT NULL,            -- nome visibile (franchigia o GM)
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_label, trophy)
);

ALTER TABLE albo_doro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "albo_doro: public read"
  ON albo_doro FOR SELECT
  USING (true);

CREATE POLICY "albo_doro: admin write"
  ON albo_doro FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
