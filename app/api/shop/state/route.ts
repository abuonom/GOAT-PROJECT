import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isShopOpen, isSuperAdmin } from '@/lib/league/shop-state'

// GET  /api/shop/state  → { open: boolean } (per tutti gli utenti autenticati)
// POST /api/shop/state  → { open: boolean } cambia lo stato (solo superadmin)

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  return NextResponse.json({ open: await isShopOpen() })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  if (!(await isSuperAdmin())) return NextResponse.json({ error: 'Solo il superadmin può aprire o chiudere lo shop' }, { status: 403 })

  const { open } = await req.json()
  if (typeof open !== 'boolean') return NextResponse.json({ error: 'Valore non valido' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('shop_state')
    .update({ is_open: open, updated_at: new Date().toISOString(), updated_by: user.id })
    .eq('id', 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ open })
}
