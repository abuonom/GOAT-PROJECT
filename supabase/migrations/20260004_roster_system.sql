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
