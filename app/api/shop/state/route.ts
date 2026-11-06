import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getShopState, isSuperAdmin } from '@/lib/league/shop-state'

// GET  /api/shop/state  → { open: boolean, closesAt: string | null } (utenti autenticati)
// POST /api/shop/state  → cambia stato (solo superadmin)
//   body { open: boolean }          apre/chiude a mano; aprire azzera la data di chiusura
//   body { closesAt: string | null } programma la chiusura automatica (ISO) oppure la rimuove

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  return NextResponse.json(await getShopState())
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  if (!(await isSuperAdmin())) return NextResponse.json({ error: 'Solo il superadmin può gestire lo shop' }, { status: 403 })

  const body = await req.json()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id }

  if ('open' in body) {
    if (typeof body.open !== 'boolean') return NextResponse.json({ error: 'Valore non valido' }, { status: 400 })
    update.is_open = body.open
    // Riaprire a mano annulla una chiusura programmata già passata
    if (body.open) update.closes_at = null
  }

  if ('closesAt' in body) {
    if (body.closesAt === null) {
      update.closes_at = null
    } else {
      const t = typeof body.closesAt === 'string' ? Date.parse(body.closesAt) : NaN
      if (Number.isNaN(t)) return NextResponse.json({ error: 'Data non valida' }, { status: 400 })
      update.closes_at = new Date(t).toISOString()
      // Programmare una chiusura futura riapre lo shop se era chiuso a mano
      update.is_open = true
    }
  }

  if (!('open' in body) && !('closesAt' in body)) {
    return NextResponse.json({ error: 'Valore non valido' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('shop_state').update(update).eq('id', 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(await getShopState())
}
