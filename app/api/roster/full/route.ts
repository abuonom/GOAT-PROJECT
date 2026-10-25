import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getCachedRoster } from '@/lib/league/roster-cache'

// GET /api/roster/full
// Roster del GM con i dati dei giocatori. La verifica di sessione è qui (fuori dalla cache);
// i dati vengono dalla cache per utente, invalidata quando il roster cambia.

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 })

  const rows = await getCachedRoster(user.id)

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
