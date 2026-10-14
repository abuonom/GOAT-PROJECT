import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { GoatDraftParticipant, GoatDraftPick, GoatDraftSession, GoatDraftState } from '@/types/dunkest'

// ─── Read helpers ─────────────────────────────────────────────────────────────

export async function getSessionState(sessionId: string): Promise<GoatDraftState | null> {
  const supabase = await createClient()

  const [sessionRes, participantsRes, picksRes] = await Promise.all([
    supabase.from('goat_draft_sessions').select('*').eq('id', sessionId).single(),
    supabase.from('goat_draft_participants').select('*').eq('session_id', sessionId).order('initial_position'),
    supabase
      .from('goat_draft_picks')
      .select('*, dunkest_player:dunkest_players(*)')
      .eq('session_id', sessionId)
      .order('global_pick_number'),
  ])

  if (sessionRes.error || !sessionRes.data) return null

  const session: GoatDraftSession = sessionRes.data
  const participants: GoatDraftParticipant[] = participantsRes.data ?? []
  const picks = (picksRes.data ?? []) as GoatDraftPick[]

  return buildState(session, participants, picks)
}

function buildState(
  session: GoatDraftSession,
  participants: GoatDraftParticipant[],
  picks: GoatDraftPick[],
): GoatDraftState {
  const participantMap = new Map(participants.map(p => [p.id, p]))

  const roundOrder: GoatDraftParticipant[] = session.current_round_order
    .map(id => participantMap.get(id))
    .filter(Boolean) as GoatDraftParticipant[]

  const currentParticipant = roundOrder[session.current_pick_index] ?? null
  const nextParticipant = roundOrder[session.current_pick_index + 1] ?? null

  const valueRanking = [...participants].sort((a, b) => {
    if (a.roster_value !== b.roster_value) return a.roster_value - b.roster_value
    // Tiebreak: maintain relative order from current round
    const ai = session.current_round_order.indexOf(a.id)
    const bi = session.current_round_order.indexOf(b.id)
    return ai - bi
  })

  const picksThisRound = picks.filter(p => p.round_number === session.current_round).length
  const picksRemainingInRound = 8 - picksThisRound

  return {
    session,
    participants,
    picks,
    currentParticipant,
    nextParticipant,
    roundOrder,
    valueRanking,
    picksRemainingInRound,
  }
}

// ─── calculateRosterValue ─────────────────────────────────────────────────────

export async function calculateRosterValue(
  participantId: string,
  sessionId: string,
): Promise<number> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('goat_draft_picks')
    .select('player_value_at_pick')
    .eq('participant_id', participantId)
    .eq('session_id', sessionId)

  if (error) throw new Error(`calculateRosterValue: ${error.message}`)
  if (!data || data.length === 0) return 0

  return data.reduce((sum, row) => sum + Number(row.player_value_at_pick), 0)
}

// ─── calculateNextRoundOrder ──────────────────────────────────────────────────

export function calculateNextRoundOrder(
  participants: GoatDraftParticipant[],
  currentRoundOrder: string[],
): string[] {
  // Sort by roster_value ascending, break ties by position in current round order
  const sorted = [...participants].sort((a, b) => {
    if (a.roster_value !== b.roster_value) return a.roster_value - b.roster_value
    // Deterministic tiebreak: maintain relative order from the round that just finished
    const ai = currentRoundOrder.indexOf(a.id)
    const bi = currentRoundOrder.indexOf(b.id)
    return ai - bi
  })
  return sorted.map(p => p.id)
}

// ─── makePick (atomic) ────────────────────────────────────────────────────────

export interface MakePickResult {
  error?: string
  roundAdvanced?: boolean
}

