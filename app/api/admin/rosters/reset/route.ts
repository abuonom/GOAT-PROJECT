import { createClient, createAdminClient } from '@/lib/supabase/server'
import { invalidateRoster } from '@/lib/league/roster-cache'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

// Svuota i roster della stagione attiva (tutte le franchigie).
// - Le righe di roster_memberships passano a 'released' (non vengono cancellate).
//   Vale per tutti i giocatori, rookie creati a mano compresi.
// - Restano intatti: upgrade e acquisti del GM Shop (tabelle separate) e la scheda
//   dei rookie nella tabella players.
// GET  → anteprima: quanti giocatori verrebbero rilasciati.
// POST → esegue lo svuotamento.

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return data?.role === 'admin' ? user : null
}

type Membership = { id: string; player_slug: string; franchise_id: string }

async function loadPlan() {
  const admin = createAdminClient()

  const { data: season } = await admin
    .from('seasons')
    .select('id, name')
    .eq('status', 'active')
    .single()
  if (!season) return { error: 'Nessuna stagione attiva' as const }

  const { data: memberships, error: memErr } = await admin
    .from('roster_memberships')
    .select('id, player_slug, franchise_id')
    .eq('season_id', season.id)
    .neq('status', 'released')
    .limit(5000)
  if (memErr) return { error: memErr.message }

  const toRelease = (memberships ?? []) as Membership[]

  return { admin, season, toRelease }
}

export async function GET() {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const plan = await loadPlan()
  if ('error' in plan) return NextResponse.json({ error: plan.error }, { status: 500 })

  return NextResponse.json({
    seasonName: plan.season.name,
    toRelease: plan.toRelease.length,
  })
}

export async function POST() {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const plan = await loadPlan()
  if ('error' in plan) return NextResponse.json({ error: plan.error }, { status: 500 })
  const { admin, season, toRelease } = plan

  if (toRelease.length === 0) {
    return NextResponse.json({ ok: true, released: 0 })
  }

  // Rilascio a blocchi per non superare i limiti di lunghezza della query
  const now = new Date().toISOString()
  const ids = toRelease.map(m => m.id)
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await admin
      .from('roster_memberships')
      .update({ status: 'released', released_at: now })
      .in('id', ids.slice(i, i + 200))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Cache dei roster dei GM coinvolti + pagine pubbliche dei roster
  const { data: members } = await admin
    .from('league_members')
    .select('user_id')
    .eq('season_id', season.id)
  for (const m of (members ?? []) as { user_id: string }[]) invalidateRoster(m.user_id, 'route')
  try {
    revalidatePath('/roster-attuali')
    revalidatePath('/roster-attuali/[franchiseId]', 'page')
  } catch {
    // Lo svuotamento è già salvato: le pagine si riallineano con il revalidate periodico
  }

  // Traccia nell'audit log (un errore qui non annulla l'operazione)
  await admin.from('audit_log').insert({
    event_type: 'roster_admin_modified',
    actor_id: adminUser.id,
    season_id: season.id,
    reason: 'Svuotamento di tutti i roster (backoffice)',
    metadata: { released: toRelease.length },
  })

  return NextResponse.json({ ok: true, released: toRelease.length })
}
