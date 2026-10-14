import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { startSession } from '@/lib/dunkest/draft'

// POST /api/goat-draft/[id]/start — start the draft (admin only)
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Solo gli admin possono avviare il draft' }, { status: 403 })

  const result = await startSession(id)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ success: true })
}
