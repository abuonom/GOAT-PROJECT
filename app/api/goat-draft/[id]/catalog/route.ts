import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getDunkestPlayers } from '@/lib/dunkest/catalog'

// GET /api/goat-draft/[id]/catalog — available players for this session
// Query params: search, role, team
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') ?? undefined
  const role = searchParams.get('role') ?? undefined
  const team = searchParams.get('team') ?? undefined

  // Get already-picked player IDs for this session
  const { data: picks } = await supabase
    .from('goat_draft_picks')
    .select('dunkest_player_id')
    .eq('session_id', sessionId)

  const pickedIds = (picks ?? []).map(p => p.dunkest_player_id as number)

  const players = await getDunkestPlayers({ search, role, team, excludeIds: pickedIds })
  return NextResponse.json({ players })
}
