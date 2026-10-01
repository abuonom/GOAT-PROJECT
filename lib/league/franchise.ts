'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { Franchise } from '@/types/league'

export async function getAvailableFranchises(): Promise<{ franchises: Franchise[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { franchises: [], error: 'Non autenticato' }

  const { data: season } = await supabase
    .from('seasons').select('id').eq('status', 'active').single()
  if (!season) return { franchises: [], error: 'Nessuna stagione attiva' }

  // All franchises in the active league
  const { data: allFranchises } = await supabase
    .from('franchises').select('*').order('sort_order')

  // Franchises already claimed this season
  const { data: taken } = await supabase
    .from('league_members').select('franchise_id').eq('season_id', season.id)

  const takenIds = new Set((taken ?? []).map(m => m.franchise_id))
  const available = (allFranchises ?? []).filter(f => !takenIds.has(f.id))

  return { franchises: available as Franchise[] }
}

export async function claimFranchise(franchiseId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: season } = await supabase
    .from('seasons').select('id, league_id').eq('status', 'active').single()
  if (!season) return { error: 'Nessuna stagione attiva' }

  // Check user doesn't already have a franchise this season
  const { data: existing } = await supabase
    .from('league_members')
    .select('id').eq('user_id', user.id).eq('season_id', season.id).single()
  if (existing) return { error: 'Hai già una franchigia assegnata questa stagione' }

  // Check franchise belongs to the same league and isn't taken
  const admin = createAdminClient()

  const { data: franchise } = await admin
    .from('franchises').select('id, league_id').eq('id', franchiseId).single()
  if (!franchise) return { error: 'Franchigia non trovata' }
  if (franchise.league_id !== season.league_id) return { error: 'Franchigia non appartenente a questa lega' }

  const { data: alreadyTaken } = await admin
    .from('league_members')
    .select('id').eq('season_id', season.id).eq('franchise_id', franchiseId).single()
  if (alreadyTaken) return { error: 'Questa franchigia è già stata scelta da un altro GM' }

  const { error } = await admin.from('league_members').insert({
    league_id: season.league_id,
    season_id: season.id,
    user_id: user.id,
    franchise_id: franchiseId,
    games_played: 0,
  })

  if (error) {
    if (error.code === '23505') return { error: 'Questa franchigia è già stata scelta da un altro GM' }
    return { error: error.message }
  }
  return {}
}
