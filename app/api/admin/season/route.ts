import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return data?.role === 'admin' ? user : null
}

export async function GET() {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const admin = createAdminClient()
  const { data: season } = await admin
    .from('seasons')
    .select('id, name, game_version, status, created_at')
    .eq('status', 'active')
    .single()

  return NextResponse.json({ season })
}

export async function POST(request: Request) {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const { newSeasonName, gameVersion } = await request.json()
  if (!newSeasonName?.trim()) return NextResponse.json({ error: 'Nome stagione obbligatorio' }, { status: 400 })

  const admin = createAdminClient()

  const { data, error } = await admin.rpc('transition_season', {
    p_new_season_name: newSeasonName.trim(),
    p_game_version: gameVersion ?? '2K27',
    p_admin_id: adminUser.id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ newSeasonId: data })
}
