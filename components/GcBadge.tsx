'use client'

import { useEffect, useState } from 'react'

// Saldo GC sempre visibile nell'intestazione delle pagine del GM.
// Legge il saldo da /api/gm-credits; se l'utente non è un GM mostra nulla.
export default function GcBadge() {
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/gm-credits')
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (j && typeof j.balance === 'number') setBalance(j.balance) })
      .catch(() => {})
  }, [])

  if (balance === null) return null

  return (
    <div className="text-xs font-bold px-2.5 py-1 rounded-lg" style={{ background: 'var(--gold-bg)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }}>
      {balance} GC
    </div>
  )
}
