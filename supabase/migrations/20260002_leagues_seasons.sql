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
