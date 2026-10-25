import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (data?.role !== 'admin') return null
  return user
}

// GET /api/admin/gm-credits — all GMs' balances for active season
export async function GET() {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const admin = createAdminClient()

  const { data: season } = await admin
    .from('seasons')
    .select('id, name')
    .eq('status', 'active')
    .single()
  if (!season) return NextResponse.json({ error: 'Nessuna stagione attiva' }, { status: 404 })

  const { data: members, error } = await admin
    .from('league_members')
    .select('user_id, franchise_id, franchises(name, abbreviation)')
    .eq('season_id', season.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id)

  const [usersPage, profilesRes] = await Promise.all([
    admin.auth.admin.listUsers(),
    memberIds.length > 0
      ? admin.from('profiles').select('id, display_name').in('id', memberIds)
      : Promise.resolve({ data: [] }),
  ])

  const emailMap: Record<string, string> = {}
  usersPage?.data?.users?.forEach((u: { id: string; email?: string }) => { emailMap[u.id] = u.email ?? '' })

  const displayNameMap: Record<string, string> = {}
  ;(profilesRes.data ?? []).forEach((p: { id: string; display_name: string | null }) => {
    if (p.display_name) displayNameMap[p.id] = p.display_name
  })

  const { data: gamesRows } = await admin
    .from('franchise_season_games')
    .select('franchise_id, games_played')
    .eq('season_id', season.id)
  const gamesByFranchise = new Map((gamesRows ?? []).map((g: { franchise_id: string; games_played: number }) => [g.franchise_id, g.games_played]))

  const rows = await Promise.all(
    (members ?? []).map(async (m: {
      user_id: string
      franchise_id: string
      franchises: { name: string; abbreviation: string } | null
    }) => {
      const { data: bal } = await admin.rpc('get_gc_balance', { p_user_id: m.user_id, p_season_id: season.id })
      return {
        userId: m.user_id,
        displayName: displayNameMap[m.user_id] ?? null,
        email: emailMap[m.user_id] ?? null,
        franchiseName: m.franchises?.name ?? null,
        franchiseAbbr: m.franchises?.abbreviation ?? null,
        gamesPlayed: gamesByFranchise.get(m.franchise_id) ?? 0,
        balance: bal ?? 0,
        seasonId: season.id,
      }
    })
  )

  rows.sort((a, b) => b.balance - a.balance)
  return NextResponse.json({ season: { id: season.id, name: season.name }, rows })
}

// PATCH /api/admin/gm-credits — update games_played or add adjustment
export async function PATCH(req: NextRequest) {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const body = await req.json()
  const { action, targetUserId, seasonId, gamesPlayed, amount, note } = body

  if (!targetUserId || !seasonId) {
    return NextResponse.json({ error: 'targetUserId e seasonId obbligatori' }, { status: 400 })
  }

  const admin = createAdminClient()

  if (action === 'set_games') {
    if (typeof gamesPlayed !== 'number' || gamesPlayed < 0) {
      return NextResponse.json({ error: 'gamesPlayed non valido' }, { status: 400 })
    }

    const { data: member } = await admin
      .from('league_members')
      .select('franchise_id')
      .eq('user_id', targetUserId)
      .eq('season_id', seasonId)
      .single()
    if (!member) return NextResponse.json({ error: 'GM senza franchigia in questa stagione' }, { status: 400 })

    const { error: gamesErr } = await admin
      .from('franchise_season_games')
      .upsert({
        season_id: seasonId,
        franchise_id: member.franchise_id,
        games_played: gamesPlayed,
        updated_at: new Date().toISOString(),
        updated_by: adminUser.id,
      }, { onConflict: 'season_id,franchise_id' })
    if (gamesErr) return NextResponse.json({ error: gamesErr.message }, { status: 500 })

    const { data: gcTotal } = await admin.rpc('franchise_gc_earned', {
      p_franchise_id: member.franchise_id,
      p_season_id: seasonId,
    })

    const { data: existing } = await admin
      .from('gm_credit_ledger')
      .select('amount')
      .eq('user_id', targetUserId)
      .eq('season_id', seasonId)
      .eq('type', 'earned')

    const currentEarned = (existing ?? []).reduce((s: number, r: { amount: number }) => s + r.amount, 0)
    const delta = (gcTotal ?? 0) - currentEarned

    if (delta > 0) {
      const { error: ledgerErr } = await admin
        .from('gm_credit_ledger')
        .insert({
          season_id: seasonId,
          user_id: targetUserId,
          amount: delta,
          type: 'earned',
          note: `Partite giocate aggiornate: ${gamesPlayed}`,
          created_by: adminUser.id,
        })
      if (ledgerErr) return NextResponse.json({ error: ledgerErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, gamesPlayed, gcTotal: gcTotal ?? 0, delta })
  }

  if (action === 'adjustment') {
    if (typeof amount !== 'number' || amount === 0) {
      return NextResponse.json({ error: 'amount non valido' }, { status: 400 })
    }
    if (!note?.trim()) {
      return NextResponse.json({ error: 'La nota è obbligatoria' }, { status: 400 })
    }

    const { error } = await admin
      .from('gm_credit_ledger')
      .insert({
        season_id: seasonId,
        user_id: targetUserId,
        amount,
        type: 'adjustment',
        note: note.trim(),
        created_by: adminUser.id,
      })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'reset_balance') {
    const { data: balance } = await admin.rpc('get_gc_balance', { p_user_id: targetUserId, p_season_id: seasonId })
    const current = balance ?? 0
    if (current === 0) return NextResponse.json({ ok: true, delta: 0 })
    const { error } = await admin.from('gm_credit_ledger').insert({
      season_id: seasonId,
      user_id: targetUserId,
      amount: -current,
      type: 'adjustment',
      note: 'Reset GC a zero (admin)',
      created_by: adminUser.id,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, delta: -current })
  }

  if (action === 'reset_games') {
    const { data: member } = await admin
      .from('league_members')
      .select('franchise_id')
      .eq('user_id', targetUserId)
      .eq('season_id', seasonId)
      .single()
    if (!member) return NextResponse.json({ error: 'GM senza franchigia in questa stagione' }, { status: 400 })
    const { error } = await admin
      .from('franchise_season_games')
      .update({ games_played: 0, updated_at: new Date().toISOString(), updated_by: adminUser.id })
      .eq('franchise_id', member.franchise_id)
      .eq('season_id', seasonId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'action non valida' }, { status: 400 })
}
