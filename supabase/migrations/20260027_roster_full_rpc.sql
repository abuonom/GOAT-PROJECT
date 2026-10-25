-- Migration 027: roster del GM con i dati dei giocatori in una sola chiamata SQL.
-- Riduce i giri di rete verso Supabase: prima 2 query (roster, giocatori) da Next, ora 1 RPC.
-- Usa SECURITY DEFINER e restituisce solo i dati di chi chiama (auth.uid()).

CREATE OR REPLACE FUNCTION roster_full_for_me()
RETURNS TABLE (
  player_slug   text,
  status        roster_status,
  acquired_at   timestamptz,
  franchise_id  uuid,
  season_id     uuid,
  data          jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rm.player_slug, rm.status, rm.acquired_at, rm.franchise_id, rm.season_id, p.data
  FROM league_members lm
  JOIN seasons s ON s.id = lm.season_id AND s.status = 'active'
  JOIN roster_memberships rm
    ON rm.franchise_id = lm.franchise_id
   AND rm.season_id = lm.season_id
   AND rm.status <> 'released'
  LEFT JOIN players p ON p.slug = rm.player_slug
  WHERE lm.user_id = auth.uid()
  ORDER BY rm.acquired_at ASC;
$$;

REVOKE ALL ON FUNCTION roster_full_for_me() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION roster_full_for_me() TO authenticated;
