import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createSession, startSession } from '@/lib/dunkest/draft'

const BOT_NAMES = ['Bot 1', 'Bot 2', 'Bot 3', 'Bot 4', 'Bot 5', 'Bot 6', 'Bot 7']
const BOT_EMAILS = BOT_NAMES.map((_, i) => `dunkest-bot-${i + 1}@demo.internal`)

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, adminSupabase: null, user: null, error: NextResponse.json({ error: 'Non autenticato' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role, display_name').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { supabase, adminSupabase: null, user, error: NextResponse.json({ error: 'Solo gli admin' }, { status: 403 }) }
  const adminSupabase = createAdminClient()
  return { supabase, adminSupabase, user, profile, error: null }
}

async function getOrCreateBot(adminSupabase: ReturnType<typeof createAdminClient>, email: string, name: string): Promise<string> {
  const { data: list } = await adminSupabase.auth.admin.listUsers({ perPage: 1000 })
  const existing = (list?.users ?? []).find((u: { email?: string }) => u.email === email)
  if (existing) return existing.id

  const { data, error } = await adminSupabase.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
  })
  if (error) throw new Error(`Bot creation failed: ${error.message}`)
  const botId = data.user.id
  await adminSupabase.from('profiles').update({ display_name: name, role: 'gm' }).eq('id', botId)
  return botId
}

// POST — create and start a demo session (admin + 7 bots)
export async function POST() {
  const { supabase, adminSupabase, user, profile, error } = await requireAdmin()
  if (error || !adminSupabase || !user) return error!

  // Get or create 7 bots
  const botIds: string[] = []
  for (let i = 0; i < 7; i++) {
    const id = await getOrCreateBot(adminSupabase, BOT_EMAILS[i], BOT_NAMES[i])
    botIds.push(id)
  }

  // Auto-approve bots in dunkest_draft_access
  const now = new Date().toISOString()
  await adminSupabase.from('dunkest_draft_access').upsert(
    botIds.map(id => ({ user_id: id, status: 'approved', requested_at: now, reviewed_at: now, reviewed_by: user.id })),
    { onConflict: 'user_id' },
  )

  const allIds = [user.id, ...botIds]
  const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', allIds)
  const displayNames: Record<string, string> = {}
  for (const p of profiles ?? []) displayNames[p.id] = p.display_name ?? p.id
  if (!displayNames[user.id]) displayNames[user.id] = (profile as { display_name?: string })?.display_name ?? 'Admin'
  for (let i = 0; i < 7; i++) if (!displayNames[botIds[i]]) displayNames[botIds[i]] = BOT_NAMES[i]

  const result = await createSession({
    name: `Demo ${new Date().toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
    participantUserIds: allIds,
    participantDisplayNames: displayNames,
    createdBy: user.id,
  })
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })

  await startSession(result.id)
  await adminSupabase.from('goat_draft_sessions').update({ is_demo: true }).eq('id', result.id)

  return NextResponse.json({ id: result.id })
}

// DELETE ?sessionId=... — remove demo session
export async function DELETE(request: Request) {
  const { adminSupabase, error } = await requireAdmin()
  if (error || !adminSupabase) return error!

  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId')
  if (!sessionId) return NextResponse.json({ error: 'sessionId richiesto' }, { status: 400 })

  const { data: session } = await adminSupabase
    .from('goat_draft_sessions').select('is_demo').eq('id', sessionId).single()
  if (!session?.is_demo) return NextResponse.json({ error: 'Non è una sessione demo' }, { status: 400 })

  await adminSupabase.from('goat_draft_picks').delete().eq('session_id', sessionId)
  await adminSupabase.from('goat_draft_participants').delete().eq('session_id', sessionId)
  await adminSupabase.from('goat_draft_sessions').delete().eq('id', sessionId)

  return NextResponse.json({ success: true })
}
