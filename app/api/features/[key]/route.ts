import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isFeatureEnabled, isSuperAdminUser } from '@/lib/league/features'

// GET  /api/features/:key  → { enabled } (utenti autenticati)
// POST /api/features/:key  → { enabled } cambia lo stato (solo superadmin)

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  const { key } = await params
  return NextResponse.json({ enabled: await isFeatureEnabled(key) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  if (!(await isSuperAdminUser())) return NextResponse.json({ error: 'Solo il superadmin' }, { status: 403 })

  const { key } = await params
  const { enabled } = await req.json()
  if (typeof enabled !== 'boolean') return NextResponse.json({ error: 'Valore non valido' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('feature_flags')
    .update({ enabled, updated_at: new Date().toISOString(), updated_by: user.id })
    .eq('key', key)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ enabled })
}
