import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Versione leggera di /api/players per il draft-builder.
// Restituisce solo i campi letti dal draft-builder e da playerScorer,
// senza descrizioni/immagini dei badge né storico rating (≈ 2,7 MB → molto meno).
export async function GET() {
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

  return NextResponse.json({ success: true, data: players }, {
    headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' },
  })
}
