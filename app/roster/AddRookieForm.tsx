'use client'

import { useState } from 'react'

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C']

interface Props {
  onAdded: () => void
  onError: (msg: string) => void
}

// Rookie creati nel gioco: non sono in NBA2K API, quindi si inseriscono a mano.
export default function AddRookieForm({ onAdded, onError }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [overall, setOverall] = useState('')
  const [draftYear, setDraftYear] = useState('2027')
  const [positions, setPositions] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  function togglePosition(p: string) {
    setPositions(prev => (prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]))
  }

  async function submit() {
    setBusy(true)
    const res = await fetch('/api/roster/rookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, overall: Number(overall), draftYear: Number(draftYear), positions }),
    })
    const json = await res.json()
    setBusy(false)
    if (!res.ok) { onError(json.error ?? 'Errore'); return }
    setName(''); setOverall(''); setPositions([]); setOpen(false)
    onAdded()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl py-3 text-sm"
        style={{ border: '1px dashed var(--border2)', color: 'var(--gold)' }}
      >
        + Aggiungi rookie creato nel gioco
      </button>
    )
  }

  const inputStyle = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
        Rookie della classe draft creata nel gioco (2027 o successiva). Non presente nell&apos;API NBA2K.
      </p>
      <input placeholder="Nome" value={name} onChange={e => setName(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
      <div className="flex gap-3">
        <input placeholder="Overall (40–99)" type="number" value={overall} onChange={e => setOverall(e.target.value)} className="flex-1 rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        <input placeholder="Anno draft" type="number" min={2027} value={draftYear} onChange={e => setDraftYear(e.target.value)} className="flex-1 rounded-lg px-3 py-2 text-sm" style={inputStyle} />
      </div>
      <div className="flex gap-2">
        {POSITIONS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => togglePosition(p)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold"
            style={{
              background: positions.includes(p) ? 'var(--gold)' : 'var(--surface2)',
              color: positions.includes(p) ? '#000' : 'var(--text-sec)',
              border: '1px solid var(--border)',
            }}
          >{p}</button>
        ))}
      </div>
      <div className="flex gap-3">
        <button onClick={() => setOpen(false)} className="flex-1 rounded-lg py-2 text-sm" style={{ border: '1px solid var(--border)', color: 'var(--text-sec)' }}>Annulla</button>
        <button
          onClick={submit}
          disabled={busy || !name || !overall || positions.length === 0}
          className="flex-1 rounded-lg py-2 text-sm font-bold disabled:opacity-50"
          style={{ background: 'var(--gold)', color: '#000' }}
        >{busy ? '...' : 'Aggiungi al roster'}</button>
      </div>
    </div>
  )
}
