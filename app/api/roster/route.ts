import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/roster?type=ownership|mine
// ownership → { [playerSlug]: { franchiseName, abbreviation, status } }
// mine      → array of memberships for the current user
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') ?? 'ownership'

  // Get active season
  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!season) return NextResponse.json(type === 'ownership' ? {} : type === 'context' ? { hasFranchise: false, franchiseName: null, seasonName: null } : [])

  if (type === 'context') {
    const { data: member } = await supabase
      .from('league_members')
      .select('franchise_id, franchises(name, abbreviation)')
      .eq('user_id', user.id)
      .eq('season_id', season.id)
      .single()
    const f = member?.franchises as unknown as { name: string } | null
    return NextResponse.json({
      hasFranchise: !!member,
      franchiseName: f?.name ?? null,
      seasonName: (season as { id: string; name: string }).name,
    })
  }

  if (type === 'ownership') {
    // All active roster memberships for this season, joined with franchise info
    const { data: memberships } = await supabase
      .from('roster_memberships')
      .select('player_slug, status, franchise_id, franchises(name, abbreviation)')
      .eq('season_id', season.id)
      .neq('status', 'released')

    const map: Record<string, { franchiseName: string; abbreviation: string; status: string }> = {}
    for (const m of memberships ?? []) {
      const f = m.franchises as unknown as { name: string; abbreviation: string } | null
      if (f) map[m.player_slug] = { franchiseName: f.name, abbreviation: f.abbreviation, status: m.status }
    }
    return NextResponse.json(map)
  }

  // type === 'mine': return current user's franchise memberships
  const { data: member } = await supabase
    .from('league_members')
    .select('franchise_id')
    .eq('user_id', user.id)
    .eq('season_id', season.id)
    .single()

  if (!member) return NextResponse.json([])

  const { data: memberships } = await supabase
    .from('roster_memberships')
    .select('*')
    .eq('franchise_id', member.franchise_id)
    .eq('season_id', season.id)
    .neq('status', 'released')
    .order('acquired_at', { ascending: true })

  return NextResponse.json(memberships ?? [])
}

// POST /api/roster — add player
export async function POST(request: Request) {
  const { addPlayerToRoster } = await import('@/lib/league/roster')
  const { playerSlug } = await request.json()
  if (!playerSlug) return NextResponse.json({ error: 'playerSlug richiesto' }, { status: 400 })
  const result = await addPlayerToRoster(playerSlug)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ success: true })
}

// DELETE /api/roster — remove player
export async function DELETE(request: Request) {
  const { removePlayerFromRoster } = await import('@/lib/league/roster')
  const { playerSlug } = await request.json()
  if (!playerSlug) return NextResponse.json({ error: 'playerSlug richiesto' }, { status: 400 })
  const result = await removePlayerFromRoster(playerSlug)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ success: true })
}

// PATCH /api/roster — confirm roster
export async function PATCH() {
  const { confirmRoster } = await import('@/lib/league/roster')
  const result = await confirmRoster()
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ success: true, count: result.count })
}
