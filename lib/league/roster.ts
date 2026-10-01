'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { RosterMembership } from '@/types/league'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return { supabase, user, role: profile?.role ?? 'gm' }
}

async function getActiveSeason(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from('seasons')
    .select('id, name, status')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return data
}

async function getMyFranchise(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, seasonId: string) {
  const { data } = await supabase
    .from('league_members')
    .select('franchise_id, franchises(id, name, abbreviation)')
    .eq('user_id', userId)
    .eq('season_id', seasonId)
    .single()
  return data
}

// ── Read actions ──────────────────────────────────────────────────────────────

export async function getMyRoster(): Promise<{
  memberships: RosterMembership[]
  franchiseName: string | null
  seasonName: string | null
  isConfirmed: boolean
  error?: string
}> {
  try {
    const { supabase, user } = await getAuthContext()
    const season = await getActiveSeason(supabase)
    if (!season) return { memberships: [], franchiseName: null, seasonName: null, isConfirmed: false, error: 'Nessuna stagione attiva' }

    const member = await getMyFranchise(supabase, user.id, season.id)
    if (!member) return { memberships: [], franchiseName: null, seasonName: season.name, isConfirmed: false }

    const { data: memberships } = await supabase
      .from('roster_memberships')
      .select('*')
      .eq('franchise_id', member.franchise_id)
      .eq('season_id', season.id)
      .neq('status', 'released')
      .order('acquired_at', { ascending: true })

    const franchise = member.franchises as unknown as { name: string } | null
    const isConfirmed = (memberships ?? []).length > 0 && (memberships ?? []).every(m => m.status === 'confirmed')

    return {
      memberships: (memberships ?? []) as RosterMembership[],
      franchiseName: franchise?.name ?? null,
      seasonName: season.name,
      isConfirmed,
    }
  } catch (e) {
    return { memberships: [], franchiseName: null, seasonName: null, isConfirmed: false, error: String(e) }
  }
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function addPlayerToRoster(playerSlug: string): Promise<{ error?: string }> {
  try {
    const { supabase, user } = await getAuthContext()
    const season = await getActiveSeason(supabase)
    if (!season) return { error: 'Nessuna stagione attiva' }

    const member = await getMyFranchise(supabase, user.id, season.id)
    if (!member) return { error: 'Non sei assegnato a nessuna franchigia in questa stagione' }

    // Check player not already in another active roster
    const { data: existing } = await supabase
      .from('roster_memberships')
      .select('id, franchise_id, status')
      .eq('season_id', season.id)
      .eq('player_slug', playerSlug)
      .neq('status', 'released')
      .maybeSingle()

    if (existing) {
      if (existing.franchise_id === member.franchise_id) return { error: 'Questo giocatore è già nel tuo roster' }
      return { error: 'Questo giocatore è già stato selezionato da un\'altra franchigia' }
    }

    // Check max 15 players
    const { count } = await supabase
      .from('roster_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('franchise_id', member.franchise_id)
      .eq('season_id', season.id)
      .neq('status', 'released')

    if ((count ?? 0) >= 15) return { error: 'Roster pieno: massimo 15 giocatori' }

    const { error } = await supabase
      .from('roster_memberships')
      .insert({
        season_id: season.id,
        franchise_id: member.franchise_id,
        player_slug: playerSlug,
        status: 'selected',
        created_by: user.id,
      })

    if (error) {
      if (error.code === '23505') return { error: 'Questo giocatore è già stato selezionato' }
      if (error.message.includes('Roster full')) return { error: 'Roster pieno: massimo 15 giocatori' }
      return { error: error.message }
    }

    return {}
  } catch (e) {
    return { error: String(e) }
  }
}

export async function removePlayerFromRoster(playerSlug: string): Promise<{ error?: string }> {
  try {
    const { supabase, user } = await getAuthContext()
    const season = await getActiveSeason(supabase)
    if (!season) return { error: 'Nessuna stagione attiva' }

    const member = await getMyFranchise(supabase, user.id, season.id)
    if (!member) return { error: 'Non sei assegnato a nessuna franchigia' }

    // Can't release confirmed players
    const { data: membership } = await supabase
      .from('roster_memberships')
      .select('id, status')
      .eq('franchise_id', member.franchise_id)
      .eq('season_id', season.id)
      .eq('player_slug', playerSlug)
      .neq('status', 'released')
      .single()

    if (!membership) return { error: 'Giocatore non trovato nel tuo roster' }

    const { error } = await supabase
      .from('roster_memberships')
      .update({ status: 'released', released_at: new Date().toISOString() })
      .eq('id', membership.id)

    if (error) return { error: error.message }
    return {}
  } catch (e) {
    return { error: String(e) }
  }
}

export async function confirmRoster(): Promise<{ error?: string; count?: number }> {
  try {
    const { supabase, user } = await getAuthContext()
    const season = await getActiveSeason(supabase)
    if (!season) return { error: 'Nessuna stagione attiva' }

    const member = await getMyFranchise(supabase, user.id, season.id)
    if (!member) return { error: 'Non sei assegnato a nessuna franchigia' }

    const { data: selected, error: fetchErr } = await supabase
      .from('roster_memberships')
      .select('id')
      .eq('franchise_id', member.franchise_id)
      .eq('season_id', season.id)
      .eq('status', 'selected')

    if (fetchErr) return { error: fetchErr.message }
    if (!selected || selected.length === 0) return { error: 'Nessun giocatore selezionato da confermare' }
    if (selected.length < 14) return { error: `Servono almeno 14 giocatori per confermare il roster (hai ${selected.length})` }

    const ids = selected.map(m => m.id)

    const { error } = await supabase
      .from('roster_memberships')
      .update({ status: 'confirmed' })
      .in('id', ids)

    if (error) return { error: error.message }

    // Audit log via admin client (RLS: only service_role can insert audit_log)
    const admin = createAdminClient()
    await admin.from('audit_log').insert({
      event_type: 'roster_confirmed',
      actor_id: user.id,
      subject_id: user.id,
      season_id: season.id,
      franchise_id: member.franchise_id,
      new_value: { player_count: ids.length },
    })

    return { count: ids.length }
  } catch (e) {
    return { error: String(e) }
  }
}
