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
