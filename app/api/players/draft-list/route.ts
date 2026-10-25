import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Versione leggera di /api/players per il draft-builder.
// Restituisce solo i campi letti dal draft-builder e da playerScorer,
// senza descrizioni/immagini dei badge né storico rating (≈ 2,7 MB → molto meno).
export async function GET(req: NextRequest) {
  const { data, error } = await supabase.from('players').select('data')

  if (error) {
    return NextResponse.json({ success: false, data: [], error: error.message }, { status: 500 })
  }

  const players = (data ?? []).map((row: { data: Record<string, unknown> }) => {
    const p = row.data as {
      name: string
      slug: string
      team: string
      teamType: string
      overall: number
      positions: string[]
      archetype?: string
      height?: string
      weight?: string
      wingspan?: string
      college?: string
      attributes: Record<string, number>
      badges?: { list?: { name: string; tier: string; category: string }[] }
    }
    return {
      name: p.name,
      slug: p.slug,
      team: p.team,
      teamType: p.teamType,
      overall: p.overall,
      positions: p.positions,
      archetype: p.archetype,
      height: p.height,
      weight: p.weight,
      wingspan: p.wingspan,
      college: p.college,
      attributes: p.attributes,
      badges: {
        list: (p.badges?.list ?? []).map(b => ({ name: b.name, tier: b.tier, category: b.category })),
      },
    }
  })

  // ETag dal contenuto: se la lista non cambia, il browser riceve 304 senza scaricare 1 MB
  const body = JSON.stringify({ success: true, data: players })
  const etag = `"${createHash('sha1').update(body).digest('base64url').slice(0, 27)}"`

  if (req.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } })
  }

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/json',
      ETag: etag,
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
