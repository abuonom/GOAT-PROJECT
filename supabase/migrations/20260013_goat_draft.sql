-- Migration 013: DUNKEST GOAT DRAFT
-- Separate catalog and draft system, completely independent from NBA 2K data.

-- ─── Dunkest Player Catalog ───────────────────────────────────────────────────

CREATE TABLE dunkest_players (
  id         serial       PRIMARY KEY,
  name       text         NOT NULL,
  team       text         NOT NULL,
  role       text         NOT NULL,
  value      numeric(5,1) NOT NULL CHECK (value >= 0),
  -- Import metadata
  imported_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: row_index from the XLSX (id column = row index 1-based)
-- name+team is not unique in source data, so we rely on serial id.

CREATE INDEX dunkest_players_name_idx ON dunkest_players(name);
CREATE INDEX dunkest_players_team_idx ON dunkest_players(team);
CREATE INDEX dunkest_players_role_idx ON dunkest_players(role);
CREATE INDEX dunkest_players_value_idx ON dunkest_players(value DESC);

-- All authenticated users can read the catalog
ALTER TABLE dunkest_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dunkest_players: authenticated read"
  ON dunkest_players FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "dunkest_players: admin full"
  ON dunkest_players FOR ALL USING (is_admin());

-- ─── Draft Sessions ───────────────────────────────────────────────────────────

CREATE TYPE goat_draft_status AS ENUM ('setup', 'active', 'completed');

CREATE TABLE goat_draft_sessions (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text         NOT NULL,
  status              goat_draft_status NOT NULL DEFAULT 'setup',
  current_round       int          NOT NULL DEFAULT 1,
  -- Ordered arrays of participant IDs (goat_draft_participants.id)
  -- initial_order: result of the initial draw, never changes
  -- current_round_order: order for the ongoing round
  initial_order       uuid[]       NOT NULL DEFAULT '{}',
  current_round_order uuid[]       NOT NULL DEFAULT '{}',
  next_round_order    uuid[]                DEFAULT NULL,
  -- Index within current_round_order (0-based) of who picks next
  current_pick_index  int          NOT NULL DEFAULT 0,
  -- Global pick counter across all rounds
  total_picks         int          NOT NULL DEFAULT 0,
  created_by          uuid         NOT NULL REFERENCES auth.users(id),
  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE goat_draft_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goat_draft_sessions: authenticated read"
  ON goat_draft_sessions FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "goat_draft_sessions: admin full"
  ON goat_draft_sessions FOR ALL USING (is_admin());
CREATE POLICY "goat_draft_sessions: creator write"
  ON goat_draft_sessions FOR UPDATE
  USING (created_by = auth.uid());

-- ─── Draft Participants ───────────────────────────────────────────────────────

CREATE TABLE goat_draft_participants (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           uuid         NOT NULL REFERENCES goat_draft_sessions(id) ON DELETE CASCADE,
  user_id              uuid         NOT NULL REFERENCES auth.users(id),
  display_name         text         NOT NULL,
  -- Position in the initial draw (1-8)
  initial_position     int          NOT NULL,
  -- Cached roster value (updated after each pick)
  roster_value         numeric(7,1) NOT NULL DEFAULT 0,
  -- Position in current round order (1-8, updated at round transitions)
  current_round_position int        NOT NULL DEFAULT 0,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT goat_draft_participants_session_user_unique UNIQUE (session_id, user_id)
);

CREATE INDEX goat_draft_participants_session_idx ON goat_draft_participants(session_id);

ALTER TABLE goat_draft_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goat_draft_participants: authenticated read"
  ON goat_draft_participants FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "goat_draft_participants: admin full"
  ON goat_draft_participants FOR ALL USING (is_admin());

-- ─── Draft Picks ──────────────────────────────────────────────────────────────

CREATE TABLE goat_draft_picks (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid         NOT NULL REFERENCES goat_draft_sessions(id) ON DELETE CASCADE,
  participant_id        uuid         NOT NULL REFERENCES goat_draft_participants(id),
  dunkest_player_id     int          NOT NULL REFERENCES dunkest_players(id),
  round_number          int          NOT NULL,
  pick_in_round         int          NOT NULL,  -- 1-based position within the round
  global_pick_number    int          NOT NULL,  -- 1-based across the whole draft
  player_value_at_pick  numeric(5,1) NOT NULL,  -- snapshot of value at pick time
  picked_at             timestamptz  NOT NULL DEFAULT now(),
  -- A player can only be picked once per session
  CONSTRAINT goat_draft_picks_session_player_unique UNIQUE (session_id, dunkest_player_id),
  -- A participant picks exactly once per round
  CONSTRAINT goat_draft_picks_participant_round_unique UNIQUE (session_id, participant_id, round_number)
);

CREATE INDEX goat_draft_picks_session_idx ON goat_draft_picks(session_id, round_number, pick_in_round);
CREATE INDEX goat_draft_picks_participant_idx ON goat_draft_picks(participant_id);

ALTER TABLE goat_draft_picks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goat_draft_picks: authenticated read"
  ON goat_draft_picks FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "goat_draft_picks: authenticated insert"
  ON goat_draft_picks FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "goat_draft_picks: admin full"
  ON goat_draft_picks FOR ALL USING (is_admin());

-- ─── Helper: update goat_draft_sessions.updated_at ───────────────────────────

CREATE OR REPLACE FUNCTION update_goat_draft_sessions_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER goat_draft_sessions_updated_at
  BEFORE UPDATE ON goat_draft_sessions
  FOR EACH ROW EXECUTE FUNCTION update_goat_draft_sessions_updated_at();
