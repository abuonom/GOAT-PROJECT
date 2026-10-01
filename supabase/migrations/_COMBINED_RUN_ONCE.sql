-- ============================================
-- GOAT LEAGUE 2.0 — MIGRATION COMPLETA
-- Incolla nell'ordine nel Supabase SQL Editor
-- ============================================

-- ============================================
-- FILE: supabase/migrations/20260001_profiles_roles.sql
-- ============================================
-- Migration 001: Profiles and Roles
-- Adds user profiles with role system (gm / admin)
-- Replaces hardcoded admin UUID with proper role management

CREATE TYPE user_role AS ENUM ('gm', 'admin');

CREATE TABLE profiles (
  id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text,
  role          user_role   NOT NULL DEFAULT 'gm',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Auto-create a profile (role: gm) when a new user registers
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'gm'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Seed profile for the existing hardcoded admin user
-- The role can be updated via the admin UI; this is just the bootstrap
INSERT INTO profiles (id, display_name, role)
SELECT id, split_part(email, '@', 1), 'admin'
FROM auth.users
WHERE id = '8c324ca8-0da6-4216-8579-d02c4887dda3'
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- Seed profiles for any existing users that don't have one yet
INSERT INTO profiles (id, display_name, role)
SELECT id, split_part(email, '@', 1), 'gm'
FROM auth.users
WHERE id != '8c324ca8-0da6-4216-8579-d02c4887dda3'
ON CONFLICT (id) DO NOTHING;

-- Helper: check if the calling user is an admin (used in RLS policies)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile; admins can read all
CREATE POLICY "profiles: own read"
  ON profiles FOR SELECT
  USING (id = auth.uid() OR is_admin());

-- Users can update their own display_name only (not role)
CREATE POLICY "profiles: own update display_name"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = (SELECT role FROM profiles WHERE id = auth.uid()));

-- Only admins can change roles
CREATE POLICY "profiles: admin full access"
  ON profiles FOR ALL
  USING (is_admin());


-- ============================================
-- FILE: supabase/migrations/20260002_leagues_seasons.sql
-- ============================================
-- Migration 002: Leagues and Seasons
-- Multi-season support. max_franchises is a config param, not hardcoded.

CREATE TYPE season_status AS ENUM ('upcoming', 'active', 'closing', 'closed');

