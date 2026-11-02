-- Migration 033: Chicago passa a castagnetoandrea98@gmail.com (GM in produzione).
-- Elimina l'account di test gm.test.roster@example.com e tutto ciò che gli appartiene:
-- roster, appartenenza a Chicago, movimenti GC, profilo.
-- Il saldo di Andrea si ricalcola dalle partite di Chicago con un movimento di allineamento.

-- 1) Roster della franchigia di Chicago appartenente al test
DELETE FROM roster_memberships rm
USING league_members lm, auth.users u, seasons s
WHERE lm.user_id = u.id
  AND u.email = 'gm.test.roster@example.com'
  AND rm.franchise_id = lm.franchise_id
  AND rm.season_id = lm.season_id
  AND s.id = rm.season_id AND s.status = 'active';

-- 2) Movimenti GC del test
DELETE FROM gm_credit_ledger l
USING auth.users u
WHERE l.user_id = u.id AND u.email = 'gm.test.roster@example.com';

-- 3) Appartenenza a Chicago del test: rimossa prima di assegnarla ad Andrea
DELETE FROM league_members lm
USING auth.users u
WHERE lm.user_id = u.id AND u.email = 'gm.test.roster@example.com';

-- 5) Andrea lascia Denver (la sua franchigia precedente)
DELETE FROM league_members lm
USING auth.users a, franchises f, seasons s
WHERE lm.user_id = a.id
  AND a.email = 'castagnetoandrea98@gmail.com'
  AND lm.franchise_id = f.id
  AND f.abbreviation = 'DEN'
  AND lm.season_id = s.id AND s.status = 'active';

-- 4) Chicago ad Andrea nella stagione attiva
INSERT INTO league_members (league_id, season_id, user_id, franchise_id)
SELECT s.league_id, s.id, a.id, f.id
FROM seasons s
JOIN franchises f ON f.abbreviation = 'CHI'
JOIN auth.users a ON a.email = 'castagnetoandrea98@gmail.com'
WHERE s.status = 'active';

-- 6) Allineamento GC di Andrea sui GC della franchigia di Chicago (dalla lista partite)
INSERT INTO gm_credit_ledger (season_id, user_id, amount, type, note, created_by)
SELECT s.id, a.id,
       franchise_gc_earned(f.id, s.id) - COALESCE((SELECT SUM(l.amount) FROM gm_credit_ledger l WHERE l.user_id = a.id AND l.season_id = s.id), 0),
       'adjustment', 'Allineamento GC alla presa di Chicago', a.id
FROM seasons s
JOIN franchises f ON f.abbreviation = 'CHI'
JOIN auth.users a ON a.email = 'castagnetoandrea98@gmail.com'
WHERE s.status = 'active'
  AND franchise_gc_earned(f.id, s.id) <> COALESCE((SELECT SUM(l.amount) FROM gm_credit_ledger l WHERE l.user_id = a.id AND l.season_id = s.id), 0);

-- 7) Profilo e account di test
DELETE FROM profiles p USING auth.users u WHERE p.id = u.id AND u.email = 'gm.test.roster@example.com';
DELETE FROM auth.users WHERE email = 'gm.test.roster@example.com';
