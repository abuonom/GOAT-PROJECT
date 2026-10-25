import { NextRequest, NextResponse } from 'next/server'
import { addPlayerToRoster } from '@/lib/league/roster'
import { createAdminClient } from '@/lib/supabase/server'

// POST /api/roster/rookie
// Crea un rookie nato nel gioco (non presente in NBA2K API) e lo aggiunge al roster del GM.
// Il rookie va in `players` con teamType 'gm_created', così il roster e il GM Shop lo leggono come gli altri.

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const overall = Number(body.overall)
  const draftYear = Number(body.draftYear)
  const positions: string[] = Array.isArray(body.positions) ? body.positions.filter((p: unknown) => typeof p === 'string') : []

  if (!name) return NextResponse.json({ error: 'Nome obbligatorio' }, { status: 400 })
  if (!Number.isInteger(overall) || overall < 40 || overall > 99) {
    return NextResponse.json({ error: 'Overall non valido (40–99)' }, { status: 400 })
  }
  if (!Number.isInteger(draftYear) || draftYear < 2027 || draftYear > 2100) {
    return NextResponse.json({ error: 'Anno di draft non valido (2027 o successivo)' }, { status: 400 })
  }
  if (positions.length === 0) {
    return NextResponse.json({ error: 'Inserisci almeno una posizione' }, { status: 400 })
  }

  // Slug con prefisso per non collidere con i giocatori della lista NBA2K
  const slug = `rookie-${draftYear}-${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`

  const admin = createAdminClient()
  const { error: insErr } = await admin.from('players').insert({
    slug,
    data: {
      name,
      slug,
      team: 'Free Agency',
      teamType: 'gm_created',
      overall,
      positions,
      draftYear,
      isRookie: true,
      attributes: {},
      badges: { list: [] },
    },
  })
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 })

  // Stessi controlli del roster: max 15, un solo proprietario, stato 'selected'
  const result = await addPlayerToRoster(slug)
  if (result.error) {
    await admin.from('players').delete().eq('slug', slug)
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ ok: true, slug })
}
