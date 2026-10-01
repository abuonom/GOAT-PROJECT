-- Migration 006: GM Shop
-- attribute catalog (data-driven from Excel), upgrades, transactions.
-- All business rules are enforced here, not just in the frontend.

-- Attribute catalog: source of truth for what can be upgraded and at what cost
-- Populated from GM_SHOP_Definitivo_2K27_Attributo_Unico.xlsx
CREATE TABLE gm_shop_attributes (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_key   text    UNIQUE NOT NULL,  -- matches PlayerAttributes keys in types/nba.ts
  label_it        text    NOT NULL,         -- Italian display name from Excel
  base_cost       integer NOT NULL CHECK (base_cost > 0),
  category        text    NOT NULL,         -- Tiro / Finishing / Playmaking / Difesa / Atletismo / Badge
  is_badge_upgrade boolean NOT NULL DEFAULT false,
  sort_order      integer NOT NULL DEFAULT 0,
  active          boolean NOT NULL DEFAULT true
);

-- Seed from Excel (GM_SHOP_Definitivo_2K27_Attributo_Unico.xlsx)
-- Mapping: Excel Italian name → PlayerAttributes key (types/nba.ts)
INSERT INTO gm_shop_attributes (attribute_key, label_it, base_cost, category, sort_order) VALUES
  -- Tiro
  ('freeThrow',             'Tiro libero',              2,  'Tiro',       10),
  ('midRangeShot',          'Tiro dalla media',          4,  'Tiro',       20),
  ('threePointShot',        'Tiro da 3',                 5,  'Tiro',       30),
  ('shotIQ',                'IQ offensivo',              3,  'Tiro',       40),
  ('offensiveConsistency',  'Consistenza offensiva',     3,  'Tiro',       50),
  -- Finishing
  ('drivingLayup',          'Layup',                     4,  'Finishing',  60),
  ('drivingDunk',           'Schiacciata in movimento',  6,  'Finishing',  70),
  ('standingDunk',          'Schiacciata da fermo',      5,  'Finishing',  80),
  ('hands',                 'Mani',                      3,  'Finishing',  90),
  -- Playmaking
  ('ballHandle',            'Controllo palla',           5,  'Playmaking', 100),
  ('speedWithBall',         'Velocità con palla',        5,  'Playmaking', 110),
  ('passAccuracy',          'Precisione passaggi',       4,  'Playmaking', 120),
  ('passPerception',        'Percezione passaggi',       5,  'Playmaking', 130),
  -- Difesa
  ('perimeterDefense',      'Difesa perimetrale',        5,  'Difesa',     140),
  ('interiorDefense',       'Difesa interna',            4,  'Difesa',     150),
  ('steal',                 'Rubata',                    6,  'Difesa',     160),
  ('block',                 'Stoppata',                  5,  'Difesa',     170),
  ('defensiveRebound',      'Rimbalzo difensivo',        4,  'Difesa',     180),
  ('helpDefenseIQ',         'IQ difensivo',              4,  'Difesa',     190),
  ('defensiveConsistency',  'Consistenza difensiva',     4,  'Difesa',     200),
  -- Atletismo
  ('offensiveRebound',      'Rimbalzo offensivo',        4,  'Atletismo',  210),
  ('speed',                 'Velocità',                  5,  'Atletismo',  220),
  ('strength',              'Forza',                     4,  'Atletismo',  230),
  ('vertical',              'Verticale',                 4,  'Atletismo',  240),
  ('stamina',               'Resistenza',                3,  'Atletismo',  250),
  ('agility',               'Agilità',                   5,  'Atletismo',  260);
  -- NOTE: 'Accelerazione' (5 GC) from Excel is EXCLUDED pending decision
  -- on whether to add acceleration to the player data schema.
  -- Add manually once resolved: INSERT INTO gm_shop_attributes ...

-- Badge upgrade entry (special: fixed cost, no progressive surcharge)
INSERT INTO gm_shop_attributes
  (attribute_key, label_it, base_cost, category, is_badge_upgrade, sort_order)
VALUES
  ('badge_bronze_silver', 'Badge Bronzo → Argento', 10, 'Badge', true, 9999);

