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
