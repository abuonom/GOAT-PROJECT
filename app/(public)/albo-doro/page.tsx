import { createAdminClient } from '@/lib/supabase/server'

export const revalidate = 300

type Row = {
  username: string
  player_name: string
  wins: number
  losses: number
  ernesto_titles: number
  nba_titles: number
}

export default async function AlboDoroPage() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('albo_doro')
    .select('username, player_name, wins, losses, ernesto_titles, nba_titles')
    .order('ernesto_titles', { ascending: false })
    .order('wins', { ascending: false })

  const rows = (data ?? []) as Row[]

  return (
    <section className="space-y-6">
      <h2 className="font-display text-3xl font-black tracking-wide text-center" style={{ color: 'var(--gold)' }}>ALBO D&apos;ORO</h2>
      <p className="text-center text-sm" style={{ color: 'var(--text-sec)' }}>Ernesto Cup · In-Season Tournament</p>

      {rows.length === 0 ? (
        <p className="text-center text-sm" style={{ color: 'var(--text-sec)' }}>Nessun dato registrato.</p>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--surface2)', color: 'var(--text-sec)' }}>
              <tr>
                <th className="text-left px-4 py-3">Giocatore</th>
                <th className="text-center px-4 py-3">V–S</th>
                <th className="text-center px-4 py-3">Ernesto Cup</th>
                <th className="text-center px-4 py-3">Titoli NBA</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.username} style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <td className="px-4 py-3">
                    <span className="font-semibold" style={{ color: 'var(--text)' }}>{r.player_name}</span>
                    <span className="ml-2 text-xs" style={{ color: 'var(--text-dim)' }}>{r.username}</span>
                  </td>
                  <td className="px-4 py-3 text-center" style={{ color: 'var(--text-sec)' }}>{r.wins}–{r.losses}</td>
                  <td className="px-4 py-3 text-center font-display font-black" style={{ color: r.ernesto_titles > 0 ? 'var(--gold)' : 'var(--text-dim)' }}>{r.ernesto_titles}</td>
                  <td className="px-4 py-3 text-center font-display font-black" style={{ color: r.nba_titles > 0 ? 'var(--gold)' : 'var(--text-dim)' }}>{r.nba_titles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