-- Progressive surcharge lookup table (valore PRIMA dell'upgrade → GC extra)
-- Source: Excel rules section rows 44–49
CREATE TABLE gc_surcharge_tiers (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  min_value      integer NOT NULL,   -- inclusive lower bound
  max_value      integer,            -- inclusive upper bound (NULL = no upper limit)
  extra_gc       integer NOT NULL CHECK (extra_gc >= 0),
  description    text    NOT NULL,
  sort_order     integer NOT NULL
);

INSERT INTO gc_surcharge_tiers (min_value, max_value, extra_gc, description, sort_order) VALUES
  (0,  84, 0,  '0–84: prezzo base',   1),
  (85, 87, 2,  '85–87: base +2 GC',  2),
  (88, 90, 4,  '88–90: base +4 GC',  3),
  (91, 93, 6,  '91–93: base +6 GC',  4),
  (94, NULL, 8, '94+: base +8 GC',   5);

-- Function: calculate upgrade cost given attribute key and current value
-- Badge upgrades are flat cost (no surcharge). Attribute upgrades use tiers.
CREATE OR REPLACE FUNCTION calculate_upgrade_cost(
  p_attribute_key text,
  p_current_value integer
)
RETURNS integer AS $$
DECLARE
  v_base_cost      integer;
  v_is_badge       boolean;
  v_extra          integer;
BEGIN
  SELECT base_cost, is_badge_upgrade
    INTO v_base_cost, v_is_badge
  FROM gm_shop_attributes
  WHERE attribute_key = p_attribute_key AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attributo non trovato o non attivo: %', p_attribute_key;
  END IF;

  -- Badge upgrades: flat cost, no surcharge
  IF v_is_badge THEN
    RETURN v_base_cost;
  END IF;

  -- Attribute upgrades: base + surcharge from tier table
  SELECT extra_gc INTO v_extra
  FROM gc_surcharge_tiers
  WHERE p_current_value >= min_value
    AND (max_value IS NULL OR p_current_value <= max_value);

  RETURN v_base_cost + COALESCE(v_extra, 0);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- GM Shop transactions: one row per purchase
CREATE TABLE gm_shop_transactions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id      uuid        NOT NULL REFERENCES seasons(id),
  user_id        uuid        NOT NULL REFERENCES auth.users(id),
  franchise_id   uuid        NOT NULL REFERENCES franchises(id),
  player_slug    text        NOT NULL,
  attribute_key  text        NOT NULL REFERENCES gm_shop_attributes(attribute_key),
  old_value      integer,           -- NULL for badge upgrades
  new_value      integer,           -- NULL for badge upgrades
  gc_cost        integer     NOT NULL CHECK (gc_cost > 0),
  -- Badge-specific fields (NULL for attribute upgrades)
  badge_name     text,
  old_tier       text,
  new_tier       text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- GM Shop upgrades: one row per upgrade applied to a player attribute
-- The UNIQUE constraint enforces "one attribute per player per season" at DB level
CREATE TABLE gm_shop_upgrades (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  uuid        NOT NULL REFERENCES gm_shop_transactions(id),
  season_id       uuid        NOT NULL REFERENCES seasons(id),
  user_id         uuid        NOT NULL REFERENCES auth.users(id),
  player_slug     text        NOT NULL,
  attribute_key   text        NOT NULL REFERENCES gm_shop_attributes(attribute_key),
  old_value       integer,
  new_value       integer,
  gc_cost         integer     NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- THE KEY CONSTRAINT: same attribute on same player by same user in same season = blocked
  UNIQUE(season_id, user_id, player_slug, attribute_key)
);

-- Index for fast upgrade count queries (for 3/3 counter)
CREATE INDEX gm_shop_upgrades_player_idx
  ON gm_shop_upgrades(season_id, user_id, player_slug);

-- Trigger: enforce max 3 upgrades per player per season
CREATE OR REPLACE FUNCTION check_upgrade_limit()
RETURNS trigger AS $$
DECLARE
  upgrade_count integer;
BEGIN
  SELECT COUNT(*) INTO upgrade_count
  FROM gm_shop_upgrades
  WHERE season_id = NEW.season_id
    AND user_id = NEW.user_id
    AND player_slug = NEW.player_slug;

  IF upgrade_count >= 3 THEN
    RAISE EXCEPTION 'Limite raggiunto: questo giocatore ha già 3 upgrade nella stagione corrente (3/3)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_upgrade_limit
  BEFORE INSERT ON gm_shop_upgrades
  FOR EACH ROW EXECUTE FUNCTION check_upgrade_limit();

-- Player base ratings: track original 2K values separately from applied upgrades
-- Populated when a player is added to a roster. Never overwritten by upgrades.
CREATE TABLE player_season_ratings (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id    uuid    NOT NULL REFERENCES seasons(id),
  player_slug  text    NOT NULL,
  attribute_key text   NOT NULL,
  base_value   integer NOT NULL,   -- value from nba2kapi at season start
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(season_id, player_slug, attribute_key)
);

-- RLS
ALTER TABLE gm_shop_attributes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE gc_surcharge_tiers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE gm_shop_transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE gm_shop_upgrades       ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_season_ratings  ENABLE ROW LEVEL SECURITY;

-- Catalog: public read (GMs need to see the price list)
CREATE POLICY "gm_shop_attributes: public read"
  ON gm_shop_attributes FOR SELECT USING (true);
CREATE POLICY "gm_shop_attributes: admin write"
  ON gm_shop_attributes FOR ALL USING (is_admin());

CREATE POLICY "gc_surcharge_tiers: public read"
  ON gc_surcharge_tiers FOR SELECT USING (true);
CREATE POLICY "gc_surcharge_tiers: admin write"
  ON gc_surcharge_tiers FOR ALL USING (is_admin());

-- Transactions: GM sees own, admin sees all
CREATE POLICY "gm_shop_transactions: own read"
  ON gm_shop_transactions FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "gm_shop_transactions: service insert"
  ON gm_shop_transactions FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR is_admin());

-- Upgrades: GM sees own, admin sees all
CREATE POLICY "gm_shop_upgrades: own read"
  ON gm_shop_upgrades FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "gm_shop_upgrades: service insert"
  ON gm_shop_upgrades FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR is_admin());

-- Base ratings: authenticated read, service insert
CREATE POLICY "player_season_ratings: authenticated read"
  ON player_season_ratings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "player_season_ratings: service insert"
  ON player_season_ratings FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR is_admin());
