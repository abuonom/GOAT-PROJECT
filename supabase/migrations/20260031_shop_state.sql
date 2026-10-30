-- Migration 031: stato globale dello shop (aperto/chiuso), gestito dal superadmin.
-- Una sola riga (id = 1). Lettura per tutti gli utenti autenticati,
-- modifica solo dal superadmin (email verificata nella policy).

CREATE TABLE shop_state (
  id          integer     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_open     boolean     NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid        REFERENCES auth.users(id)
);

INSERT INTO shop_state (id, is_open) VALUES (1, true);

ALTER TABLE shop_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_state: authenticated read"
  ON shop_state FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "shop_state: superadmin update"
  ON shop_state FOR UPDATE
  USING ((auth.jwt() ->> 'email') = 'buonomoa6@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'buonomoa6@gmail.com');
