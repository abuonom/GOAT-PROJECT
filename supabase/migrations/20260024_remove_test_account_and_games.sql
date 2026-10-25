-- Migration 024: rimozione account di test e tabella games (non usata, 0 righe)
-- Account di test: gm.test.miami@example.com (GM Detroit), creato per i test del GM Shop.
-- Rimuove il suo roster stagionale, la sua appartenenza a una franchigia e l'account.
-- Non tocca nessun altro utente né i dati di lega.

-- 1) Roster dell'account di test (giocatori assegnati a Detroit per la stagione attiva)
DELETE FROM roster_memberships rm
USING league_members lm, auth.users u
WHERE lm.user_id = u.id
  AND u.email = 'gm.test.miami@example.com'
  AND rm.franchise_id = lm.franchise_id
  AND rm.season_id = lm.season_id;

-- 2) Appartenenza a franchigia dell'account di test
DELETE FROM league_members lm
USING auth.users u
WHERE lm.user_id = u.id
  AND u.email = 'gm.test.miami@example.com';

-- 3) Profilo e account
DELETE FROM profiles p
USING auth.users u
WHERE p.id = u.id
  AND u.email = 'gm.test.miami@example.com';

DELETE FROM auth.users WHERE email = 'gm.test.miami@example.com';

-- 4) Tabella games: 0 righe, nessuna chiave esterna, nessun uso nel codice
DROP TABLE IF EXISTS games;
