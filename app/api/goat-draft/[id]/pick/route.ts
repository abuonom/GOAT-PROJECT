import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { makePick } from '@/lib/dunkest/draft'

// POST /api/goat-draft/[id]/pick — submit a pick
// Body: { participantId: string, dunkestPlayerId: number }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const body = await request.json()
  const { participantId, dunkestPlayerId } = body

  if (!participantId || !dunkestPlayerId) {
    return NextResponse.json({ error: 'participantId e dunkestPlayerId richiesti' }, { status: 400 })
  }
  if (typeof dunkestPlayerId !== 'number') {
    return NextResponse.json({ error: 'dunkestPlayerId deve essere un numero' }, { status: 400 })
  }

  const result = await makePick(sessionId, participantId, dunkestPlayerId, user.id)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ success: true, roundAdvanced: result.roundAdvanced ?? false })
}
