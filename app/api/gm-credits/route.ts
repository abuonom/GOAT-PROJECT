import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/gm-credits — GM self-reports games played
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { gamesPlayed } = await req.json()
  if (typeof gamesPlayed !== 'number' || gamesPlayed < 0 || gamesPlayed > 82) {
    return NextResponse.json({ error: 'Valore non valido (0–82)' }, { status: 400 })
  }

  const { data: season } = await supabase
    .from('seasons').select('id').eq('status', 'active').single()
  if (!season) return NextResponse.json({ error: 'Nessuna stagione attiva' }, { status: 404 })

  const admin = createAdminClient()

  // Get current games_played — can only increase
  const { data: member } = await admin
    .from('league_members')
    .select('id, games_played')
    .eq('user_id', user.id)
    .eq('season_id', season.id)
    .single()

  if (!member) return NextResponse.json({ error: 'Non sei assegnato a una franchigia questa stagione' }, { status: 403 })

  if (gamesPlayed < member.games_played) {
    return NextResponse.json({ error: `Non puoi ridurre le partite (attuale: ${member.games_played})` }, { status: 400 })
  }

  // Calculate GC delta
  const { data: newGcTotal } = await admin
    .rpc('calculate_gc_earned', { p_games_played: gamesPlayed })

  const { data: existing } = await admin
    .from('gm_credit_ledger')
    .select('amount')
    .eq('user_id', user.id)
    .eq('season_id', season.id)
    .eq('type', 'earned')

  const currentEarned = (existing ?? []).reduce((s: number, r: { amount: number }) => s + r.amount, 0)
  const delta = (newGcTotal ?? 0) - currentEarned

  // Update games_played
  await admin.from('league_members')
    .update({ games_played: gamesPlayed })
    .eq('id', member.id)

  // Insert GC delta if positive
  if (delta > 0) {
    await admin.from('gm_credit_ledger').insert({
      season_id: season.id,
      user_id: user.id,
      amount: delta,
      type: 'earned',
      note: `Partite giocate: ${gamesPlayed}`,
      created_by: user.id,
    })
  }

  return NextResponse.json({ ok: true, gamesPlayed, gcEarned: newGcTotal ?? 0, delta })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('status', 'active')
    .single()

  if (!season) return NextResponse.json({ error: 'Nessuna stagione attiva' }, { status: 404 })

  const [{ data: balance }, { data: ledger }, { data: member }] = await Promise.all([
    supabase.rpc('get_gc_balance', { p_user_id: user.id, p_season_id: season.id }),
    supabase
      .from('gm_credit_ledger')
      .select('*')
      .eq('user_id', user.id)
      .eq('season_id', season.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('league_members')
      .select('games_played, franchises(name)')
      .eq('user_id', user.id)
      .eq('season_id', season.id)
      .single(),
  ])

  return NextResponse.json({
    balance: balance ?? 0,
    gamesPlayed: member?.games_played ?? 0,
    ledger: ledger ?? [],
    seasonName: season.name,
    franchiseName: (member?.franchises as unknown as { name: string } | null)?.name ?? null,
  })
}
