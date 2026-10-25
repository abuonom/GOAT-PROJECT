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

function Table({ title, rows, columns }: {
  title: string
  rows: Row[]
  columns: { label: string; value: (r: Row) => string | number; highlight: (r: Row) => boolean }[]
}) {
  return (
    <div className="space-y-3">
      <h3 className="font-display text-xl font-black tracking-wide" style={{ color: 'var(--text)' }}>{title}</h3>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--surface2)', color: 'var(--text-sec)' }}>
            <tr>
              <th className="text-left px-4 py-3">Giocatore</th>
              {columns.map(c => (
                <th key={c.label} className="text-center px-4 py-3">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.username} style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                <td className="px-4 py-3">
                  <span className="font-semibold" style={{ color: 'var(--text)' }}>{r.player_name}</span>
                  <span className="ml-2 text-xs" style={{ color: 'var(--text-dim)' }}>{r.username}</span>
                </td>
                {columns.map(c => (
                  <td
                    key={c.label}
                    className="px-4 py-3 text-center font-display font-black"
                    style={{ color: c.highlight(r) ? 'var(--gold)' : 'var(--text-sec)' }}
                  >
                    {c.value(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default async function AlboDoroPage() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('albo_doro')
    .select('username, player_name, wins, losses, ernesto_titles, nba_titles')

  const rows = (data ?? []) as Row[]
  // Solo i vincitori: chi ha 0 titoli non compare
  const nbaRows = rows
    .filter(r => r.nba_titles > 0)
    .sort((a, b) => b.nba_titles - a.nba_titles || a.player_name.localeCompare(b.player_name))
  const ernestoRows = rows
    .filter(r => r.ernesto_titles > 0)
    .sort((a, b) => b.ernesto_titles - a.ernesto_titles || b.wins - a.wins)

  return (
    <section className="space-y-10">
      <h2 className="font-display text-3xl font-black tracking-wide text-center" style={{ color: 'var(--gold)' }}>ALBO D&apos;ORO</h2>

      {rows.length === 0 ? (
        <p className="text-center text-sm" style={{ color: 'var(--text-sec)' }}>Nessun dato registrato.</p>
      ) : (
        <>
          <Table
            title="TITOLI NBA"
            rows={nbaRows}
            columns={[
              { label: 'Titoli', value: r => r.nba_titles, highlight: r => r.nba_titles > 0 },
            ]}
          />
          <Table
            title="ERNESTO CUP"
            rows={ernestoRows}
            columns={[
              { label: 'V–S', value: r => `${r.wins}–${r.losses}`, highlight: () => false },
              { label: 'Titoli', value: r => r.ernesto_titles, highlight: r => r.ernesto_titles > 0 },
            ]}
          />
        </>
      )}
    </section>
  )
}
