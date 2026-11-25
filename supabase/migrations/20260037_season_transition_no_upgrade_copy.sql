-- Migration 037: gli upgrade del GM Shop sono stagionali.
-- transition_season NON copia più gm_shop_upgrades nella nuova stagione:
-- ogni stagione riparte da 0/3 upgrade per giocatore e senza attributi bloccati.
-- Tutto il resto (league_members, roster, carry-over GC) è invariato rispetto alla 011.

CREATE OR REPLACE FUNCTION transition_season(
  p_new_season_name text,
  p_game_version    text DEFAULT '2K27',
  p_admin_id        uuid DEFAULT auth.uid()
)
RETURNS uuid AS $$
DECLARE
  v_current_season_id  uuid;
  v_new_season_id      uuid;
  v_league_id          uuid;
  v_carry_over_max     integer;
  v_member             record;
  v_balance            integer;
  v_carry_over         integer;
BEGIN
  -- is_admin() usa auth.uid(), che è NULL con service role: controlla p_admin_id
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Accesso negato: solo gli admin possono chiudere una stagione';
  END IF;

  SELECT s.id, s.league_id, s.carry_over_max
    INTO v_current_season_id, v_league_id, v_carry_over_max
  FROM seasons s
  JOIN leagues l ON l.id = s.league_id
  WHERE l.active = true AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_current_season_id IS NULL THEN
    RAISE EXCEPTION 'Nessuna stagione attiva trovata';
  END IF;

  UPDATE seasons SET status = 'closing' WHERE id = v_current_season_id;

  INSERT INTO seasons (league_id, name, game_version, status, carry_over_max)
  VALUES (v_league_id, p_new_season_name, p_game_version, 'active', 5)
  RETURNING id INTO v_new_season_id;

  -- Copy league members (same franchises, same GMs)
  INSERT INTO league_members (league_id, season_id, user_id, franchise_id, joined_at)
  SELECT v_league_id, v_new_season_id, user_id, franchise_id, now()
  FROM league_members
  WHERE season_id = v_current_season_id;

  -- Copy roster memberships (same players, status reset to 'selected')
  INSERT INTO roster_memberships (season_id, franchise_id, player_slug, status, acquired_at, created_by)
  SELECT v_new_season_id, franchise_id, player_slug, 'selected', now(), p_admin_id
  FROM roster_memberships
  WHERE season_id = v_current_season_id
    AND status != 'released';

  -- gm_shop_upgrades: volutamente NON copiati (gli upgrade sono stagionali)

  -- GC carry-over
  FOR v_member IN
    SELECT user_id FROM league_members WHERE season_id = v_current_season_id
  LOOP
    v_balance := get_gc_balance(v_member.user_id, v_current_season_id);
    v_carry_over := LEAST(GREATEST(v_balance, 0), v_carry_over_max);

    IF v_carry_over > 0 THEN
      INSERT INTO gm_credit_ledger
        (season_id, user_id, amount, type, note, created_by)
      VALUES
        (v_new_season_id, v_member.user_id, v_carry_over, 'carryover',
         'Carry-over da stagione ' || (SELECT name FROM seasons WHERE id = v_current_season_id),
         p_admin_id);
    END IF;

    PERFORM write_audit_log(
      'gc_carryover', p_admin_id, v_member.user_id,
      v_new_season_id, NULL, NULL,
      jsonb_build_object('balance', v_balance),
      jsonb_build_object('carry_over', v_carry_over),
      'Season transition ' || p_new_season_name
    );
  END LOOP;

  UPDATE seasons SET status = 'closed' WHERE id = v_current_season_id;

  PERFORM write_audit_log(
    'season_activated', p_admin_id, NULL,
    v_new_season_id, NULL, NULL,
    jsonb_build_object('closed_season', v_current_season_id),
    jsonb_build_object('new_season', v_new_season_id),
    'Season transition to ' || p_new_season_name
  );

  RETURN v_new_season_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
