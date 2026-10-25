-- Migration 025: rimozione account admin di test (test-admin@goatdraft.test)
-- Le 6 approvazioni Dunkest Draft fatte da questo account passano all'admin reale,
-- così restano registrate con un admin esistente. Poi l'account di test viene eliminato.

UPDATE dunkest_draft_access
SET reviewed_by = '75a77bad-e1e2-4282-ab3e-03966fd4b3f2'
WHERE reviewed_by = '7625adb3-8a80-4da8-8aea-cc0a3b354164';

DELETE FROM profiles p
USING auth.users u
WHERE p.id = u.id
  AND u.email = 'test-admin@goatdraft.test';

DELETE FROM auth.users WHERE email = 'test-admin@goatdraft.test';
