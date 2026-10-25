import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/roster/full
// Roster del GM con i dati dei giocatori in una sola chiamata al database (RPC roster_full_for_me).
// Prima: 4 round trip verso Supabase. Ora: 2 (utente + funzione).

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 })

  const { data, error } = await supabase.rpc('roster_full_for_me')
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const rows = (data ?? []) as {
    player_slug: string; status: string; acquired_at: string; franchise_id: string; season_id: string; data: unknown
  }[]

  const memberships = rows.map(r => ({
    player_slug: r.player_slug,
    status: r.status,
    acquired_at: r.acquired_at,
    franchise_id: r.franchise_id,
    season_id: r.season_id,
  }))
  const players: Record<string, unknown> = {}
  for (const r of rows) if (r.data) players[r.player_slug] = r.data

  return NextResponse.json({ success: true, memberships, players })
}
