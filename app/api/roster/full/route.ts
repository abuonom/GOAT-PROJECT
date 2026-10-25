import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/roster/full
// Roster del GM con i dati dei giocatori in una sola risposta.
// Passaggi ridotti: 1) stagione + franchigia del GM in una query (join),
// 2) roster e dati giocatori (il secondo dipende dal primo, ma è un'unica chiamata al DB).

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 })

  // Una sola query: franchigia del GM nella stagione attiva
  const { data: member } = await supabase
    .from('league_members')
    .select('franchise_id, seasons!inner(id, status)')
    .eq('user_id', user.id)
    .eq('seasons.status', 'active')
    .maybeSingle()
  if (!member) return NextResponse.json({ success: true, memberships: [], players: {} })

  const seasonId = (member.seasons as unknown as { id: string }).id

  const { data: memberships } = await supabase
    .from('roster_memberships')
    .select('id, season_id, franchise_id, player_slug, status, acquired_at')
    .eq('franchise_id', member.franchise_id)
    .eq('season_id', seasonId)
    .neq('status', 'released')
    .order('acquired_at', { ascending: true })

  const slugs = (memberships ?? []).map(m => m.player_slug)
  const players: Record<string, unknown> = {}
  if (slugs.length > 0) {
    const admin = createAdminClient()
    const { data: rows } = await admin.from('players').select('slug, data').in('slug', slugs)
    for (const r of rows ?? []) players[r.slug] = r.data
  }

  return NextResponse.json({ success: true, memberships: memberships ?? [], players })
}
