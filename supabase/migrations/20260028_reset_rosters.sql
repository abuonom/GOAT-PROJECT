-- Migration 028: azzeramento dei roster della stagione attiva (cancellazione).
-- Rimuove le righe roster_memberships non rilasciate della stagione attiva.
-- Non tocca franchigie, account, GC, acquisti GM Shop né le partite.
-- Irreversibile: lo storico dei roster per la stagione attiva viene perso.

DELETE FROM roster_memberships rm
USING seasons s
WHERE s.id = rm.season_id
  AND s.status = 'active'
  AND rm.status <> 'released';
