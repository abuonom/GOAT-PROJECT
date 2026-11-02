-- Migration 035: rimozione account di test gm.test.rookie@example.com e dei suoi dati.
-- Rimuove: roster, appartenenza a Boston, rookie creati dai test (usati solo da questo account),
-- profilo e account. Nessun movimento GC, transazione o upgrade appartiene a questo account.

-- 1) Rookie creati dai test e presenti solo nel roster di questo account
DELETE FROM players p
WHERE p.slug LIKE 'rookie-%'
  AND NOT EXISTS (
    SELECT 1 FROM roster_memberships rm
    JOIN league_members lm ON lm.franchise_id = rm.franchise_id AND lm.season_id = rm.season_id
    JOIN auth.users u ON u.id = lm.user_id
    WHERE rm.player_slug = p.slug AND u.email <> 'gm.test.rookie@example.com' AND rm.status <> 'released'
  )
  AND EXISTS (
    SELECT 1 FROM roster_memberships rm
    JOIN league_members lm ON lm.franchise_id = rm.franchise_id AND lm.season_id = rm.season_id
    JOIN auth.users u ON u.id = lm.user_id
    WHERE rm.player_slug = p.slug AND u.email = 'gm.test.rookie@example.com'
  );

-- 2) Roster del test (righe rimaste dopo la rimozione dei rookie)
DELETE FROM roster_memberships rm
USING league_members lm, auth.users u
WHERE lm.user_id = u.id
  AND u.email = 'gm.test.rookie@example.com'
  AND rm.franchise_id = lm.franchise_id
  AND rm.season_id = lm.season_id;

-- 3) Appartenenza a franchigia, profilo, account
DELETE FROM league_members lm USING auth.users u WHERE lm.user_id = u.id AND u.email = 'gm.test.rookie@example.com';
DELETE FROM profiles p USING auth.users u WHERE p.id = u.id AND u.email = 'gm.test.rookie@example.com';
DELETE FROM auth.users WHERE email = 'gm.test.rookie@example.com';
