import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { BADGE_TIERS, findCatalogBadge } from '@/lib/badges/catalog'

// Cartellini aggiunti a mano ai giocatori esistenti (solo admin).
// Serve quando il giocatore è cresciuto nel gioco ma i dati dell'app sono ancora vecchi.
// I cartellini aggiunti hanno manual: true, così i resync (scripts/resync-*.mjs) non li cancellano.
//
// GET  ?q=nome   → cerca giocatori per nome
// GET  ?slug=... → cartellini del giocatore
// POST { slug, name, tier }  → aggiunge un cartellino che il giocatore non ha
// DELETE { slug, name }      → toglie un cartellino aggiunto a mano (per correggere un errore)

type PlayerBadge = {
  name: string
  tier: string
  category: string
  manual?: boolean
  addedAt?: string
  addedBy?: string
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return data?.role === 'admin' ? user : null
}

type PlayerRow = { slug: string; data: Record<string, unknown> & { badges?: { list?: PlayerBadge[] } } }

async function loadPlayer(slug: string): Promise<PlayerRow | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('players').select('slug, data').eq('slug', slug).maybeSingle()
  return (data as PlayerRow | null) ?? null
}

function summary(row: PlayerRow) {
  const d = row.data as { name?: string; overall?: number; team?: string; badges?: { list?: PlayerBadge[] } }
  return {
    slug: row.slug,
    name: d.name ?? row.slug,
    overall: Number(d.overall ?? 0),
    team: d.team ?? '',
    badges: d.badges?.list ?? [],
  }
}

export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const slug = req.nextUrl.searchParams.get('slug')
  if (slug) {
    const row = await loadPlayer(slug)
    if (!row) return NextResponse.json({ error: 'Giocatore non trovato' }, { status: 404 })
    return NextResponse.json({ player: summary(row) })
  }

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().replace(/[%_\\]/g, '')
  if (q.length < 2) return NextResponse.json({ players: [] })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('players')
    .select('slug, data')
    .ilike('data->>name', `%${q}%`)
    .limit(12)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const players = ((data ?? []) as PlayerRow[]).map(summary)
    .sort((a, b) => b.overall - a.overall)
    .map(p => ({ ...p, badges: undefined, badgeCount: p.badges.length }))
  return NextResponse.json({ players })
}

export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const slug = typeof body.slug === 'string' ? body.slug : ''
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : ''
  const tier = typeof body.tier === 'string' ? body.tier : ''

  if (!slug) return NextResponse.json({ error: 'Giocatore mancante' }, { status: 400 })
  if (!name || name.length > 60) return NextResponse.json({ error: 'Nome del cartellino non valido' }, { status: 400 })
  if (!(BADGE_TIERS as readonly string[]).includes(tier)) {
    return NextResponse.json({ error: 'Livello non valido' }, { status: 400 })
  }

  const row = await loadPlayer(slug)
  if (!row) return NextResponse.json({ error: 'Giocatore non trovato' }, { status: 404 })

  // Se il nome è nel catalogo uso la grafia e la categoria ufficiali
  const known = findCatalogBadge(name)
  const finalName = known?.name ?? name
  const category = known?.category ?? 'Other'

  const list = row.data.badges?.list ?? []
  const existing = list.find(b => b.name.toLowerCase() === finalName.toLowerCase())
  if (existing) {
    return NextResponse.json(
      { error: `${summary(row).name} ha già il cartellino ${existing.name} (${existing.tier})` },
      { status: 400 }
    )
  }

  const newBadge: PlayerBadge = {
    name: finalName,
    tier,
    category,
    manual: true,
    addedAt: new Date().toISOString(),
    addedBy: adminUser.id,
  }

  const newData = { ...row.data, badges: { ...(row.data.badges ?? {}), list: [...list, newBadge] } }
  const admin = createAdminClient()
  const { error } = await admin
    .from('players')
    .update({ data: newData, updated_at: new Date().toISOString() })
    .eq('slug', slug)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, badge: newBadge, total: list.length + 1 })
}

export async function DELETE(req: NextRequest) {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const slug = typeof body.slug === 'string' ? body.slug : ''
  const name = typeof body.name === 'string' ? body.name : ''
  if (!slug || !name) return NextResponse.json({ error: 'slug e name obbligatori' }, { status: 400 })

  const row = await loadPlayer(slug)
  if (!row) return NextResponse.json({ error: 'Giocatore non trovato' }, { status: 404 })

  const list = row.data.badges?.list ?? []
  const target = list.find(b => b.name === name)
  if (!target) return NextResponse.json({ error: 'Cartellino non trovato' }, { status: 404 })
  // Solo quelli aggiunti a mano: gli altri arrivano dai dati ufficiali
  if (!target.manual) return NextResponse.json({ error: 'Si possono togliere solo i cartellini aggiunti a mano' }, { status: 400 })

  const newData = { ...row.data, badges: { ...(row.data.badges ?? {}), list: list.filter(b => b !== target) } }
  const admin = createAdminClient()
  const { error } = await admin
    .from('players')
    .update({ data: newData, updated_at: new Date().toISOString() })
    .eq('slug', slug)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
