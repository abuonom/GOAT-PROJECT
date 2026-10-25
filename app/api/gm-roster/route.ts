import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// GET /api/gm-roster → roster stagionale del GM con upgrade e saldo GC
// POST /api/gm-roster { action: 'add-list' | 'add-manual' | 'remove' | 'upgrade', ... }
// Il valore dichiarato dal GM è validato qui: solo upgrade +1, costo dalla funzione DB.

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

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function GET() {
  const { ctx, error, status } = await getContext()
  if (!ctx) return NextResponse.json({ error }, { status })

  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: entries } = await admin
    .from('gm_season_roster')
    .select('player_slug, origin')
    .eq('season_id', ctx.seasonId)
    .eq('user_id', ctx.userId)
    .is('removed_at', null)

  const slugs = (entries ?? []).map((e: { player_slug: string }) => e.player_slug)

  const { data: listRows } = slugs.length
    ? await admin.from('players').select('slug, data').in('slug', slugs)
    : { data: [] as { slug: string; data: Record<string, unknown> }[] }

  const { data: manualRows } = slugs.length
    ? await admin.from('gm_manual_players').select('slug, name, overall, positions, is_rookie').in('slug', slugs)
    : { data: [] as { slug: string; name: string; overall: number; positions: string[]; is_rookie: boolean }[] }

  const { data: upgrades } = await admin
    .from('gm_shop_upgrades')
    .select('player_slug, attribute_key, old_value, new_value, gc_cost')
    .eq('season_id', ctx.seasonId)
    .eq('user_id', ctx.userId)

  const { data: balance } = await supabase.rpc('get_gc_balance', {
    p_user_id: ctx.userId,
    p_season_id: ctx.seasonId,
  })

  const listMap = new Map<string, { name: string; overall: number; positions: string[] }>()
  for (const r of (listRows ?? []) as { slug: string; data: Record<string, unknown> }[]) {
    const d = r.data as { name?: string; overall?: number; positions?: string[] }
    listMap.set(r.slug, { name: d.name ?? r.slug, overall: Number(d.overall ?? 0), positions: d.positions ?? [] })
  }
  const manualMap = new Map<string, { name: string; overall: number; positions: string[]; isRookie: boolean }>()
  for (const m of manualRows ?? []) {
    manualMap.set(m.slug, { name: m.name, overall: m.overall, positions: m.positions, isRookie: m.is_rookie })
  }

  const roster = (entries ?? []).map((e: { player_slug: string; origin: string }) => {
    const base = listMap.get(e.player_slug) ?? manualMap.get(e.player_slug)
    const playerUpgrades = (upgrades ?? []).filter(
      (u: { player_slug: string }) => u.player_slug === e.player_slug
    )
    return {
      slug: e.player_slug,
      origin: e.origin,
      name: base?.name ?? e.player_slug,
      overall: base?.overall ?? 0,
      positions: base?.positions ?? [],
      isRookie: manualMap.get(e.player_slug)?.isRookie ?? false,
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
  const admin = createAdminClient()

  if (body.action === 'add-list') {
    const { playerSlug } = body
    if (!playerSlug) return NextResponse.json({ error: 'playerSlug obbligatorio' }, { status: 400 })

    const { data: player } = await admin.from('players').select('slug').eq('slug', playerSlug).single()
    if (!player) return NextResponse.json({ error: 'Giocatore non trovato nella lista' }, { status: 404 })

    const { error: insErr } = await admin.from('gm_season_roster').insert({
      season_id: ctx.seasonId,
      user_id: ctx.userId,
      franchise_id: ctx.franchiseId,
      player_slug: playerSlug,
      origin: 'list',
      added_by: ctx.userId,
    })
    if (insErr) {
      if (insErr.code === '23505') return NextResponse.json({ error: 'Giocatore già preso da un GM questa stagione' }, { status: 400 })
      return NextResponse.json({ error: insErr.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'add-manual') {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const overall = Number(body.overall)
    const positions: string[] = Array.isArray(body.positions) ? body.positions : []
    const isRookie = body.isRookie === true

    if (!name) return NextResponse.json({ error: 'Nome obbligatorio' }, { status: 400 })
    if (!Number.isInteger(overall) || overall < 40 || overall > 99) {
      return NextResponse.json({ error: 'Overall non valido (40–99)' }, { status: 400 })
    }

    // Slug con prefisso "manual-" per non collidere con i giocatori della lista
    const slug = `manual-${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`

    const { error: manErr } = await admin.from('gm_manual_players').insert({
      season_id: ctx.seasonId,
      slug,
      name,
      overall,
      positions,
      is_rookie: isRookie,
      added_by: ctx.userId,
    })
    if (manErr) return NextResponse.json({ error: manErr.message }, { status: 400 })

    const { error: rosterErr } = await admin.from('gm_season_roster').insert({
      season_id: ctx.seasonId,
      user_id: ctx.userId,
      franchise_id: ctx.franchiseId,
      player_slug: slug,
      origin: 'manual',
      added_by: ctx.userId,
    })
    if (rosterErr) {
      await admin.from('gm_manual_players').delete().eq('slug', slug).eq('season_id', ctx.seasonId)
      return NextResponse.json({ error: rosterErr.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true, slug })
  }

  if (body.action === 'remove') {
    const { playerSlug } = body
    if (!playerSlug) return NextResponse.json({ error: 'playerSlug obbligatorio' }, { status: 400 })

    // Lo storico upgrade resta: non si rimuove un giocatore che ha già upgrade
    const { count } = await admin
      .from('gm_shop_upgrades')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', ctx.seasonId)
      .eq('user_id', ctx.userId)
      .eq('player_slug', playerSlug)
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: 'Non puoi rimuovere un giocatore con upgrade già acquistati' }, { status: 400 })
    }

    const { error: delErr } = await admin
      .from('gm_season_roster')
      .update({ removed_at: new Date().toISOString() })
      .eq('season_id', ctx.seasonId)
      .eq('user_id', ctx.userId)
      .eq('player_slug', playerSlug)
      .is('removed_at', null)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'upgrade') {
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

    const { data: entry } = await admin
      .from('gm_season_roster')
      .select('id')
      .eq('season_id', ctx.seasonId)
      .eq('user_id', ctx.userId)
      .eq('player_slug', playerSlug)
      .is('removed_at', null)
      .single()
    if (!entry) return NextResponse.json({ error: 'Giocatore non nel tuo roster' }, { status: 400 })

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

  return NextResponse.json({ error: 'Azione non valida' }, { status: 400 })
}
