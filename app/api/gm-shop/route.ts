import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { purchaseUpgrade } from '@/lib/league/gm-shop'

// GET /api/gm-shop?type=catalog|context
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const type = req.nextUrl.searchParams.get('type')

  if (type === 'catalog') {
    const { data } = await supabase
      .from('gm_shop_attributes')
      .select('*')
      .eq('active', true)
      .order('sort_order')
    return NextResponse.json({ attributes: data ?? [] })
  }

  if (type === 'context') {
    const { data: season } = await supabase
      .from('seasons')
      .select('id, name')
      .eq('status', 'active')
      .single()
    if (!season) return NextResponse.json({ error: 'Nessuna stagione attiva' }, { status: 404 })

    const [{ data: balance }, { data: member }, { data: upgrades }] = await Promise.all([
      supabase.rpc('get_gc_balance', { p_user_id: user.id, p_season_id: season.id }),
      supabase
        .from('league_members')
        .select('franchise_id, franchises(name, abbreviation)')
        .eq('user_id', user.id)
        .eq('season_id', season.id)
        .single(),
      supabase
        .from('gm_shop_upgrades')
        .select('player_slug, attribute_key, old_value, new_value, gc_cost, created_at')
        .eq('user_id', user.id)
        .eq('season_id', season.id)
        .order('created_at', { ascending: false }),
    ])

    // My roster
    const { data: roster } = await supabase
      .from('roster_memberships')
      .select('player_slug, status')
      .eq('franchise_id', member?.franchise_id ?? '')
      .eq('season_id', season.id)
      .neq('status', 'released')

    const rosterSlugs = (roster ?? []).map(r => r.player_slug)

    // Fetch name/OVR for all roster players upfront
    const { data: playerRows } = rosterSlugs.length > 0
      ? await supabase.from('players').select('slug, data').in('slug', rosterSlugs)
      : { data: [] }

    const rosterPlayers = rosterSlugs.map(slug => {
      const row = (playerRows ?? []).find(p => p.slug === slug)
      return {
        slug,
        name: row?.data?.name ?? null,
        overall: row?.data?.overall ?? null,
      }
    })

    return NextResponse.json({
      balance: balance ?? 0,
      seasonId: season.id,
      seasonName: season.name,
      franchise: (member?.franchises as unknown as { name: string; abbreviation: string } | null),
      rosterSlugs,
      rosterPlayers,
      upgrades: upgrades ?? [],
    })
  }

  return NextResponse.json({ error: 'type richiesto' }, { status: 400 })
}

// POST /api/gm-shop — purchase an upgrade
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const body = await req.json()
  const { playerSlug, attributeKey, currentValue, badgeName } = body

  if (!playerSlug || !attributeKey) {
    return NextResponse.json({ error: 'playerSlug e attributeKey obbligatori' }, { status: 400 })
  }

  const result = await purchaseUpgrade({ playerSlug, attributeKey, currentValue, badgeName })

  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, gcCost: result.gcCost })
}
