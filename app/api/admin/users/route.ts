import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return profile?.role === 'admin' ? user : null
}

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const adminClient = createAdminClient()
  const { data: { users }, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch all profiles to enrich with role
  const { data: profiles } = await adminClient
    .from('profiles')
    .select('id, display_name, role')

  const profileMap = Object.fromEntries(
    (profiles ?? []).map((p: { id: string; display_name: string | null; role: string }) => [p.id, p])
  )

  // Fetch franchise assignments for current active season
  const { data: activeSeason } = await adminClient
    .from('seasons')
    .select('id')
    .eq('status', 'active')
    .single()

  const franchiseMap: Record<string, { franchiseName: string | null; franchiseAbbr: string | null }> = {}
  if (activeSeason) {
    const { data: members } = await adminClient
      .from('league_members')
      .select('user_id, franchises(name, abbreviation)')
      .eq('season_id', activeSeason.id)

    for (const m of (members ?? [])) {
      const f = m.franchises as unknown as { name: string; abbreviation: string } | null
      franchiseMap[m.user_id] = { franchiseName: f?.name ?? null, franchiseAbbr: f?.abbreviation ?? null }
    }
  }

  const enriched = (users as Array<{ id: string; email?: string; created_at: string; last_sign_in_at?: string | null; email_confirmed_at?: string | null }>).map(u => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    email_confirmed_at: u.email_confirmed_at,
    display_name: profileMap[u.id]?.display_name ?? null,
    role: profileMap[u.id]?.role ?? 'gm',
    franchiseName: franchiseMap[u.id]?.franchiseName ?? null,
    franchiseAbbr: franchiseMap[u.id]?.franchiseAbbr ?? null,
  }))

  return NextResponse.json({ users: enriched })
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const { userId } = await request.json()
  if (!userId) return NextResponse.json({ error: 'userId richiesto' }, { status: 400 })
  if (userId === admin.id) return NextResponse.json({ error: 'Non puoi eliminare il tuo account' }, { status: 400 })

  const adminClient = createAdminClient()
  const { error } = await adminClient.auth.admin.deleteUser(userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

// PATCH: update user role or reset password
export async function PATCH(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const body = await request.json()
  const { userId, action } = body

  if (!userId) return NextResponse.json({ error: 'userId richiesto' }, { status: 400 })

  const adminClient = createAdminClient()

  // Reset password
  if (action === 'reset_password') {
    const { password } = body
    if (!password || password.length < 6) return NextResponse.json({ error: 'Password di almeno 6 caratteri' }, { status: 400 })
    const { error } = await adminClient.auth.admin.updateUserById(userId, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Change role
  const { role } = body
  if (!role) return NextResponse.json({ error: 'role richiesto' }, { status: 400 })
  if (!['gm', 'admin'].includes(role)) return NextResponse.json({ error: 'Ruolo non valido' }, { status: 400 })
  if (userId === admin.id && role !== 'admin') return NextResponse.json({ error: 'Non puoi rimuovere i tuoi privilegi admin' }, { status: 400 })

  const { error } = await adminClient
    .from('profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