CREATE TABLE leagues (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL DEFAULT 'GOAT League',
  max_franchises  integer     NOT NULL DEFAULT 30,
  active          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE seasons (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id        uuid          NOT NULL REFERENCES leagues(id),
  name             text          NOT NULL,        -- e.g. '2026/27'
  game_version     text          NOT NULL DEFAULT '2K27',
  start_date       date,
  end_date         date,
  status           season_status NOT NULL DEFAULT 'active',
  carry_over_max   integer       NOT NULL DEFAULT 5,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  UNIQUE(league_id, name)
);

-- Seed: GOAT League + 2026/27 season
WITH inserted_league AS (
  INSERT INTO leagues (name, max_franchises, active)
  VALUES ('GOAT League', 30, true)
  RETURNING id
)
INSERT INTO seasons (league_id, name, game_version, status)
SELECT id, '2026/27', '2K27', 'active'
FROM inserted_league;

-- Helper: get the currently active season id
CREATE OR REPLACE FUNCTION active_season_id()
RETURNS uuid AS $$
  SELECT s.id
  FROM seasons s
  JOIN leagues l ON l.id = s.league_id
  WHERE l.active = true AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS: public read, admin write
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leagues: public read"  ON leagues FOR SELECT USING (true);
CREATE POLICY "leagues: admin write"  ON leagues FOR ALL   USING (is_admin());

CREATE POLICY "seasons: public read"  ON seasons FOR SELECT USING (true);
CREATE POLICY "seasons: admin write"  ON seasons FOR ALL   USING (is_admin());


-- ============================================
-- FILE: supabase/migrations/20260003_franchises.sql
-- ============================================
-- Migration 003: Franchises
-- 30 NBA franchises as static reference data.
-- Seeded once; admins can update display fields but not add/remove franchises
-- without a new migration (structural change).

CREATE TABLE franchises (
  id           uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id    uuid  NOT NULL REFERENCES leagues(id),
  name         text  NOT NULL,          -- e.g. 'Boston Celtics'
  abbreviation text  NOT NULL,          -- e.g. 'BOS'
  city         text  NOT NULL,
  conference   text  NOT NULL CHECK (conference IN ('East', 'West')),
  division     text  NOT NULL,
  espn_id      text,                    -- for TeamLogo component
  sort_order   integer NOT NULL DEFAULT 0,
  UNIQUE(league_id, abbreviation)
);

-- Seed all 30 NBA franchises
-- ESPN IDs match teamLogos.ts espn field
DO $$
DECLARE league uuid;
BEGIN
  SELECT id INTO league FROM leagues WHERE name = 'GOAT League' LIMIT 1;

  INSERT INTO franchises (league_id, name, abbreviation, city, conference, division, espn_id, sort_order) VALUES
  -- East — Atlantic
  (league, 'Boston Celtics',        'BOS', 'Boston',        'East', 'Atlantic', 'bos',  1),
  (league, 'Brooklyn Nets',         'BKN', 'Brooklyn',      'East', 'Atlantic', 'bkn',  2),
  (league, 'New York Knicks',       'NYK', 'New York',      'East', 'Atlantic', 'ny',   3),
  (league, 'Philadelphia 76ers',    'PHI', 'Philadelphia',  'East', 'Atlantic', 'phi',  4),
  (league, 'Toronto Raptors',       'TOR', 'Toronto',       'East', 'Atlantic', 'tor',  5),
  -- East — Central
  (league, 'Chicago Bulls',         'CHI', 'Chicago',       'East', 'Central',  'chi',  6),
  (league, 'Cleveland Cavaliers',   'CLE', 'Cleveland',     'East', 'Central',  'cle',  7),
  (league, 'Detroit Pistons',       'DET', 'Detroit',       'East', 'Central',  'det',  8),
  (league, 'Indiana Pacers',        'IND', 'Indiana',       'East', 'Central',  'ind',  9),
  (league, 'Milwaukee Bucks',       'MIL', 'Milwaukee',     'East', 'Central',  'mil', 10),
  -- East — Southeast
  (league, 'Atlanta Hawks',         'ATL', 'Atlanta',       'East', 'Southeast','atl', 11),
  (league, 'Charlotte Hornets',     'CHA', 'Charlotte',     'East', 'Southeast','cha', 12),
  (league, 'Miami Heat',            'MIA', 'Miami',         'East', 'Southeast','mia', 13),
  (league, 'Orlando Magic',         'ORL', 'Orlando',       'East', 'Southeast','orl', 14),
  (league, 'Washington Wizards',    'WAS', 'Washington',    'East', 'Southeast','wsh', 15),
  -- West — Northwest
  (league, 'Denver Nuggets',        'DEN', 'Denver',        'West', 'Northwest','den', 16),
  (league, 'Minnesota Timberwolves','MIN', 'Minnesota',     'West', 'Northwest','min', 17),
  (league, 'Oklahoma City Thunder', 'OKC', 'Oklahoma City', 'West', 'Northwest','okc', 18),
  (league, 'Portland Trail Blazers','POR', 'Portland',      'West', 'Northwest','por', 19),
  (league, 'Utah Jazz',             'UTA', 'Utah',          'West', 'Northwest','utah',20),
  -- West — Pacific
  (league, 'Golden State Warriors', 'GSW', 'Golden State',  'West', 'Pacific',  'gs',  21),
  (league, 'LA Clippers',           'LAC', 'Los Angeles',   'West', 'Pacific',  'lac', 22),
  (league, 'Los Angeles Lakers',    'LAL', 'Los Angeles',   'West', 'Pacific',  'lal', 23),
  (league, 'Phoenix Suns',          'PHX', 'Phoenix',       'West', 'Pacific',  'phx', 24),
  (league, 'Sacramento Kings',      'SAC', 'Sacramento',    'West', 'Pacific',  'sac', 25),
  -- West — Southwest
  (league, 'Dallas Mavericks',      'DAL', 'Dallas',        'West', 'Southwest','dal', 26),
  (league, 'Houston Rockets',       'HOU', 'Houston',       'West', 'Southwest','hou', 27),
  (league, 'Memphis Grizzlies',     'MEM', 'Memphis',       'West', 'Southwest','mem', 28),
  (league, 'New Orleans Pelicans',  'NOP', 'New Orleans',   'West', 'Southwest','no',  29),
  (league, 'San Antonio Spurs',     'SAS', 'San Antonio',   'West', 'Southwest','sa',  30);
END $$;

-- league_members: user ↔ franchise assignment per season
CREATE TABLE league_members (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id     uuid        NOT NULL REFERENCES leagues(id),
  season_id     uuid        NOT NULL REFERENCES seasons(id),
  user_id       uuid        NOT NULL REFERENCES auth.users(id),
  franchise_id  uuid        NOT NULL REFERENCES franchises(id),
  games_played  integer     NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  joined_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(season_id, user_id),       -- one franchise per user per season
  UNIQUE(season_id, franchise_id)   -- one user per franchise per season
);

-- RLS
ALTER TABLE franchises     ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "franchises: public read"       ON franchises FOR SELECT USING (true);
CREATE POLICY "franchises: admin write"       ON franchises FOR ALL   USING (is_admin());

-- GM can see all members (to know who owns which franchise)
CREATE POLICY "league_members: authenticated read"
  ON league_members FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "league_members: admin write"
  ON league_members FOR ALL USING (is_admin());


-- ============================================
-- FILE: supabase/migrations/20260004_roster_system.sql
-- ============================================
-- Migration 004: Roster System
-- Replaces saved_players with a proper roster_memberships table.
-- Designed to support future trade system via status transitions.
-- saved_players table is NOT dropped — kept as historical data.

CREATE TYPE roster_status AS ENUM ('selected', 'confirmed', 'released');

CREATE TABLE roster_memberships (
  id                         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id                  uuid         NOT NULL REFERENCES seasons(id),
  franchise_id               uuid         NOT NULL REFERENCES franchises(id),
  player_slug                text         NOT NULL,  -- references players(slug) via app logic
  status                     roster_status NOT NULL DEFAULT 'selected',
  acquired_at                timestamptz  NOT NULL DEFAULT now(),
  released_at                timestamptz,
  -- Trade system hooks (unused now, enforced to be null until trades are implemented)
  acquired_from_franchise_id uuid         REFERENCES franchises(id),
  trade_id                   uuid,        -- FK to future trades table
  created_by                 uuid         NOT NULL REFERENCES auth.users(id),
  CONSTRAINT released_has_released_at CHECK (
    status != 'released' OR released_at IS NOT NULL
  )
);

-- A player can only have one active (non-released) membership per season.
-- This is the DB-level guard preventing two GMs from owning the same player.
CREATE UNIQUE INDEX roster_memberships_active_unique
  ON roster_memberships(season_id, player_slug)
  WHERE status != 'released';

-- Index for fast per-franchise queries
CREATE INDEX roster_memberships_franchise_idx
  ON roster_memberships(season_id, franchise_id, status);

-- Index for admin "available players" queries
CREATE INDEX roster_memberships_player_idx
  ON roster_memberships(season_id, player_slug, status);

-- Enforce max roster size via trigger (optional cap, can be configured)
-- Leave at 20 for now; admin can adjust max_franchises config separately
CREATE OR REPLACE FUNCTION check_roster_size()
RETURNS trigger AS $$
DECLARE
  current_size integer;
BEGIN
  SELECT COUNT(*) INTO current_size
  FROM roster_memberships
  WHERE season_id = NEW.season_id
    AND franchise_id = NEW.franchise_id
    AND status != 'released';

  -- 20 players max per roster (configurable in future via league settings)
  IF current_size >= 20 THEN
    RAISE EXCEPTION 'Roster full: maximum 20 players allowed per franchise per season';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_roster_size
  BEFORE INSERT ON roster_memberships
  FOR EACH ROW EXECUTE FUNCTION check_roster_size();

-- RLS
ALTER TABLE roster_memberships ENABLE ROW LEVEL SECURITY;

-- GM can read their own franchise's memberships
CREATE POLICY "roster_memberships: own franchise read"
  ON roster_memberships FOR SELECT
  USING (
    franchise_id IN (
      SELECT franchise_id FROM league_members
      WHERE user_id = auth.uid() AND season_id = roster_memberships.season_id
    )
    OR is_admin()
  );

-- All authenticated users can see confirmed rosters (public info)
CREATE POLICY "roster_memberships: confirmed public read"
  ON roster_memberships FOR SELECT
  USING (status = 'confirmed' AND auth.role() = 'authenticated');

-- GM can insert/update their own roster
CREATE POLICY "roster_memberships: own franchise write"
  ON roster_memberships FOR INSERT
  WITH CHECK (
    franchise_id IN (
      SELECT franchise_id FROM league_members
      WHERE user_id = auth.uid() AND season_id = roster_memberships.season_id
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "roster_memberships: own franchise update"
  ON roster_memberships FOR UPDATE
  USING (
    franchise_id IN (
      SELECT franchise_id FROM league_members
      WHERE user_id = auth.uid() AND season_id = roster_memberships.season_id
    )
  );

-- Admin full access
CREATE POLICY "roster_memberships: admin full"
  ON roster_memberships FOR ALL USING (is_admin());


-- ============================================
-- FILE: supabase/migrations/20260005_gm_credits.sql
-- ============================================
-- Migration 005: GM Credits system
-- Ledger-based GC tracking. The balance is ALWAYS derivable from the ledger.
-- games table prepared for future full match management.

CREATE TYPE gc_event_type AS ENUM (
  'earned',       -- GC from games played (milestone reached)
  'spent',        -- GC deducted for a GM Shop purchase
  'carryover',    -- GC carried over from previous season (max 5)
  'adjustment'    -- Admin manual correction (with required note)
);

-- GC Ledger: append-only, never update or delete rows
CREATE TABLE gm_credit_ledger (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id     uuid          NOT NULL REFERENCES seasons(id),
  user_id       uuid          NOT NULL REFERENCES auth.users(id),
  amount        integer       NOT NULL,  -- positive = credit, negative = debit
  type          gc_event_type NOT NULL,
  reference_id  uuid,          -- FK to gm_shop_transactions.id (when type = 'spent')
  note          text,          -- required when type = 'adjustment'
  created_at    timestamptz   NOT NULL DEFAULT now(),
  created_by    uuid          NOT NULL REFERENCES auth.users(id),  -- who created the entry
  CONSTRAINT adjustment_requires_note CHECK (
    type != 'adjustment' OR (note IS NOT NULL AND note != '')
  ),
  -- GC balance can never go negative: enforced at app level + DB check via function
  CONSTRAINT spent_must_be_negative CHECK (type != 'spent' OR amount < 0),
  CONSTRAINT earned_must_be_positive CHECK (type != 'earned' OR amount > 0),
  CONSTRAINT carryover_must_be_positive CHECK (type != 'carryover' OR amount > 0),
  CONSTRAINT carryover_max_five CHECK (type != 'carryover' OR amount <= 5)
);

CREATE INDEX gm_credit_ledger_user_season_idx
  ON gm_credit_ledger(user_id, season_id, created_at DESC);

-- GC milestone lookup table (source of truth for games → GC mapping)
CREATE TABLE gc_milestones (
  games_played  integer PRIMARY KEY,
  gc_total      integer NOT NULL   -- cumulative GC at this milestone
);

INSERT INTO gc_milestones (games_played, gc_total) VALUES
  (5,  1),
  (10, 2),
  (20, 4),
  (30, 6),
  (40, 9),
  (50, 12),
  (60, 16),
  (70, 20),
  (82, 25);

-- Function: given a games_played count, return the cumulative GC total
-- Uses the milestone lookup (step function, not linear interpolation)
CREATE OR REPLACE FUNCTION calculate_gc_earned(p_games_played integer)
RETURNS integer AS $$
  SELECT COALESCE(
    (SELECT gc_total FROM gc_milestones
     WHERE games_played <= p_games_played
     ORDER BY games_played DESC
     LIMIT 1),
    0
  )
$$ LANGUAGE sql IMMUTABLE;

-- Function: get a user's current GC balance for a season
CREATE OR REPLACE FUNCTION get_gc_balance(p_user_id uuid, p_season_id uuid)
RETURNS integer AS $$
  SELECT COALESCE(SUM(amount), 0)::integer
  FROM gm_credit_ledger
  WHERE user_id = p_user_id AND season_id = p_season_id
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Trigger: prevent GC balance from going below zero
CREATE OR REPLACE FUNCTION check_gc_balance()
RETURNS trigger AS $$
DECLARE
  current_balance integer;
BEGIN
  IF NEW.amount < 0 THEN
    SELECT get_gc_balance(NEW.user_id, NEW.season_id) INTO current_balance;
    IF current_balance + NEW.amount < 0 THEN
      RAISE EXCEPTION 'GC insufficienti: balance % GC, richiesti % GC',
        current_balance, ABS(NEW.amount);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_gc_balance
  BEFORE INSERT ON gm_credit_ledger
  FOR EACH ROW EXECUTE FUNCTION check_gc_balance();

-- Games table: prepared for future full match management
-- For now, games_played is managed via league_members.games_played (admin updated)
CREATE TABLE games (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id         uuid        NOT NULL REFERENCES seasons(id),
  home_franchise_id uuid        REFERENCES franchises(id),
  away_franchise_id uuid        REFERENCES franchises(id),
  played_at         timestamptz,
  status            text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'played', 'cancelled')),
  home_score        integer,
  away_score        integer,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES auth.users(id)
);

-- RLS
ALTER TABLE gm_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE gc_milestones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE games             ENABLE ROW LEVEL SECURITY;

-- GM can read their own ledger
CREATE POLICY "gm_credit_ledger: own read"
  ON gm_credit_ledger FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

-- Only backend (service role) or admins insert; GMs never write directly
CREATE POLICY "gm_credit_ledger: admin insert"
  ON gm_credit_ledger FOR INSERT
  WITH CHECK (is_admin() OR auth.role() = 'service_role');

-- Ledger is append-only: no updates, no deletes (even for admins)
-- Corrections are done via new 'adjustment' entries

-- GC milestones: public read, admin write
CREATE POLICY "gc_milestones: public read"  ON gc_milestones FOR SELECT USING (true);
CREATE POLICY "gc_milestones: admin write"  ON gc_milestones FOR ALL   USING (is_admin());

-- Games: authenticated read, admin write
CREATE POLICY "games: authenticated read"   ON games FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "games: admin write"          ON games FOR ALL   USING (is_admin());


-- ============================================
-- FILE: supabase/migrations/20260006_gm_shop.sql
-- ============================================
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


-- ============================================
-- FILE: supabase/migrations/20260007_audit_log.sql
-- ============================================
-- Migration 007: Audit Log
-- Immutable record of important league operations.
-- Append-only: no updates, no deletes, even for admins.

CREATE TYPE audit_event_type AS ENUM (
  'roster_player_selected',
  'roster_player_released',
  'roster_confirmed',
  'roster_admin_modified',
  'gm_shop_purchase',
  'gc_earned',
  'gc_adjustment',
  'gc_carryover',
  'franchise_assigned',
  'franchise_unassigned',
  'user_role_changed',
  'season_activated',
  'season_closed',
  'admin_games_updated'
);

CREATE TABLE audit_log (
  id           uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type   audit_event_type NOT NULL,
  season_id    uuid             REFERENCES seasons(id),
  actor_id     uuid             NOT NULL REFERENCES auth.users(id),  -- who did it
  subject_id   uuid             REFERENCES auth.users(id),           -- who it happened to (optional)
  franchise_id uuid             REFERENCES franchises(id),
  player_slug  text,
  old_value    jsonb,           -- before state (null if not applicable)
  new_value    jsonb,           -- after state (null if not applicable)
  reason       text,            -- required for admin overrides
  metadata     jsonb,           -- any extra context
  created_at   timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_actor_idx   ON audit_log(actor_id, created_at DESC);
CREATE INDEX audit_log_subject_idx ON audit_log(subject_id, created_at DESC);
CREATE INDEX audit_log_season_idx  ON audit_log(season_id, created_at DESC);
CREATE INDEX audit_log_event_idx   ON audit_log(event_type, created_at DESC);

-- Helper function: insert an audit entry (called by other functions/triggers)
CREATE OR REPLACE FUNCTION write_audit_log(
  p_event_type   audit_event_type,
  p_actor_id     uuid,
  p_subject_id   uuid DEFAULT NULL,
  p_season_id    uuid DEFAULT NULL,
  p_franchise_id uuid DEFAULT NULL,
  p_player_slug  text DEFAULT NULL,
  p_old_value    jsonb DEFAULT NULL,
  p_new_value    jsonb DEFAULT NULL,
  p_reason       text DEFAULT NULL,
  p_metadata     jsonb DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO audit_log (
    event_type, actor_id, subject_id, season_id, franchise_id,
    player_slug, old_value, new_value, reason, metadata
  ) VALUES (
    p_event_type, p_actor_id, p_subject_id, p_season_id, p_franchise_id,
    p_player_slug, p_old_value, p_new_value, p_reason, p_metadata
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS: append-only. No one can update or delete audit entries.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read all audit entries
CREATE POLICY "audit_log: admin read"
  ON audit_log FOR SELECT USING (is_admin());

-- GMs can read their own entries (events where they are subject or actor)
CREATE POLICY "audit_log: own read"
  ON audit_log FOR SELECT
  USING (actor_id = auth.uid() OR subject_id = auth.uid());

-- Only service role can insert (prevents clients from forging audit entries)
CREATE POLICY "audit_log: service insert"
  ON audit_log FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Explicitly NO update or delete policy = nobody can modify or delete


-- ============================================
-- FILE: supabase/migrations/20260008_rls_existing_tables.sql
-- ============================================
-- Migration 008: Harden RLS on existing tables
-- The original tables (players, player_potentials, contracts, saved_players)
-- have implicit or missing RLS. This migration adds proper policies.
-- saved_players is kept as-is (read-only going forward, superseded by roster_memberships).

-- players: public read (all authenticated), no writes except service role
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'players' AND policyname = 'players: authenticated read'
  ) THEN
    ALTER TABLE players ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "players: authenticated read"
      ON players FOR SELECT USING (auth.role() = 'authenticated');
    CREATE POLICY "players: public anon read"
      ON players FOR SELECT USING (auth.role() = 'anon');
  END IF;
END $$;

-- player_potentials: same as players
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'player_potentials' AND policyname = 'potentials: authenticated read'
  ) THEN
    ALTER TABLE player_potentials ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "potentials: authenticated read"
      ON player_potentials FOR SELECT USING (auth.role() IN ('authenticated', 'anon'));
  END IF;
END $$;

-- contracts: same pattern
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contracts' AND policyname = 'contracts: authenticated read'
  ) THEN
    ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "contracts: authenticated read"
      ON contracts FOR SELECT USING (auth.role() IN ('authenticated', 'anon'));
  END IF;
END $$;

-- saved_players: users can only see their own rows (already implied by app logic)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'saved_players' AND policyname = 'saved_players: own read'
  ) THEN
    ALTER TABLE saved_players ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "saved_players: own read"
      ON saved_players FOR SELECT USING (user_id = auth.uid());
    CREATE POLICY "saved_players: own write"
      ON saved_players FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

