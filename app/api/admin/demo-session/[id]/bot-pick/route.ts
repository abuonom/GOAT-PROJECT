import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { makePick } from '@/lib/dunkest/draft'
import { ROLE_LIMITS } from '@/types/dunkest'

// POST /api/admin/demo-session/[id]/bot-pick
// Admin triggers an auto-pick for the current bot participant.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Solo gli admin' }, { status: 403 })

  const adminSupabase = createAdminClient()

  // Validate session is demo and active
  const { data: session } = await adminSupabase
    .from('goat_draft_sessions').select('*').eq('id', sessionId).single()
  if (!session) return NextResponse.json({ error: 'Sessione non trovata' }, { status: 404 })
  if (!session.is_demo) return NextResponse.json({ error: 'Non è una sessione demo' }, { status: 400 })
  if (session.status !== 'active') return NextResponse.json({ error: 'La sessione non è attiva' }, { status: 400 })

  const currentParticipantId: string = session.current_round_order[session.current_pick_index]
  if (!currentParticipantId) return NextResponse.json({ error: 'Turno non valido' }, { status: 400 })

  // Must be a bot's turn (not the admin's turn)
  const { data: participant } = await adminSupabase
    .from('goat_draft_participants').select('*').eq('id', currentParticipantId).single()
  if (!participant) return NextResponse.json({ error: 'Partecipante non trovato' }, { status: 404 })
  if (participant.user_id === user.id) {
    return NextResponse.json({ error: 'È il tuo turno, non quello di un bot' }, { status: 400 })
  }

  // Get already-picked IDs in this session
  const { data: sessionPicks } = await adminSupabase
    .from('goat_draft_picks').select('dunkest_player_id').eq('session_id', sessionId)
  const pickedIds = (sessionPicks ?? []).map((p: { dunkest_player_id: number }) => p.dunkest_player_id)

  // Get bot's picks per role to respect slot limits
  const { data: botPicks } = await adminSupabase
    .from('goat_draft_picks')
    .select('dunkest_player:dunkest_players(role)')
    .eq('session_id', sessionId)
    .eq('participant_id', currentParticipantId)

  const roleCounts: Record<string, number> = {}
  for (const p of botPicks ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const role = (p.dunkest_player as any)?.role as string | undefined
    if (role) roleCounts[role] = (roleCounts[role] ?? 0) + 1
  }
  const fullRoles = Object.entries(ROLE_LIMITS)
    .filter(([role, limit]) => (roleCounts[role] ?? 0) >= limit)
    .map(([role]) => role)

  // Pick the highest-value available player in an open slot
  let query = adminSupabase
    .from('dunkest_players')
    .select('id, name, value, role')
    .order('value', { ascending: false })
    .limit(1)

  if (pickedIds.length > 0) query = query.not('id', 'in', `(${pickedIds.join(',')})`)
  if (fullRoles.length > 0) query = query.not('role', 'in', `(${fullRoles.join(',')})`)

  const { data: player } = await query.single()
  if (!player) return NextResponse.json({ error: 'Nessun giocatore disponibile' }, { status: 400 })

  const result = await makePick(sessionId, currentParticipantId, player.id, user.id, { skipUserCheck: true })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.json({ success: true, player, roundAdvanced: result.roundAdvanced ?? false })
}
