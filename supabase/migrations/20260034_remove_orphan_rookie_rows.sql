-- Migration 034: rimuove le righe di roster che puntano a rookie inesistenti (orfane).
-- Causa: l'aggiunta del rookie fallita dopo l'inserimento nel roster (errore updateTag),
-- con rollback incompleto. Rimosse solo le righe senza player e senza upgrade/transazioni.
-- Il rollback del rookie è ora sicuro anche in caso di eccezione.

DELETE FROM roster_memberships rm
WHERE rm.player_slug LIKE 'rookie-%'
  AND NOT EXISTS (SELECT 1 FROM players p WHERE p.slug = rm.player_slug)
  AND NOT EXISTS (SELECT 1 FROM gm_shop_upgrades u WHERE u.player_slug = rm.player_slug)
  AND NOT EXISTS (SELECT 1 FROM gm_shop_transactions t WHERE t.player_slug = rm.player_slug);