export async function makePick(
  sessionId: string,
  participantId: string,
  dunkestPlayerId: number,
  actingUserId: string,
): Promise<MakePickResult> {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()

  // 1. Load session + participant under advisory lock simulation via SELECT FOR UPDATE.
  //    Supabase JS doesn't support FOR UPDATE directly, so we use optimistic concurrency
  //    with the unique constraints in the DB as the final guard.

  const { data: session, error: sErr } = await supabase
    .from('goat_draft_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (sErr || !session) return { error: 'Sessione non trovata' }
  if (session.status !== 'active') return { error: 'La sessione non è attiva' }

  // 2. Verify it's this participant's turn
  const currentParticipantId = session.current_round_order[session.current_pick_index]
  if (!currentParticipantId) return { error: 'Turno non valido' }
  if (currentParticipantId !== participantId) return { error: 'Non è il tuo turno' }

  // 3. Verify the participant belongs to this user
  const { data: participant, error: pErr } = await supabase
    .from('goat_draft_participants')
    .select('*')
    .eq('id', participantId)
    .eq('session_id', sessionId)
    .single()

  if (pErr || !participant) return { error: 'Partecipante non trovato' }
  if (participant.user_id !== actingUserId) return { error: 'Accesso non autorizzato' }

  // 4. Verify the player exists in the Dunkest catalog
  const { data: player, error: plErr } = await supabase
    .from('dunkest_players')
    .select('id, value')
    .eq('id', dunkestPlayerId)
    .single()

  if (plErr || !player) return { error: 'Giocatore non trovato nel catalogo Dunkest' }

  // 5. Compute pick metadata
  const globalPickNumber = session.total_picks + 1
  const pickInRound = session.current_pick_index + 1

  // 6. Insert pick — unique constraints (session+player, session+participant+round) act as DB guard
  const { error: insertErr } = await adminSupabase
    .from('goat_draft_picks')
    .insert({
      session_id: sessionId,
      participant_id: participantId,
      dunkest_player_id: dunkestPlayerId,
      round_number: session.current_round,
      pick_in_round: pickInRound,
      global_pick_number: globalPickNumber,
      player_value_at_pick: player.value,
    })

  if (insertErr) {
    if (insertErr.code === '23505') {
      // Unique violation: player already picked or participant already picked this round
      return { error: 'Giocatore già selezionato o turno già effettuato' }
    }
    return { error: `Errore inserimento pick: ${insertErr.message}` }
  }

  // 7. Update participant roster value
  const newRosterValue = participant.roster_value + Number(player.value)
  await adminSupabase
    .from('goat_draft_participants')
    .update({ roster_value: newRosterValue })
    .eq('id', participantId)

  // 8. Advance session state
  const isLastPickOfRound = session.current_pick_index >= 7
  let roundAdvanced = false

  if (isLastPickOfRound) {
    roundAdvanced = true
    await advanceToNextRound(session, adminSupabase)
  } else {
    // Just advance the pick index
    await adminSupabase
      .from('goat_draft_sessions')
      .update({
        current_pick_index: session.current_pick_index + 1,
        total_picks: globalPickNumber,
      })
      .eq('id', sessionId)
  }

  return { roundAdvanced }
}

// ─── advanceToNextRound ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function advanceToNextRound(session: GoatDraftSession, supabase: any) {
  // Re-fetch all participants with updated roster values
  const { data: participants } = await supabase
    .from('goat_draft_participants')
    .select('*')
    .eq('session_id', session.id)

  if (!participants) return

  const nextOrder = calculateNextRoundOrder(participants, session.current_round_order)

  // Update each participant's current_round_position
  for (let i = 0; i < nextOrder.length; i++) {
    await supabase
      .from('goat_draft_participants')
      .update({ current_round_position: i + 1 })
      .eq('id', nextOrder[i])
  }

  await supabase
    .from('goat_draft_sessions')
    .update({
      current_round: session.current_round + 1,
      current_round_order: nextOrder,
      next_round_order: null,
      current_pick_index: 0,
      total_picks: session.total_picks + 1,
    })
    .eq('id', session.id)
}

// ─── createSession ────────────────────────────────────────────────────────────

export interface CreateSessionInput {
  name: string
  participantUserIds: string[]
  participantDisplayNames: Record<string, string>
  createdBy: string
}

export async function createSession(input: CreateSessionInput): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()

  if (input.participantUserIds.length !== 8) {
    return { error: 'Servono esattamente 8 partecipanti' }
  }
  if (new Set(input.participantUserIds).size !== 8) {
    return { error: 'I partecipanti devono essere distinti' }
  }

  // Create session (setup state, no order yet)
  const { data: session, error: sErr } = await supabase
    .from('goat_draft_sessions')
    .insert({ name: input.name, created_by: input.createdBy })
    .select('id')
    .single()

  if (sErr || !session) return { error: `Errore creazione sessione: ${sErr?.message}` }

  // Insert participants in a random shuffled order
  const shuffled = shuffleArray([...input.participantUserIds])
  const participantInserts = shuffled.map((userId, idx) => ({
    session_id: session.id,
    user_id: userId,
    display_name: input.participantDisplayNames[userId] ?? userId,
    initial_position: idx + 1,
    current_round_position: idx + 1,
  }))

  const { data: participants, error: pErr } = await supabase
    .from('goat_draft_participants')
    .insert(participantInserts)
    .select('id, initial_position')

  if (pErr || !participants) {
    return { error: `Errore inserimento partecipanti: ${pErr?.message}` }
  }

  // Build initial order array (sorted by initial_position)
  const ordered = [...participants].sort((a, b) => a.initial_position - b.initial_position)
  const initialOrder = ordered.map(p => p.id)

  // Update session with the order
  await supabase
    .from('goat_draft_sessions')
    .update({ initial_order: initialOrder, current_round_order: initialOrder })
    .eq('id', session.id)

  return { id: session.id }
}

export async function startSession(sessionId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('goat_draft_sessions')
    .update({ status: 'active' })
    .eq('id', sessionId)
    .eq('status', 'setup')
  if (error) return { error: error.message }
  return {}
}

// Fisher-Yates shuffle
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
