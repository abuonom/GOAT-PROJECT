-- Enable Supabase Realtime for GOAT Draft tables
ALTER PUBLICATION supabase_realtime ADD TABLE goat_draft_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE goat_draft_picks;
ALTER PUBLICATION supabase_realtime ADD TABLE goat_draft_participants;
