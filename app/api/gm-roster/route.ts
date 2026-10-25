import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// Il roster del GM è quello di roster_memberships (la stessa pagina /roster).
// GET  → roster della franchigia + upgrade fatti + saldo GC
// POST { action: 'upgrade', playerSlug, attributeKey, fromValue, toValue }
//      → solo upgrade +1, costo dalla funzione DB calculate_upgrade_cost

type Ctx = { userId: string; seasonId: string; franchiseId: string }

async function getContext(): Promise<{ ctx?: Ctx; error?: string; status?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato', status: 401 }

  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('status', 'active')
    .single()
  if (!season) return { error: 'Nessuna stagione attiva', status: 400 }

  const { data: member } = await supabase
    .from('league_members')
    .select('franchise_id')
    .eq('user_id', user.id)
    .eq('season_id', season.id)
    .single()
  if (!member) return { error: 'Non sei assegnato a una franchigia questa stagione', status: 400 }

  return { ctx: { userId: user.id, seasonId: season.id, franchiseId: member.franchise_id } }
}

export async function GET() {
  const { ctx, error, status } = await getContext()
  if (!ctx) return NextResponse.json({ error }, { status })

  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: memberships } = await admin
    .from('roster_memberships')
    .select('player_slug, status')
    .eq('franchise_id', ctx.franchiseId)
    .eq('season_id', ctx.seasonId)
    .neq('status', 'released')

  const slugs = (memberships ?? []).map((m: { player_slug: string }) => m.player_slug)

  const { data: playerRows } = slugs.length
    ? await admin.from('players').select('slug, data').in('slug', slugs)
    : { data: [] as { slug: string; data: Record<string, unknown> }[] }

  const { data: upgrades } = await admin
    .from('gm_shop_upgrades')
    .select('player_slug, attribute_key, old_value, new_value, gc_cost')
    .eq('season_id', ctx.seasonId)
    .eq('user_id', ctx.userId)

  const { data: balance } = await supabase.rpc('get_gc_balance', {
    p_user_id: ctx.userId,
    p_season_id: ctx.seasonId,
  })

  const playerMap = new Map<string, { name: string; overall: number; positions: string[] }>()
  for (const r of (playerRows ?? []) as { slug: string; data: Record<string, unknown> }[]) {
    const d = r.data as { name?: string; overall?: number; positions?: string[] }
    playerMap.set(r.slug, {
      name: d.name ?? r.slug,
      overall: Number(d.overall ?? 0),
      positions: Array.isArray(d.positions) ? d.positions : [],
    })
  }

  const roster = (memberships ?? []).map((m: { player_slug: string; status: string }) => {
    const p = playerMap.get(m.player_slug)
    const playerUpgrades = (upgrades ?? []).filter(
      (u: { player_slug: string }) => u.player_slug === m.player_slug
    )
    return {
      slug: m.player_slug,
      status: m.status,
      name: p?.name ?? m.player_slug,
      overall: p?.overall ?? 0,
      positions: p?.positions ?? [],
      upgrades: playerUpgrades,
      upgradeCount: playerUpgrades.length,
    }
  })

  return NextResponse.json({ roster, balance: balance ?? 0 })
}

export async function POST(req: NextRequest) {
  const { ctx, error, status } = await getContext()
  if (!ctx) return NextResponse.json({ error }, { status })

  const body = await req.json()
  if (body.action !== 'upgrade') {
    return NextResponse.json({ error: 'Azione non valida' }, { status: 400 })
  }

  const { playerSlug, attributeKey, fromValue, toValue } = body
  if (!playerSlug || !attributeKey) {
    return NextResponse.json({ error: 'playerSlug e attributeKey obbligatori' }, { status: 400 })
  }
  if (!Number.isInteger(fromValue) || fromValue < 0 || fromValue > 98) {
    return NextResponse.json({ error: 'Valore di partenza non valido' }, { status: 400 })
  }
  // Regola: solo upgrade +1
  if (toValue !== fromValue + 1) {
    return NextResponse.json({ error: 'Sono consentiti solo upgrade di +1' }, { status: 400 })
  }

  const supabase = await createClient()
  const admin = createAdminClient()

  // Il giocatore deve essere nel roster della franchigia (roster_memberships)
  const { data: roster } = await admin
    .from('roster_memberships')
    .select('id')
    .eq('franchise_id', ctx.franchiseId)
    .eq('season_id', ctx.seasonId)
    .eq('player_slug', playerSlug)
    .neq('status', 'released')
    .maybeSingle()
  if (!roster) return NextResponse.json({ error: 'Giocatore non nel tuo roster' }, { status: 400 })

  const { data: attr } = await admin
    .from('gm_shop_attributes')
    .select('attribute_key')
    .eq('attribute_key', attributeKey)
    .eq('active', true)
    .single()
  if (!attr) return NextResponse.json({ error: 'Attributo non acquistabile' }, { status: 400 })

  const { data: gcCost, error: costErr } = await supabase.rpc('calculate_upgrade_cost', {
    p_attribute_key: attributeKey,
    p_current_value: fromValue,
  })
  if (costErr) return NextResponse.json({ error: costErr.message }, { status: 400 })
  if (!gcCost) return NextResponse.json({ error: 'Impossibile calcolare il costo' }, { status: 400 })

  const { data: balance } = await supabase.rpc('get_gc_balance', {
    p_user_id: ctx.userId,
    p_season_id: ctx.seasonId,
  })
  if ((balance ?? 0) < gcCost) {
    return NextResponse.json({ error: `GC insufficienti: hai ${balance ?? 0} GC, servono ${gcCost} GC` }, { status: 400 })
  }

  const { data: tx, error: txErr } = await admin
    .from('gm_shop_transactions')
    .insert({
      season_id: ctx.seasonId,
      user_id: ctx.userId,
      franchise_id: ctx.franchiseId,
      player_slug: playerSlug,
      attribute_key: attributeKey,
      old_value: fromValue,
      new_value: toValue,
      gc_cost: gcCost,
    })
    .select('id')
    .single()
  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 400 })

  const { error: upErr } = await admin.from('gm_shop_upgrades').insert({
    transaction_id: tx.id,
    season_id: ctx.seasonId,
    user_id: ctx.userId,
    player_slug: playerSlug,
    attribute_key: attributeKey,
    old_value: fromValue,
    new_value: toValue,
    gc_cost: gcCost,
  })
  if (upErr) {
    await admin.from('gm_shop_transactions').delete().eq('id', tx.id)
    if (upErr.message.includes('3/3') || upErr.message.includes('Limite')) {
      return NextResponse.json({ error: 'Limite raggiunto: questo giocatore ha già 3 upgrade questa stagione' }, { status: 400 })
    }
    if (upErr.code === '23505') {
      return NextResponse.json({ error: 'Attributo già potenziato questa stagione' }, { status: 400 })
    }
    return NextResponse.json({ error: upErr.message }, { status: 400 })
  }

  const { error: ledgerErr } = await admin.from('gm_credit_ledger').insert({
    season_id: ctx.seasonId,
    user_id: ctx.userId,
    amount: -gcCost,
    type: 'spent',
    reference_id: tx.id,
    note: `GM Shop: ${attributeKey} su ${playerSlug} (${fromValue}→${toValue})`,
    created_by: ctx.userId,
  })
  if (ledgerErr) {
    await admin.from('gm_shop_upgrades').delete().eq('transaction_id', tx.id)
    await admin.from('gm_shop_transactions').delete().eq('id', tx.id)
    return NextResponse.json({ error: ledgerErr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, gcCost })
}
