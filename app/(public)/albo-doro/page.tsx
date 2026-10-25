import { createAdminClient } from '@/lib/supabase/server'

export const revalidate = 300

type Row = { season_label: string; trophy: 'campione' | 'coppa'; winner_name: string }

export default async function AlboDoroPage() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('albo_doro')
    .select('season_label, trophy, winner_name')
    .order('season_label', { ascending: false })

  const rows = (data ?? []) as Row[]

  // Raggruppa per stagione: { '2026/27': { campione, coppa } }
  const bySeason = new Map<string, { campione?: string; coppa?: string }>()
  for (const r of rows) {
    const s = bySeason.get(r.season_label) ?? {}
    s[r.trophy] = r.winner_name
    bySeason.set(r.season_label, s)
  }

  return (
    <section className="space-y-8">
      <h2 className="font-display text-3xl font-black tracking-wide text-center" style={{ color: 'var(--gold)' }}>ALBO D&apos;ORO</h2>

      {bySeason.size === 0 ? (
        <p className="text-center text-sm" style={{ color: 'var(--text-sec)' }}>Nessun campione registrato.</p>
      ) : (
        <div className="space-y-3">
          {[...bySeason.entries()].map(([season, w]) => (
            <div key={season} className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="font-display text-sm font-bold tracking-widest mb-3" style={{ color: 'var(--text-sec)' }}>{season}</div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-[10px] tracking-widest" style={{ color: 'var(--gold)' }}>CAMPIONE</div>
                  <div className="font-display text-xl font-black" style={{ color: 'var(--text)' }}>{w.campione ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] tracking-widest" style={{ color: 'var(--gold)' }}>ERNESTO CUP</div>
                  <div className="font-display text-xl font-black" style={{ color: 'var(--text)' }}>{w.coppa ?? '—'}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
