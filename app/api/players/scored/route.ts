import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { scorePlayer, type BuildWeights, DEFAULT_WEIGHTS } from '@/lib/nba/playerScorer'
import { matchContract } from '@/lib/nba/matchContract'
import type { Player } from '@/types/nba'
import type { PlayerExtra } from '@/hooks/usePotentials'
import type { ContractEntry } from '@/app/api/contracts/route'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// POST /api/players/scored
// Riceve i pesi (slider) e restituisce la lista giocatori già punteggiata e ordinata,
// con potenziale, età, contratto e score. Il browser non calcola più nulla.
// Lo score usa lo stesso lib/nba/playerScorer del client: una sola fonte di verità.

function parseWeights(input: unknown): BuildWeights {
  const w = { ...DEFAULT_WEIGHTS }
  if (input && typeof input === 'object') {
    for (const k of Object.keys(DEFAULT_WEIGHTS) as (keyof BuildWeights)[]) {
      const v = Number((input as Record<string, unknown>)[k])
      if (Number.isFinite(v) && v >= 0 && v <= 10) w[k] = v
    }
  }
  return w
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const weights = parseWeights(body.weights)

  const [playersRes, contractsRes, potentialsRes] = await Promise.all([
    supabase.from('players').select('slug, data'),
    supabase.from('contracts').select('name, team, salaries, years_remaining'),
    supabase.from('player_potentials').select('slug, potential, age'),
  ])

  if (playersRes.error) return NextResponse.json({ success: false, data: [] }, { status: 500 })

  const contracts = (contractsRes.data ?? []) as ContractEntry[]
  const potentials = new Map<string, PlayerExtra>()
  for (const row of (potentialsRes.data ?? []) as { slug: string; potential: string | null; age: number | null }[]) {
    potentials.set(row.slug, { potential: row.potential, age: row.age })
  }

  const scored = (playersRes.data ?? []).map((row: { slug: string; data: Record<string, unknown> }) => {
    const p = row.data as unknown as Player
    const extra = potentials.get(row.slug)
    const contract = contracts.length > 0 ? matchContract(p.name, contracts) : undefined
    const score = scorePlayer(p, extra, contract, weights)
    return {
      slug: row.slug,
      name: p.name,
      team: p.team,
      overall: p.overall,
      positions: p.positions,
      height: p.height,
      attributes: p.attributes,
      badges: {
        total: p.badges?.list?.length ?? 0,
        counts: (p.badges?.list ?? []).reduce<Record<string, number>>((acc, b) => {
          acc[b.tier] = (acc[b.tier] ?? 0) + 1
          return acc
        }, {}),
      },
      potential: extra?.potential ?? null,
      age: extra?.age ?? null,
      contract: contract ?? null,
      score,
    }
  })

  scored.sort((a, b) => b.score.total - a.score.total || b.overall - a.overall)

  const body2 = JSON.stringify({ success: true, data: scored })
  const etag = `"${createHash('sha1').update(body2).digest('base64url').slice(0, 27)}"`
  return new NextResponse(body2, {
    headers: { 'Content-Type': 'application/json', ETag: etag, 'Cache-Control': 'no-cache' },
  })
}
