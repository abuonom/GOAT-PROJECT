'use client'

import { useState } from 'react'

// Interruttore di una funzionalità, solo per il superadmin.
// Disattivata = la funzionalità non compare per nessuno.
interface Props {
  label: string
  flagKey: string
  initial: boolean
}

export default function FeatureToggle({ label, flagKey, initial }: Props) {
  const [enabled, setEnabled] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/features/${flagKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !enabled }),
    })
    const json = await res.json()
    setBusy(false)
    if (json.error) { setError(json.error); return }
    setEnabled(json.enabled)
  }

  return (
    <div className="rounded-xl px-4 py-3 flex items-center justify-between gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div>
        <div className="font-display font-bold text-sm tracking-wide" style={{ color: 'var(--text)' }}>{label}</div>
        <div className="text-xs" style={{ color: enabled ? '#4ade80' : 'var(--text-dim)' }}>
          {enabled ? 'Attiva: visibile ai GM' : 'Disattiva: non visibile a nessuno'}
        </div>
        {error && <div className="text-xs" style={{ color: '#f87171' }}>{error}</div>}
      </div>
      <button
        onClick={toggle}
        disabled={busy}
        className="text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50"
        style={{ background: enabled ? 'rgba(239,68,68,0.12)' : 'rgba(74,222,128,0.12)', color: enabled ? '#f87171' : '#4ade80', border: '1px solid var(--border)' }}
      >
        {busy ? '…' : enabled ? 'Disattiva' : 'Attiva'}
      </button>
    </div>
  )
}
