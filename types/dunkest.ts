// Types for the DUNKEST GOAT DRAFT feature.
// Completely separate from NBA 2K player data.

export interface DunkestPlayer {
  id: number
  name: string
  team: string
  role: string
  value: number
  imported_at?: string
}

export type GoatDraftStatus = 'setup' | 'active' | 'completed'

export interface GoatDraftSession {
  id: string
  name: string
  status: GoatDraftStatus
  current_round: number
  initial_order: string[]        // participant IDs in draw order
  current_round_order: string[]  // participant IDs for current round
  next_round_order: string[] | null
  current_pick_index: number     // 0-based index into current_round_order
  total_picks: number
  created_by: string
  created_at: string
  updated_at: string
}

export interface GoatDraftParticipant {
  id: string
  session_id: string
  user_id: string
  display_name: string
  initial_position: number
  roster_value: number
  current_round_position: number
  created_at: string
}

export interface GoatDraftPick {
  id: string
  session_id: string
  participant_id: string
  dunkest_player_id: number
  round_number: number
  pick_in_round: number
  global_pick_number: number
  player_value_at_pick: number
  picked_at: string
  // Joined fields
  participant?: GoatDraftParticipant
  dunkest_player?: DunkestPlayer
}

// Full session state returned by the API
export interface GoatDraftState {
  session: GoatDraftSession
  participants: GoatDraftParticipant[]
  picks: GoatDraftPick[]
  currentParticipant: GoatDraftParticipant | null
  nextParticipant: GoatDraftParticipant | null
  // participants sorted by current_round_order
  roundOrder: GoatDraftParticipant[]
  // participants sorted by roster_value ascending (classifica)
  valueRanking: GoatDraftParticipant[]
  // picks remaining in current round
  picksRemainingInRound: number
}
