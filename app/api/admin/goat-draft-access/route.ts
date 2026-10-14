import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, error: NextResponse.json({ error: 'Non autenticato' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { supabase, user, error: NextResponse.json({ error: 'Accesso negato' }, { status: 403 }) }
  return { supabase, user, error: null }
}

// GET /api/admin/goat-draft-access — list all requests with user info
export async function GET() {
  const { supabase, error } = await requireAdmin()
  if (error) return error

  const { data: requests } = await supabase
    .from('dunkest_draft_access')
    .select('id, user_id, status, requested_at, reviewed_at')
    .order('requested_at', { ascending: false })

  if (!requests) return NextResponse.json({ requests: [] })

  // Fetch display names from profiles
  const userIds = requests.map(r => r.user_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds)

  // Fetch emails from admin users API
  const { data: adminUsers } = await supabase.auth.admin.listUsers()
  const emailMap: Record<string, string> = {}
  for (const u of adminUsers?.users ?? []) emailMap[u.id] = u.email ?? ''

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p.display_name]))

  const enriched = requests.map(r => ({
    ...r,
    display_name: profileMap.get(r.user_id) ?? null,
    email: emailMap[r.user_id] ?? null,
  }))

  return NextResponse.json({ requests: enriched })
}

// PATCH /api/admin/goat-draft-access — approve or reject a request
export async function PATCH(request: Request) {
  const { supabase, user, error } = await requireAdmin()
  if (error) return error

  const { id, action } = await request.json()
  if (!id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'id e action (approve|reject) richiesti' }, { status: 400 })
  }

  const status = action === 'approve' ? 'approved' : 'rejected'
  const { error: upErr } = await supabase
    .from('dunkest_draft_access')
    .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: user!.id })
    .eq('id', id)

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  return NextResponse.json({ success: true, status })
}
