-- Migration 029: elimina le transazioni GM Shop annullate (e le notifiche che generano).
-- Elimina: le 3 transazioni con cancelled_at, le righe ledger 'spent' collegate,
-- e i relativi rimborsi 'adjustment' (identificati dalla nota di annullamento).
-- Irreversibile: lo storico di questi acquisti annullati si perde.

-- Rimborsi di annullamento (legati alle transazioni annullate tramite la nota)
DELETE FROM gm_credit_ledger
WHERE type = 'adjustment'
  AND note LIKE 'Rimborso annullamento upgrade %';

-- Righe di spesa collegate alle transazioni annullate
DELETE FROM gm_credit_ledger
WHERE reference_id IN (SELECT id FROM gm_shop_transactions WHERE cancelled_at IS NOT NULL);

-- Le transazioni annullate (le notifiche spariscono con esse)
DELETE FROM gm_shop_transactions
WHERE cancelled_at IS NOT NULL;
