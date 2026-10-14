import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getSessionState } from '@/lib/dunkest/draft'

// GET /api/goat-draft/[id] — full session state
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const state = await getSessionState(id)
  if (!state) return NextResponse.json({ error: 'Sessione non trovata' }, { status: 404 })
  return NextResponse.json(state)
}
