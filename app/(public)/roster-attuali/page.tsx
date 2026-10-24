import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import TeamLogo from '@/components/TeamLogo'

export const revalidate = 300

type Franchise = { id: string; name: string; abbreviation: string; conference: string; division: string }

export default async function RosterAttualiPage() {
  const admin = createAdminClient()
  const { data: franchises } = await admin
    .from('franchises')
    .select('id, name, abbreviation, conference, division, sort_order')
    .order('sort_order')

  const list = (franchises ?? []) as Franchise[]
  const groups = ['East', 'West'].map(conf => ({
    conference: conf,
    teams: list.filter(f => f.conference === conf),
  }))

  return (
    <section className="space-y-10">
      <h2 className="font-display text-3xl font-black tracking-wide" style={{ color: 'var(--gold)' }}>ROSTER ATTUALI</h2>
      <p className="text-sm" style={{ color: 'var(--text-sec)' }}>Seleziona una franchigia per vedere il roster.</p>

      {groups.map(group => (
        <div key={group.conference} className="space-y-3">
          <h3 className="font-display text-lg font-bold tracking-widest" style={{ color: 'var(--text)' }}>
            {group.conference === 'East' ? 'EST' : 'OVEST'}
          </h3>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
            {group.teams.map(team => (
              <Link
                key={team.id}
                href={`/roster-attuali/${team.id}`}
                className="rounded-xl p-4 flex flex-col items-center gap-3 transition-colors hover:brightness-110"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <TeamLogo team={team.name} size={72} />
                <div className="font-display text-sm font-bold tracking-wide" style={{ color: 'var(--text)' }}>{team.abbreviation}</div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
