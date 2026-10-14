-- Migration 014: Dunkest Draft Access Control
-- Users request access; admin approves or rejects.

CREATE TYPE dunkest_access_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE dunkest_draft_access (
  id           uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid                   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       dunkest_access_status  NOT NULL DEFAULT 'pending',
  requested_at timestamptz            NOT NULL DEFAULT now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid                   REFERENCES auth.users(id),
  CONSTRAINT dunkest_draft_access_user_unique UNIQUE (user_id)
);

CREATE INDEX dunkest_draft_access_status_idx ON dunkest_draft_access(status);

ALTER TABLE dunkest_draft_access ENABLE ROW LEVEL SECURITY;

-- User can read their own row
CREATE POLICY "dunkest_access: own read"
  ON dunkest_draft_access FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

-- User can insert their own request (once — enforced by unique constraint)
CREATE POLICY "dunkest_access: own insert"
  ON dunkest_draft_access FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Admin full access
CREATE POLICY "dunkest_access: admin full"
  ON dunkest_draft_access FOR ALL USING (is_admin());
