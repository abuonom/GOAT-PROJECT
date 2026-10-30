'use client'

import { useEffect, useMemo, useState } from 'react'
import { addPlayerToRoster } from '@/lib/league/roster'

// Ricerca giocatori dentro la pagina roster: cerca per nome e aggiunge al roster con un tocco.
// La lista arriva già ordinata dal server (/api/players/scored).

interface Candidate {
  slug: string
  name: string
  overall: number
  positions: string[]
}

interface Props {
  rosterSlugs: string[]
  onAdded: () => void
  onMessage: (msg: string, ok: boolean) => void
}

export default function PlayerSearch({ rosterSlugs, onAdded, onMessage }: Props) {
  const [all, setAll] = useState<Candidate[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [limit, setLimit] = useState(20)

  useEffect(() => {
    fetch('/api/players/scored', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weights: {} }),
    })
      .then(r => r.json())
      .then(j => { if (j.success) setAll(j.data) })
  }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all
      .filter(p => !rosterSlugs.includes(p.slug))
      .filter(p => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => b.overall - a.overall)
  }, [all, query, rosterSlugs])

  async function add(slug: string, name: string) {
    setBusy(slug)
    const res = await addPlayerToRoster(slug)
    setBusy(null)
    if (res.error) { onMessage(res.error, false); return }
    onMessage(`${name} aggiunto al roster`, true)
    onAdded()
  }

  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-black tracking-wide" style={{ color: 'var(--text)' }}>Aggiungi giocatori</h2>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setLimit(20) }}
        placeholder="Cerca per nome…"
        className="w-full rounded-lg px-3 py-2 text-sm"
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
      />
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {results.slice(0, limit).map(p => (
          <div key={p.slug} className="flex items-center gap-3 px-4 py-3" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
            <span className="font-display text-xl font-black w-10" style={{ color: 'var(--gold)' }}>{p.overall}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{p.name}</span>
              <span className="block text-xs" style={{ color: 'var(--text-sec)' }}>{p.positions.join(' / ')}</span>
            </span>
            <button
              onClick={() => add(p.slug, p.name)}
              disabled={busy !== null}
              className="text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50"
              style={{ background: 'var(--gold)', color: '#000' }}
            >
              {busy === p.slug ? '…' : '+ Aggiungi'}
            </button>
          </div>
        ))}
        {results.length === 0 && (
          <p className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-sec)' }}>Nessun giocatore trovato.</p>
        )}
      </div>
      {results.length > limit && (
        <button onClick={() => setLimit(l => l + 20)} className="w-full text-xs py-2 rounded-lg" style={{ color: 'var(--gold)', border: '1px solid var(--border)' }}>
          Mostra altri
        </button>
      )}
    </section>
  )
}
