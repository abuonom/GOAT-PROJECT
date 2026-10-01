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
