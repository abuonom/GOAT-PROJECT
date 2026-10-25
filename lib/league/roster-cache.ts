import { unstable_cache, updateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'

// Cache del roster di un GM (per utente). Il roster cambia solo quando il GM
// aggiunge o rimuove un giocatore, quindi la cache viene invalidata in quei punti.
// La verifica di sessione resta fuori dalla cache: qui passano solo i dati.

export type RosterRow = {
  player_slug: string
  status: string
  acquired_at: string
  franchise_id: string
  season_id: string
  data: unknown
}

export const rosterTag = (userId: string) => `roster:${userId}`

// Legge il roster completo del GM dalla funzione SQL roster_full_for_me.
// La funzione usa auth.uid(), quindi qui serve il client con la sessione dell'utente
// passato come parametro: usiamo il client admin con la funzione chiamata per l'utente.
async function fetchRoster(userId: string): Promise<RosterRow[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('league_members')
    .select('franchise_id, season_id, seasons!inner(status)')
    .eq('user_id', userId)
    .eq('seasons.status', 'active')
    .maybeSingle()
  if (!data) return []

  const { data: memberships } = await admin
    .from('roster_memberships')
    .select('player_slug, status, acquired_at, franchise_id, season_id')
    .eq('franchise_id', data.franchise_id)
    .eq('season_id', data.season_id)
    .neq('status', 'released')
    .order('acquired_at', { ascending: true })

  const slugs = (memberships ?? []).map((m: { player_slug: string }) => m.player_slug)
  const { data: players } = slugs.length
    ? await admin.from('players').select('slug, data').in('slug', slugs)
    : { data: [] as { slug: string; data: unknown }[] }
  const byslug = new Map((players ?? []).map((p: { slug: string; data: unknown }) => [p.slug, p.data]))

  return (memberships ?? []).map((m: Omit<RosterRow, 'data'>) => ({ ...m, data: byslug.get(m.player_slug) ?? null }))
}

export function getCachedRoster(userId: string) {
  return unstable_cache(
    () => fetchRoster(userId),
    ['roster', userId],
    { tags: [rosterTag(userId)], revalidate: 3600 }
  )()
}

// Da chiamare dentro una Server Action dopo ogni modifica del roster di un GM.
// updateTag fa sì che la lettura successiva veda subito la modifica (niente dato vecchio).
export function invalidateRoster(userId: string) {
  updateTag(rosterTag(userId))
}
