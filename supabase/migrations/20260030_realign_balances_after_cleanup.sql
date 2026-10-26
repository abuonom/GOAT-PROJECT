-- Migration 030: riallineamento saldi GC dopo la pulizia degli acquisti annullati (029).
-- Per ogni GM della stagione attiva, aggiunge un movimento 'adjustment' che porta il saldo
-- ai GC calcolati dalla lista partite (franchise_gc_earned). Nessuna riga viene cancellata.
-- Eseguita manualmente con la stessa logica; il file documenta l'operazione.

INSERT INTO gm_credit_ledger (season_id, user_id, amount, type, note, created_by)
SELECT s.id, lm.user_id,
       franchise_gc_earned(f.id, s.id) - COALESCE((SELECT SUM(l.amount) FROM gm_credit_ledger l WHERE l.user_id = lm.user_id AND l.season_id = s.id), 0),
       'adjustment', 'Riallineamento dopo pulizia acquisti annullati', lm.user_id
FROM league_members lm
JOIN franchises f ON f.id = lm.franchise_id
JOIN seasons s ON s.id = lm.season_id AND s.status = 'active'
WHERE franchise_gc_earned(f.id, s.id) <> COALESCE((SELECT SUM(l.amount) FROM gm_credit_ledger l WHERE l.user_id = lm.user_id AND l.season_id = s.id), 0);
