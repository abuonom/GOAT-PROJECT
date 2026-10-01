import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return data?.role === 'admin' ? user : null
}

// GET /api/admin/gm-shop?userId=X&seasonId=Y — list upgraded players for a GM
export async function GET(req: NextRequest) {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  const seasonId = searchParams.get('seasonId')
  if (!userId || !seasonId) return NextResponse.json({ error: 'userId e seasonId obbligatori' }, { status: 400 })

  const admin = createAdminClient()

  const { data: upgrades } = await admin
    .from('gm_shop_upgrades')
    .select('player_slug')
    .eq('user_id', userId)
    .eq('season_id', seasonId)

  const playerSlugs: string[] = [...new Set<string>((upgrades ?? []).map((u: { player_slug: string }) => u.player_slug))]

  // GC spent per player (only non-cancelled transactions)
  const { data: transactions } = await admin
    .from('gm_shop_transactions')
    .select('player_slug, gc_cost')
    .eq('user_id', userId)
    .eq('season_id', seasonId)
    .is('cancelled_at', null)

  const gcByPlayer: Record<string, number> = {}
  for (const tx of (transactions ?? []) as { player_slug: string; gc_cost: number }[]) {
    gcByPlayer[tx.player_slug] = (gcByPlayer[tx.player_slug] ?? 0) + tx.gc_cost
  }

  return NextResponse.json({
    players: playerSlugs.map((slug: string) => ({
      slug,
      displayName: slug.replace(/-/g, ' '),
      gcSpent: gcByPlayer[slug] ?? 0,
    }))
  })
}

// DELETE /api/admin/gm-shop — remove upgrades for a user+player+season and refund GC
export async function DELETE(req: NextRequest) {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const { userId, seasonId, playerSlug } = await req.json()
  if (!userId || !seasonId) return NextResponse.json({ error: 'userId e seasonId obbligatori' }, { status: 400 })

  const admin = createAdminClient()

  // Find transactions to cancel and calculate refund
  let txQuery = admin
    .from('gm_shop_transactions')
    .select('id, gc_cost')
    .eq('user_id', userId)
    .eq('season_id', seasonId)
    .is('cancelled_at', null)
  if (playerSlug) txQuery = txQuery.eq('player_slug', playerSlug)
  const { data: txsToCancel } = await txQuery

  const totalRefund = (txsToCancel ?? []).reduce((s: number, t: { gc_cost: number }) => s + t.gc_cost, 0)

  // Delete upgrades
  let upgradesQuery = admin
    .from('gm_shop_upgrades')
    .delete()
    .eq('user_id', userId)
    .eq('season_id', seasonId)
  if (playerSlug) upgradesQuery = upgradesQuery.eq('player_slug', playerSlug)
  const { error: upErr } = await upgradesQuery
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // Mark transactions as cancelled
  if ((txsToCancel ?? []).length > 0) {
    const txIds = (txsToCancel ?? []).map((t: { id: string }) => t.id)
    await admin
      .from('gm_shop_transactions')
      .update({ cancelled_at: new Date().toISOString(), cancelled_by: adminUser.id })
      .in('id', txIds)
  }

  // Refund GC
  if (totalRefund > 0) {
    const { error: ledgerErr } = await admin.from('gm_credit_ledger').insert({
      season_id: seasonId,
      user_id: userId,
      amount: totalRefund,
      type: 'adjustment',
      note: playerSlug
        ? `Rimborso upgrade rimossi: ${playerSlug.replace(/-/g, ' ')} (admin)`
        : 'Rimborso upgrade rimossi (admin)',
      created_by: adminUser.id,
    })
    if (ledgerErr) return NextResponse.json({ error: ledgerErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, refunded: totalRefund })
}
