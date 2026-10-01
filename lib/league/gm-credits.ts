'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { GmCreditLedgerEntry } from '@/types/league'

export interface GmCreditsData {
  balance: number
  gamesPlayed: number
  ledger: GmCreditLedgerEntry[]
  seasonName: string | null
  franchiseName: string | null
  error?: string
}

export async function getMyGmCredits(): Promise<GmCreditsData> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { balance: 0, gamesPlayed: 0, ledger: [], seasonName: null, franchiseName: null, error: 'Non autenticato' }

  // Active season
  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('status', 'active')
    .single()

  if (!season) return { balance: 0, gamesPlayed: 0, ledger: [], seasonName: null, franchiseName: null, error: 'Nessuna stagione attiva' }

  // League member (franchise + games_played)
  const { data: member } = await supabase
    .from('league_members')
    .select('games_played, franchise_id, franchises(name)')
    .eq('user_id', user.id)
    .eq('season_id', season.id)
    .single()

  // Balance via RPC
  const { data: balance } = await supabase
    .rpc('get_gc_balance', { p_user_id: user.id, p_season_id: season.id })

  // Ledger — newest first
  const { data: ledger } = await supabase
    .from('gm_credit_ledger')
    .select('*')
    .eq('user_id', user.id)
    .eq('season_id', season.id)
    .order('created_at', { ascending: false })

  const franchise = member?.franchises as unknown as { name: string } | null

  return {
    balance: balance ?? 0,
    gamesPlayed: member?.games_played ?? 0,
    ledger: (ledger ?? []) as GmCreditLedgerEntry[],
    seasonName: season.name,
    franchiseName: franchise?.name ?? null,
  }
}

// Admin: update games_played for a GM, auto-calculate and insert GC delta
export async function adminSetGamesPlayed(
  targetUserId: string,
  gamesPlayed: number,
  seasonId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') return { error: 'Accesso negato' }

  const admin = createAdminClient()

  // Calculate how many GC should be earned at this games count
  const { data: newGcTotal } = await admin
    .rpc('calculate_gc_earned', { p_games_played: gamesPlayed })

  const gcTotal = newGcTotal ?? 0

  // Sum of existing 'earned' entries for this GM/season
  const { data: existing } = await admin
    .from('gm_credit_ledger')
    .select('amount')
    .eq('user_id', targetUserId)
    .eq('season_id', seasonId)
    .eq('type', 'earned')

  const currentEarned = (existing ?? []).reduce((s: number, r: { amount: number }) => s + r.amount, 0)
  const delta = gcTotal - currentEarned

  // Update games_played
  const { error: memberErr } = await admin
    .from('league_members')
    .update({ games_played: gamesPlayed })
    .eq('user_id', targetUserId)
    .eq('season_id', seasonId)

  if (memberErr) return { error: memberErr.message }

  // Insert delta only if positive (we never reduce earned GC retroactively)
  if (delta > 0) {
    const { error: ledgerErr } = await admin
      .from('gm_credit_ledger')
      .insert({
        season_id: seasonId,
        user_id: targetUserId,
        amount: delta,
        type: 'earned',
        note: `Partite giocate: ${gamesPlayed}`,
        created_by: user.id,
      })
    if (ledgerErr) return { error: ledgerErr.message }
  }

  return {}
}

// Admin: manual adjustment (positive or negative, requires note)
export async function adminAdjustGc(
  targetUserId: string,
  seasonId: string,
  amount: number,
  note: string,
): Promise<{ error?: string }> {
  if (!note.trim()) return { error: 'La nota è obbligatoria per gli aggiustamenti' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') return { error: 'Accesso negato' }

  const admin = createAdminClient()

  const { error } = await admin
    .from('gm_credit_ledger')
    .insert({
      season_id: seasonId,
      user_id: targetUserId,
      amount,
      type: 'adjustment',
      note: note.trim(),
      created_by: user.id,
    })

  if (error) return { error: error.message }
  return {}
}

// Admin: get all GMs' balances for current season
export interface GmCreditSummary {
  userId: string
  displayName: string | null
  email: string | null
  franchiseName: string | null
  franchiseAbbr: string | null
  gamesPlayed: number
  balance: number
  seasonId: string
}

export async function adminGetAllGmCredits(): Promise<{ data: GmCreditSummary[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: 'Non autenticato' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') return { data: [], error: 'Accesso negato' }

  const admin = createAdminClient()

  const { data: season } = await admin
    .from('seasons')
    .select('id')
    .eq('status', 'active')
    .single()

  if (!season) return { data: [], error: 'Nessuna stagione attiva' }

  const { data: members, error } = await admin
    .from('league_members')
    .select('user_id, games_played, franchises(name, abbreviation), profiles(display_name)')
    .eq('season_id', season.id)

  if (error) return { data: [], error: error.message }

  // Get auth users for emails
  const { data: usersPage } = await admin.auth.admin.listUsers()
  const emailMap: Record<string, string> = {}
  usersPage?.users.forEach((u: { id: string; email?: string }) => { emailMap[u.id] = u.email ?? '' })

  const summaries: GmCreditSummary[] = await Promise.all(
    (members ?? []).map(async (m: {
      user_id: string
      games_played: number
      franchises: { name: string; abbreviation: string } | null
      profiles: { display_name: string | null } | null
    }) => {
      const { data: balance } = await admin
        .rpc('get_gc_balance', { p_user_id: m.user_id, p_season_id: season.id })
      return {
        userId: m.user_id,
        displayName: m.profiles?.display_name ?? null,
        email: emailMap[m.user_id] ?? null,
        franchiseName: m.franchises?.name ?? null,
        franchiseAbbr: m.franchises?.abbreviation ?? null,
        gamesPlayed: m.games_played,
        balance: balance ?? 0,
        seasonId: season.id,
      }
    })
  )

  return { data: summaries.sort((a, b) => (b.balance - a.balance)) }
}
