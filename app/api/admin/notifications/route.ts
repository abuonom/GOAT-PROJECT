import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return data?.role === 'admin' ? user : null
}

export interface Notification {
  id: string
  type: 'gc_earned' | 'shop_purchase' | 'roster_confirmed' | 'franchise_claimed'
  userId: string
  displayName: string | null
  franchiseName: string | null
  franchiseAbbr: string | null
  title: string
  detail: string
  amount?: number
  createdAt: string
  processedAt?: string | null
  processedBy?: string | null
  cancelledAt?: string | null
}

export async function GET() {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const admin = createAdminClient()

  const { data: season } = await admin
    .from('seasons').select('id').eq('status', 'active').single()
  if (!season) return NextResponse.json({ notifications: [] })

  // Load users + profiles separately (no PostgREST FK join needed)
  const [usersPage, allProfilesRes, membersRes] = await Promise.all([
    admin.auth.admin.listUsers(),
    admin.from('profiles').select('id, display_name'),
    admin.from('league_members')
      .select('user_id, franchise_id, joined_at, franchises(name, abbreviation)')
      .eq('season_id', season.id),
  ])

  const emailMap: Record<string, string> = {}
  usersPage?.data?.users?.forEach((u: { id: string; email?: string }) => { emailMap[u.id] = u.email ?? '' })

  const displayNameMap: Record<string, string | null> = {}
  for (const p of (allProfilesRes.data ?? [])) displayNameMap[p.id] = p.display_name

  type RawMember = { user_id: string; franchise_id: string; joined_at: string; franchises: unknown }
  const members = (membersRes.data ?? []) as RawMember[]

  const memberMap: Record<string, { displayName: string | null; franchiseName: string | null; franchiseAbbr: string | null; franchiseId: string }> = {}
  for (const m of members) {
    const f = m.franchises as { name: string; abbreviation: string } | null
    memberMap[m.user_id] = {
      displayName: displayNameMap[m.user_id] ?? emailMap[m.user_id] ?? null,
      franchiseName: f?.name ?? null,
      franchiseAbbr: f?.abbreviation ?? null,
      franchiseId: m.franchise_id,
    }
  }

  function gmName(userId: string) {
    return memberMap[userId]?.displayName ?? displayNameMap[userId] ?? emailMap[userId] ?? userId.slice(0, 8)
  }
  function franchise(userId: string) {
    return { name: memberMap[userId]?.franchiseName, abbr: memberMap[userId]?.franchiseAbbr }
  }

  const notifications: Notification[] = []

  // 1. GC earned
  const { data: gcEarned } = await admin
    .from('gm_credit_ledger')
    .select('id, user_id, amount, note, created_at')
    .eq('season_id', season.id)
    .eq('type', 'earned')
    .order('created_at', { ascending: false })
    .limit(50)

  for (const e of (gcEarned ?? [])) {
    const f = franchise(e.user_id)
    notifications.push({
      id: `gc-${e.id}`,
      type: 'gc_earned',
      userId: e.user_id,
      displayName: gmName(e.user_id),
      franchiseName: f.name ?? null,
      franchiseAbbr: f.abbr ?? null,
      title: `+${e.amount} GC guadagnati`,
      detail: e.note ?? '',
      amount: e.amount,
      createdAt: e.created_at,
    })
  }

  // 2. GM Shop purchases — fetch player name+team for each slug
  const { data: purchases } = await admin
    .from('gm_shop_transactions')
    .select('id, user_id, player_slug, attribute_key, gc_cost, badge_name, created_at, admin_processed_at, processed_by, cancelled_at')
    .eq('season_id', season.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const [attrsRes, playerSlugsForLookup] = (() => {
    const slugs = [...new Set<string>((purchases ?? []).map((tx: { player_slug: string }) => tx.player_slug))]
    return [admin.from('gm_shop_attributes').select('attribute_key, label_it'), slugs]
  })()

  const [attrsResult, playerRowsRes] = await Promise.all([
    attrsRes,
    playerSlugsForLookup.length > 0
      ? admin.from('players').select('slug, data').in('slug', playerSlugsForLookup)
      : Promise.resolve({ data: [] }),
  ])

  const attrMap: Record<string, string> = {}
  for (const a of (attrsResult.data ?? [])) attrMap[a.attribute_key] = a.label_it

  const playerInfoMap: Record<string, { name: string; team: string }> = {}
  for (const row of (playerRowsRes.data ?? [])) {
    const p = row.data as { name?: string; team?: string }
    playerInfoMap[row.slug] = { name: p.name ?? row.slug.replace(/-/g, ' '), team: p.team ?? '' }
  }

  for (const tx of (purchases ?? [])) {
    const f = franchise(tx.user_id)
    const attrLabel = tx.badge_name
      ? `Badge ${tx.badge_name} Bronze→Silver`
      : (attrMap[tx.attribute_key] ?? tx.attribute_key)
    const playerInfo = playerInfoMap[tx.player_slug]
    const playerDisplay = playerInfo
      ? `${playerInfo.name}${playerInfo.team ? ` · ${playerInfo.team}` : ''}`
      : tx.player_slug.replace(/-/g, ' ')

    notifications.push({
      id: `shop-${tx.id}`,
      type: 'shop_purchase',
      userId: tx.user_id,
      displayName: gmName(tx.user_id),
      franchiseName: f.name ?? null,
      franchiseAbbr: f.abbr ?? null,
      title: `Upgrade: ${attrLabel}`,
      detail: playerDisplay,
      amount: -tx.gc_cost,
      createdAt: tx.created_at,
      processedAt: tx.admin_processed_at ?? null,
      processedBy: tx.processed_by ?? null,
      cancelledAt: tx.cancelled_at ?? null,
    })
  }

  // 3. Franchise claims
  for (const m of members) {
    const f = m.franchises as { name: string; abbreviation: string } | null
    const name = gmName(m.user_id)
    notifications.push({
      id: `franchise-${m.user_id}`,
      type: 'franchise_claimed',
      userId: m.user_id,
      displayName: name,
      franchiseName: f?.name ?? null,
      franchiseAbbr: f?.abbreviation ?? null,
      title: `Franchigia scelta: ${f?.name ?? '—'}`,
      detail: `GM: ${name}`,
      createdAt: m.joined_at,
    })
  }

  // 4. Roster confirmations
  const { data: confirmedRosters } = await admin
    .from('roster_memberships')
    .select('franchise_id, acquired_at')
    .eq('season_id', season.id)
    .eq('status', 'confirmed')
    .order('acquired_at', { ascending: false })

  const seenFranchise = new Set<string>()
  for (const r of (confirmedRosters ?? [])) {
    if (seenFranchise.has(r.franchise_id)) continue
    seenFranchise.add(r.franchise_id)

    const matchedMember = members.find(m => m.franchise_id === r.franchise_id)
    if (!matchedMember) continue

    const f = matchedMember.franchises as { name: string; abbreviation: string } | null
    const name = gmName(matchedMember.user_id)

    notifications.push({
      id: `roster-${r.franchise_id}`,
      type: 'roster_confirmed',
      userId: matchedMember.user_id,
      displayName: name,
      franchiseName: f?.name ?? null,
      franchiseAbbr: f?.abbreviation ?? null,
      title: 'Roster confermato',
      detail: `${f?.abbreviation ?? ''} · ${f?.name ?? ''}`,
      createdAt: r.acquired_at,
    })
  }

  notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return NextResponse.json({ notifications: notifications.slice(0, 100) })
}

export async function PATCH(request: Request) {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const { id, action } = await request.json()
  if (!id || !action) return NextResponse.json({ error: 'Parametri non validi' }, { status: 400 })
  if (!id.startsWith('shop-')) return NextResponse.json({ error: 'Solo shop_purchase supportato' }, { status: 400 })

  const txId = id.replace('shop-', '')
  const admin = createAdminClient()

  if (action === 'mark_processed') {
    const { error } = await admin
      .from('gm_shop_transactions')
      .update({ admin_processed_at: new Date().toISOString(), processed_by: adminUser.id })
      .eq('id', txId)
      .is('admin_processed_at', null)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'cancel') {
    // Get transaction
    const { data: tx } = await admin
      .from('gm_shop_transactions')
      .select('id, user_id, season_id, gc_cost, player_slug, attribute_key, badge_name')
      .eq('id', txId)
      .is('cancelled_at', null)
      .single()

    if (!tx) return NextResponse.json({ error: 'Transazione non trovata o già annullata' }, { status: 404 })

    // Delete the specific upgrade (matched by transaction_id)
    await admin
      .from('gm_shop_upgrades')
      .delete()
      .eq('transaction_id', txId)

    // Refund GC
    const { error: ledgerErr } = await admin.from('gm_credit_ledger').insert({
      season_id: tx.season_id,
      user_id: tx.user_id,
      amount: tx.gc_cost,
      type: 'adjustment',
      note: `Rimborso annullamento upgrade ${tx.player_slug.replace(/-/g, ' ')} (admin)`,
      created_by: adminUser.id,
    })
    if (ledgerErr) return NextResponse.json({ error: ledgerErr.message }, { status: 500 })

    // Mark transaction as cancelled
    await admin
      .from('gm_shop_transactions')
      .update({ cancelled_at: new Date().toISOString(), cancelled_by: adminUser.id })
      .eq('id', txId)

    return NextResponse.json({ success: true, refunded: tx.gc_cost })
  }

  return NextResponse.json({ error: 'Azione non valida' }, { status: 400 })
}
