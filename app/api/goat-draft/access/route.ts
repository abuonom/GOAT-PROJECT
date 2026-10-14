import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/goat-draft/access — current user's access status
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'admin') return NextResponse.json({ status: 'approved', isAdmin: true })

  const { data } = await supabase
    .from('dunkest_draft_access')
    .select('status')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({ status: data?.status ?? 'none', isAdmin: false })
}

// POST /api/goat-draft/access — request access
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { error } = await supabase
    .from('dunkest_draft_access')
    .insert({ user_id: user.id })

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Richiesta già inviata' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
