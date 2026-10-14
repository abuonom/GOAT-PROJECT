import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createSession } from '@/lib/dunkest/draft'

// GET /api/goat-draft — list all sessions
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { data, error } = await supabase
    .from('goat_draft_sessions')
    .select('id, name, status, current_round, total_picks, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sessions: data ?? [] })
}

// POST /api/goat-draft — create new session (admin only)
// Body: { name, otherUserIds: string[] }  — admin is auto-included, otherUserIds must have exactly 7 approved users
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Solo gli admin possono creare sessioni' }, { status: 403 })

  const body = await request.json()
  const { name, otherUserIds } = body

  if (!name?.trim()) return NextResponse.json({ error: 'Nome sessione richiesto' }, { status: 400 })
  if (!Array.isArray(otherUserIds) || otherUserIds.length !== 7) {
    return NextResponse.json({ error: 'Seleziona esattamente 7 partecipanti (l\'admin è aggiunto automaticamente)' }, { status: 400 })
  }
  if (otherUserIds.includes(user.id)) {
    return NextResponse.json({ error: 'Non includere l\'admin nella lista: viene aggiunto automaticamente' }, { status: 400 })
  }

  // Verify all 7 other users are approved
  const { data: accessRows } = await supabase
    .from('dunkest_draft_access')
    .select('user_id, status')
    .in('user_id', otherUserIds)

  const approvedIds = new Set((accessRows ?? []).filter(r => r.status === 'approved').map(r => r.user_id))
  const notApproved = otherUserIds.filter(id => !approvedIds.has(id))
  if (notApproved.length > 0) {
    return NextResponse.json({ error: 'Alcuni utenti selezionati non sono approvati per il Dunkest Draft' }, { status: 400 })
  }

  // Build full participant list: admin + 7 others
  const allIds = [user.id, ...otherUserIds]

  // Fetch display names
  const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', allIds)
  const { data: adminUsers } = await supabase.auth.admin.listUsers()
  const emailMap: Record<string, string> = {}
  for (const u of adminUsers?.users ?? []) emailMap[u.id] = u.email ?? ''

  const displayNames: Record<string, string> = {}
  for (const p of profiles ?? []) {
    displayNames[p.id] = p.display_name ?? emailMap[p.id] ?? p.id
  }
  // Ensure admin name is always set
  if (!displayNames[user.id]) displayNames[user.id] = profile.display_name ?? emailMap[user.id] ?? 'Admin'

  const result = await createSession({
    name: name.trim(),
    participantUserIds: allIds,
    participantDisplayNames: displayNames,
    createdBy: user.id,
  })

  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ id: result.id })
}
