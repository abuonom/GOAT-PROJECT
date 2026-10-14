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
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Solo gli admin possono creare sessioni' }, { status: 403 })

  const body = await request.json()
  const { name, participantUserIds, participantDisplayNames } = body

  if (!name?.trim()) return NextResponse.json({ error: 'Nome sessione richiesto' }, { status: 400 })
  if (!Array.isArray(participantUserIds) || participantUserIds.length !== 8) {
    return NextResponse.json({ error: 'Servono esattamente 8 partecipanti' }, { status: 400 })
  }

  const result = await createSession({
    name: name.trim(),
    participantUserIds,
    participantDisplayNames: participantDisplayNames ?? {},
    createdBy: user.id,
  })

  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ id: result.id })
}
