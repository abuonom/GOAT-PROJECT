import { createClient, createAdminClient } from '@/lib/supabase/server'
import { invalidateRoster } from '@/lib/league/roster-cache'
import { NextResponse } from 'next/server'
import { BADGE_TIERS, findCatalogBadge } from '@/lib/badges/catalog'

// Cartellini aggiunti dal GM ai giocatori del proprio roster.
// Serve quando il giocatore è cresciuto nel gioco ma l'app ha ancora i dati vecchi.
// I cartellini aggiunti hanno manual: true, così i resync (scripts/resync-*.mjs) non li cancellano.
//
// POST   { slug, name, tier } → aggiunge un cartellino che il giocatore non ha
// DELETE { slug, name }       → toglie un cartellino aggiunto a mano (per correggere un errore)

type PlayerBadge = {
  name: string
  tier: string
  category: string
  manual?: boolean
  addedAt?: string
  addedBy?: string
}
type PlayerData = Record<string, unknown> & { name?: string; badges?: { list?: PlayerBadge[] } }

// Utente loggato + giocatore che deve essere nel suo roster attivo
async function checkAccess(slug: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato', status: 401 as const }
  if (!slug) return { error: 'Giocatore mancante', status: 400 as const }

  const admin = createAdminClient()
  const { data: member } = await admin
    .from('league_members')
    .select('franchise_id, season_id, seasons!inner(status)')
    .eq('user_id', user.id)
    .eq('seasons.status', 'active')
    .maybeSingle()
  if (!member) return { error: 'Non sei assegnato a una franchigia questa stagione', status: 400 as const }

  const { data: owned } = await admin
    .from('roster_memberships')
    .select('id')
    .eq('franchise_id', member.franchise_id)
    .eq('season_id', member.season_id)
    .eq('player_slug', slug)
    .neq('status', 'released')
    .maybeSingle()
  if (!owned) return { error: 'Questo giocatore non è nel tuo roster', status: 403 as const }

  const { data: row } = await admin.from('players').select('data').eq('slug', slug).maybeSingle()
  if (!row) return { error: 'Giocatore non trovato', status: 404 as const }

  return { user, admin, data: row.data as PlayerData }
}

async function save(admin: ReturnType<typeof createAdminClient>, slug: string, data: PlayerData, userId: string) {
  const { error } = await admin
    .from('players')
    .update({ data, updated_at: new Date().toISOString() })
    .eq('slug', slug)
  if (error) return error.message
  // La cache del roster del GM contiene i dati del giocatore: va riallineata
  invalidateRoster(userId, 'route')
  return null
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const slug = typeof body.slug === 'string' ? body.slug : ''
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : ''
  const tier = typeof body.tier === 'string' ? body.tier : ''

  const access = await checkAccess(slug)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  if (!name || name.length > 60) return NextResponse.json({ error: 'Nome del cartellino non valido' }, { status: 400 })
  if (!(BADGE_TIERS as readonly string[]).includes(tier)) {
    return NextResponse.json({ error: 'Livello non valido' }, { status: 400 })
  }

  // Se il nome è nel catalogo uso la grafia e la categoria ufficiali
  const known = findCatalogBadge(name)
  const finalName = known?.name ?? name
  const category = known?.category ?? 'Other'

  const list = access.data.badges?.list ?? []
  const existing = list.find(b => b.name.toLowerCase() === finalName.toLowerCase())
  if (existing) {
    return NextResponse.json(
      { error: `${access.data.name ?? slug} ha già il cartellino ${existing.name} (${existing.tier})` },
      { status: 400 }
    )
  }

  const newBadge: PlayerBadge = {
    name: finalName,
    tier,
    category,
    manual: true,
    addedAt: new Date().toISOString(),
    addedBy: access.user.id,
  }
  const newData: PlayerData = { ...access.data, badges: { ...(access.data.badges ?? {}), list: [...list, newBadge] } }

  const err = await save(access.admin, slug, newData, access.user.id)
  if (err) return NextResponse.json({ error: err }, { status: 500 })
  return NextResponse.json({ ok: true, badge: newBadge })
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({}))
  const slug = typeof body.slug === 'string' ? body.slug : ''
  const name = typeof body.name === 'string' ? body.name : ''

  const access = await checkAccess(slug)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })
  if (!name) return NextResponse.json({ error: 'Nome del cartellino mancante' }, { status: 400 })

  const list = access.data.badges?.list ?? []
  const target = list.find(b => b.name === name)
  if (!target) return NextResponse.json({ error: 'Cartellino non trovato' }, { status: 404 })
  // Solo quelli aggiunti a mano: gli altri arrivano dai dati ufficiali
  if (!target.manual) {
    return NextResponse.json({ error: 'Si possono togliere solo i cartellini aggiunti a mano' }, { status: 400 })
  }

  const newData: PlayerData = { ...access.data, badges: { ...(access.data.badges ?? {}), list: list.filter(b => b !== target) } }
  const err = await save(access.admin, slug, newData, access.user.id)
  if (err) return NextResponse.json({ error: err }, { status: 500 })
  return NextResponse.json({ ok: true })
}
