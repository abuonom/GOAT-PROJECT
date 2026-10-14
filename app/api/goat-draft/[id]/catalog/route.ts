import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getDunkestPlayers } from '@/lib/dunkest/catalog'
import { ROLE_LIMITS } from '@/types/dunkest'
import type { RosterSlots } from '@/types/dunkest'

// GET /api/goat-draft/[id]/catalog — available players for this session
// Query params: search, role, team
// Response includes myRosterSlots: remaining slots per role for the current user's participant
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

  // Compute remaining roster slots for the current user's participant
  let myRosterSlots: RosterSlots | null = null
  const { data: myParticipant } = await supabase
    .from('goat_draft_participants')
    .select('id')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .single()

  if (myParticipant) {
    const { data: myPicks } = await supabase
      .from('goat_draft_picks')
      .select('dunkest_player:dunkest_players(role)')
      .eq('session_id', sessionId)
      .eq('participant_id', myParticipant.id)

    const roleCounts: Record<string, number> = {}
    for (const pick of myPicks ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = (pick.dunkest_player as any)?.role as string | undefined
      if (r) roleCounts[r] = (roleCounts[r] ?? 0) + 1
    }
    myRosterSlots = Object.fromEntries(
      Object.entries(ROLE_LIMITS).map(([r, limit]) => [r, limit - (roleCounts[r] ?? 0)]),
    )
  }

  const players = await getDunkestPlayers({ search, role, team, excludeIds: pickedIds })
  return NextResponse.json({ players, myRosterSlots })
}
