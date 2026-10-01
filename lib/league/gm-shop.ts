'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { GmShopAttribute } from '@/types/league'

export interface PurchaseParams {
  playerSlug: string
  attributeKey: string
  currentValue: number | null  // null for badge upgrades
  badgeName?: string           // for badge_bronze_silver
}

export interface PurchaseResult {
  ok?: boolean
  gcCost?: number
  error?: string
}

export async function purchaseUpgrade(params: PurchaseParams): Promise<PurchaseResult> {
  const { playerSlug, attributeKey, currentValue, badgeName } = params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // Active season
  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('status', 'active')
    .single()
  if (!season) return { error: 'Nessuna stagione attiva' }

  // User must be a league member with a franchise
  const { data: member } = await supabase
    .from('league_members')
    .select('franchise_id')
    .eq('user_id', user.id)
    .eq('season_id', season.id)
    .single()
  if (!member) return { error: 'Non sei assegnato a una franchigia questa stagione' }

  // Player must be in user's roster (selected or confirmed)
  const { data: roster } = await supabase
    .from('roster_memberships')
    .select('id, status')
    .eq('franchise_id', member.franchise_id)
    .eq('season_id', season.id)
    .eq('player_slug', playerSlug)
    .neq('status', 'released')
    .single()
  if (!roster) return { error: 'Giocatore non nel tuo roster' }

  // Calculate authoritative cost via DB function
  const { data: gcCost, error: costErr } = await supabase
    .rpc('calculate_upgrade_cost', {
      p_attribute_key: attributeKey,
      p_current_value: currentValue ?? 0,
    })
  if (costErr) return { error: costErr.message }
  if (!gcCost) return { error: 'Impossibile calcolare il costo' }

  // Check balance
  const { data: balance } = await supabase
    .rpc('get_gc_balance', { p_user_id: user.id, p_season_id: season.id })
  if ((balance ?? 0) < gcCost) {
    return { error: `GC insufficienti: hai ${balance ?? 0} GC, servono ${gcCost} GC` }
  }

  // All writes use service role to bypass RLS
  const admin = createAdminClient()

  // 1. Insert transaction
  const { data: tx, error: txErr } = await admin
    .from('gm_shop_transactions')
    .insert({
      season_id: season.id,
      user_id: user.id,
      franchise_id: member.franchise_id,
      player_slug: playerSlug,
      attribute_key: attributeKey,
      old_value: currentValue,
      new_value: currentValue !== null ? currentValue + 1 : null,
      gc_cost: gcCost,
      badge_name: badgeName ?? null,
      old_tier: badgeName ? 'Bronze' : null,
      new_tier: badgeName ? 'Silver' : null,
    })
    .select('id')
    .single()
  if (txErr) return { error: txErr.message }

  // 2. Insert upgrade record (triggers: enforce_upgrade_limit, unique attribute)
  const { error: upgradeErr } = await admin
    .from('gm_shop_upgrades')
    .insert({
      transaction_id: tx.id,
      season_id: season.id,
      user_id: user.id,
      player_slug: playerSlug,
      attribute_key: attributeKey,
      old_value: currentValue,
      new_value: currentValue !== null ? currentValue + 1 : null,
      gc_cost: gcCost,
    })
  if (upgradeErr) {
    // Attempt to clean up the orphan transaction
    await admin.from('gm_shop_transactions').delete().eq('id', tx.id)
    // Translate common DB errors
    if (upgradeErr.message.includes('3/3') || upgradeErr.message.includes('Limite')) {
      return { error: 'Limite raggiunto: questo giocatore ha già 3 upgrade questa stagione' }
    }
    if (upgradeErr.code === '23505') {
      return { error: 'Attributo già potenziato questa stagione' }
    }
    return { error: upgradeErr.message }
  }

  // 3. Debit GC ledger (trigger check_gc_balance prevents going negative)
  const { error: ledgerErr } = await admin
    .from('gm_credit_ledger')
    .insert({
      season_id: season.id,
      user_id: user.id,
      amount: -gcCost,
      type: 'spent',
      reference_id: tx.id,
      note: `GM Shop: ${attributeKey} su ${playerSlug}`,
      created_by: user.id,
    })
  if (ledgerErr) {
    // Clean up orphan records
    await admin.from('gm_shop_upgrades').delete().eq('transaction_id', tx.id)
    await admin.from('gm_shop_transactions').delete().eq('id', tx.id)
    return { error: ledgerErr.message }
  }

  return { ok: true, gcCost }
}

export async function getShopAttributes(): Promise<GmShopAttribute[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('gm_shop_attributes')
    .select('*')
    .eq('active', true)
    .order('sort_order')
  return (data ?? []) as GmShopAttribute[]
}
