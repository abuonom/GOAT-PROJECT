import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Le partite sono inserite dall'admin in franchise_season_games (migrazione 018).
// I GM non le dichiarano più: questa route è solo in lettura.
// POST rimosso: nessun auto-report delle partite da parte del GM.

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

  const { data: member } = await supabase
    .from('league_members')
    .select('franchise_id, franchises(name)')
    .eq('user_id', user.id)
    .eq('season_id', season.id)
    .single()

  if (!member) {
    return NextResponse.json({
      balance: 0,
      gamesPlayed: 0,
      gcEarned: 0,
      ledger: [],
      seasonName: season.name,
      franchiseName: null,
    })
  }

  const [{ data: balance }, { data: ledger }, { data: games }, { data: gcEarned }] = await Promise.all([
    supabase.rpc('get_gc_balance', { p_user_id: user.id, p_season_id: season.id }),
    supabase
      .from('gm_credit_ledger')
      .select('*')
      .eq('user_id', user.id)
      .eq('season_id', season.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('franchise_season_games')
      .select('games_played')
      .eq('franchise_id', member.franchise_id)
      .eq('season_id', season.id)
      .single(),
    supabase.rpc('franchise_gc_earned', {
      p_franchise_id: member.franchise_id,
      p_season_id: season.id,
    }),
  ])

  return NextResponse.json({
    balance: balance ?? 0,
    gamesPlayed: games?.games_played ?? 0,
    gcEarned: gcEarned ?? 0,
    ledger: ledger ?? [],
    seasonName: season.name,
    franchiseName: (member.franchises as unknown as { name: string } | null)?.name ?? null,
  })
}
