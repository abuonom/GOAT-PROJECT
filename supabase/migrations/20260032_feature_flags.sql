-- Migration 032: interruttori delle funzionalità, gestiti dal superadmin.
-- Una riga per funzionalità. Lettura per tutti gli utenti autenticati,
-- modifica solo dal superadmin (email verificata nella policy).
-- Se una funzionalità è disattivata, non viene mostrata a nessuno.

CREATE TABLE feature_flags (
  key         text        PRIMARY KEY,
  enabled     boolean     NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid        REFERENCES auth.users(id)
);

-- Player List: disattivata di default, si attiva con il draft NBA
INSERT INTO feature_flags (key, enabled) VALUES ('player_list', false);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_flags: authenticated read"
  ON feature_flags FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "feature_flags: superadmin update"
  ON feature_flags FOR UPDATE
  USING ((auth.jwt() ->> 'email') = 'buonomoa6@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'buonomoa6@gmail.com');