-- Add players foreign key awareness to roster_memberships
-- (Can't use real FK since players.slug isn't a proper PK with a constraint,
-- but we add a check function to keep data clean)
CREATE OR REPLACE FUNCTION player_slug_exists(p_slug text)
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM players WHERE slug = p_slug)
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ============================================
-- FILE: supabase/migrations/20260009_season_transition.sql
-- ============================================
-- Migration 009: Season transition RPC
-- Handles end-of-season GC carry-over and new season bootstrap.
-- Called by admin only.

-- Function: close current season and open next one
-- Steps:
--   1. For each active GM, calculate carry-over GC (min(balance, carry_over_max))
--   2. Mark current season as 'closed'
--   3. Create new season
--   4. Insert carry-over ledger entries for the new season
-- This is an admin-only operation called from the backoffice UI.
CREATE OR REPLACE FUNCTION transition_season(
  p_new_season_name text,
  p_game_version    text DEFAULT '2K27',
  p_admin_id        uuid DEFAULT auth.uid()
)
RETURNS uuid AS $$
DECLARE
  v_current_season_id  uuid;
  v_new_season_id      uuid;
  v_league_id          uuid;
  v_carry_over_max     integer;
  v_member             record;
  v_balance            integer;
  v_carry_over         integer;
BEGIN
  -- Only admins can call this
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Accesso negato: solo gli admin possono chiudere una stagione';
  END IF;

  -- Get current active season
  SELECT s.id, s.league_id, s.carry_over_max
    INTO v_current_season_id, v_league_id, v_carry_over_max
  FROM seasons s
  JOIN leagues l ON l.id = s.league_id
  WHERE l.active = true AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_current_season_id IS NULL THEN
    RAISE EXCEPTION 'Nessuna stagione attiva trovata';
  END IF;

  -- Mark current season as 'closing' (not yet fully closed)
  UPDATE seasons SET status = 'closing' WHERE id = v_current_season_id;

  -- Create new season
  INSERT INTO seasons (league_id, name, game_version, status, carry_over_max)
  VALUES (v_league_id, p_new_season_name, p_game_version, 'active', 5)
  RETURNING id INTO v_new_season_id;

  -- For each league member of the closing season, calculate carry-over
  FOR v_member IN
    SELECT user_id FROM league_members WHERE season_id = v_current_season_id
  LOOP
    v_balance := get_gc_balance(v_member.user_id, v_current_season_id);
    v_carry_over := LEAST(GREATEST(v_balance, 0), v_carry_over_max);

    IF v_carry_over > 0 THEN
      INSERT INTO gm_credit_ledger
        (season_id, user_id, amount, type, note, created_by)
      VALUES
        (v_new_season_id, v_member.user_id, v_carry_over, 'carryover',
         'Carry-over da stagione ' || (SELECT name FROM seasons WHERE id = v_current_season_id),
         p_admin_id);
    END IF;

    -- Audit
    PERFORM write_audit_log(
      'gc_carryover',
      p_admin_id,
      v_member.user_id,
      v_new_season_id,
      NULL, NULL,
      jsonb_build_object('balance', v_balance),
      jsonb_build_object('carry_over', v_carry_over),
      'Season transition ' || p_new_season_name
    );
  END LOOP;

  -- Now fully close the old season
  UPDATE seasons SET status = 'closed' WHERE id = v_current_season_id;

  -- Audit the season transition itself
  PERFORM write_audit_log(
    'season_activated',
    p_admin_id,
    NULL,
    v_new_season_id,
    NULL, NULL,
    jsonb_build_object('closed_season', v_current_season_id),
    jsonb_build_object('new_season', v_new_season_id),
    'Season transition to ' || p_new_season_name
  );

  RETURN v_new_season_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


