import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'

export const revalidate = 300

type Player = { slug: string; name: string; overall: number; positions: string[] }

function ovrColor(ovr: number) {
  if (ovr >= 95) return '#fde047'
  if (ovr >= 90) return '#c084fc'
  if (ovr >= 85) return '#60a5fa'
  if (ovr >= 80) return '#4ade80'
  return 'var(--text)'
}

export default async function FranchiseRosterPage({
  params,
}: {
  params: Promise<{ franchiseId: string }>
}) {
  const { franchiseId } = await params
  const admin = createAdminClient()

  const { data: franchise } = await admin
    .from('franchises')
    .select('id, name, abbreviation')
    .eq('id', franchiseId)
    .single()
  if (!franchise) notFound()

  const { data: season } = await admin
    .from('seasons')
    .select('id')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const { data: memberships } = season
    ? await admin
        .from('roster_memberships')
        .select('player_slug')
        .eq('season_id', season.id)
        .eq('franchise_id', franchiseId)
        .eq('status', 'confirmed')
    : { data: [] as { player_slug: string }[] }

  const slugs = (memberships ?? []).map((m: { player_slug: string }) => m.player_slug)
  const { data: rows } = slugs.length
    ? await admin.from('players').select('slug, data').in('slug', slugs)
    : { data: [] as { slug: string; data: Record<string, unknown> }[] }

  const players: Player[] = (rows ?? [])
    .map((r: { slug: string; data: Record<string, unknown> }) => {
      const d = r.data as { name?: string; overall?: number; positions?: string[] }
      return {
        slug: r.slug,
        name: d.name ?? r.slug,
        overall: Number(d.overall ?? 0),
        positions: Array.isArray(d.positions) ? d.positions : [],
      }
    })
    .sort((a: Player, b: Player) => b.overall - a.overall)

  return (
    <section className="space-y-6">
      <Link href="/roster-attuali" className="text-sm underline" style={{ color: 'var(--gold)' }}>← Tutte le franchigie</Link>
      <h2 className="font-display text-3xl font-black tracking-wide" style={{ color: 'var(--gold)' }}>{franchise.name}</h2>

      {players.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-sec)' }}>Nessun giocatore confermato per questa franchigia.</p>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--surface2)', color: 'var(--text-sec)' }}>
              <tr>
                <th className="text-left px-4 py-3 w-20">Ovr</th>
                <th className="text-left px-4 py-3">Nome</th>
                <th className="text-left px-4 py-3">Posizione</th>
              </tr>
            </thead>
            <tbody>
              {players.map(p => (
                <tr key={p.slug} style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <td className="px-4 py-3 font-display font-black text-lg" style={{ color: ovrColor(p.overall) }}>{p.overall}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text)' }}>{p.name}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-sec)' }}>{p.positions.join(' / ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
