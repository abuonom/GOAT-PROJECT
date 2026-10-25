import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/roster/full
// Roster del GM con i dati dei giocatori in una sola risposta (prima: 1 + 15 richieste).
// Restituisce le stesse appartenenze di /api/roster?type=mine, con il campo `player` già popolato.

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 })

  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (!season) return NextResponse.json({ success: true, memberships: [], players: {} })

  const { data: member } = await supabase
    .from('league_members')
    .select('franchise_id')
    .eq('user_id', user.id)
    .eq('season_id', season.id)
    .single()
  if (!member) return NextResponse.json({ success: true, memberships: [], players: {} })

  const { data: memberships } = await supabase
    .from('roster_memberships')
    .select('*')
    .eq('franchise_id', member.franchise_id)
    .eq('season_id', season.id)
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
