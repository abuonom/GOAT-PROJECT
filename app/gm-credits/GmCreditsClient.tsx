'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { GmCreditLedgerEntry } from '@/types/league'

interface GmCreditsData {
  balance: number
  gamesPlayed: number
  ledger: GmCreditLedgerEntry[]
  seasonName: string | null
  franchiseName: string | null
}

const GC_MILESTONES = [5, 10, 20, 30, 40, 50, 60, 70, 82]
const GC_TOTALS = [1, 2, 4, 6, 9, 12, 16, 20, 25]

function getNextMilestone(gamesPlayed: number) {
  const idx = GC_MILESTONES.findIndex(m => m > gamesPlayed)
  if (idx === -1) return null
  return { games: GC_MILESTONES[idx], gc: GC_TOTALS[idx] }
}

function typeLabel(type: GmCreditLedgerEntry['type']) {
  switch (type) {
    case 'earned':    return { label: 'Guadagnati', color: '#4ade80', sign: '+' }
    case 'spent':     return { label: 'Spesi',      color: '#f87171', sign: '' }
    case 'carryover': return { label: 'Riportati',  color: '#60a5fa', sign: '+' }
    case 'adjustment':return { label: 'Aggiustamento', color: '#fb923c', sign: '' }
  }
}

export default function GmCreditsClient() {
  const router = useRouter()
  const [data, setData] = useState<GmCreditsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [gamesInput, setGamesInput] = useState('')
  const [gamesSubmitting, setGamesSubmitting] = useState(false)
  const [showGamesForm, setShowGamesForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/gm-credits')
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function submitGames() {
    const g = parseInt(gamesInput)
    if (isNaN(g) || g < 0 || g > 82) return
    if (data && g < data.gamesPlayed) return
    setGamesSubmitting(true)
    const res = await fetch('/api/gm-credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gamesPlayed: g }),
    })
    const json = await res.json()
    setGamesSubmitting(false)
    if (json.error) { setShowGamesForm(false); return }
    setGamesInput('')
    setShowGamesForm(false)
    await load()
  }

  const nextMilestone = data ? getNextMilestone(data.gamesPlayed) : null
  const progressPct = nextMilestone && data
    ? Math.min(100, Math.round((data.gamesPlayed / nextMilestone.games) * 100))
    : 100

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header className="sticky top-0 z-40" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-xs font-semibold px-3 py-1.5 rounded"
              style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}
            >
              ← Dashboard
            </button>
            <div>
              <span className="font-display text-lg font-black tracking-wider" style={{ color: 'var(--text)' }}>
                GM CREDITS
              </span>
              {data?.seasonName && (
                <span className="ml-2 text-xs" style={{ color: 'var(--text-dim)' }}>{data.seasonName}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {loading ? (
          <div className="space-y-3">
            {[120, 80, 200].map(h => (
              <div key={h} className="rounded-xl animate-pulse" style={{ height: h, background: 'var(--surface)' }} />
            ))}
          </div>
        ) : !data ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-2">⚠️</p>
            <p className="font-display font-black" style={{ color: 'var(--text-sec)' }}>ERRORE CARICAMENTO</p>
          </div>
        ) : (
          <>
            {/* Balance card */}
            <div
              className="rounded-xl px-6 py-5 flex items-center justify-between"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div>
                {data.franchiseName && (
                  <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-dim)' }}>
                    {data.franchiseName.toUpperCase()}
                  </div>
                )}
                <div className="font-display text-5xl font-black" style={{ color: 'var(--gold)' }}>
                  {data.balance}
                </div>
                <div className="text-sm font-semibold mt-1" style={{ color: 'var(--text-sec)' }}>
                  GM Credits disponibili
                </div>
              </div>
              <div className="text-5xl opacity-30">💎</div>
            </div>

            {/* Self-report games played */}
            {!showGamesForm ? (
              <button
                onClick={() => { setShowGamesForm(true); setGamesInput(String(data.gamesPlayed)) }}
                className="w-full rounded-xl px-5 py-3 flex items-center justify-between transition-opacity"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <span className="text-sm font-semibold" style={{ color: 'var(--text-sec)' }}>
                  Aggiorna partite giocate
                </span>
                <span className="text-xs px-3 py-1.5 rounded font-semibold"
                  style={{ background: 'var(--gold-bg)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }}>
                  Modifica
                </span>
              </button>
            ) : (
              <div className="rounded-xl px-5 py-4 space-y-3"
                style={{ background: 'var(--surface)', border: '1px solid var(--gold-dim)' }}>
                <div>
                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-sec)' }}>
                    PARTITE GIOCATE QUESTA STAGIONE
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    Attuale: <strong style={{ color: 'var(--text)' }}>{data.gamesPlayed}</strong> — puoi solo aumentare il valore.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={data.gamesPlayed}
                    max={82}
                    value={gamesInput}
                    onChange={e => setGamesInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitGames()}
                    autoFocus
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-bold"
                    style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--gold)' }}
                  />
                  <button
                    onClick={submitGames}
                    disabled={gamesSubmitting || parseInt(gamesInput) <= data.gamesPlayed}
                    className="font-display font-black tracking-wide text-sm px-4 py-2 rounded-lg"
                    style={{
                      background: 'rgba(74,222,128,0.15)', color: '#4ade80',
                      border: '1px solid rgba(74,222,128,0.4)',
                      opacity: gamesSubmitting || parseInt(gamesInput) <= data.gamesPlayed ? 0.5 : 1,
                    }}
                  >
                    {gamesSubmitting ? '...' : 'SALVA'}
                  </button>
                  <button onClick={() => setShowGamesForm(false)}
                    className="text-sm px-3 py-2 rounded-lg"
                    style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}>
                    ✕
                  </button>
                </div>
                <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                  I crediti verranno assegnati automaticamente. L'admin verificherà la correttezza dei dati.
                </p>
              </div>
            )}

            {/* Games played + next milestone */}
            <div
              className="rounded-xl px-5 py-4 space-y-3"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-dim)' }}>PARTITE GIOCATE</div>
                  <div className="font-display text-2xl font-black" style={{ color: 'var(--text)' }}>
                    {data.gamesPlayed}
                    <span className="text-base font-normal ml-1" style={{ color: 'var(--text-dim)' }}>/82</span>
                  </div>
                </div>
                {nextMilestone ? (
                  <div className="text-right">
                    <div className="text-xs font-semibold" style={{ color: 'var(--text-dim)' }}>PROSSIMO MILESTONE</div>
                    <div className="font-display text-sm font-black" style={{ color: '#60a5fa' }}>
                      {nextMilestone.games} partite → {nextMilestone.gc} GC totali
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                      ancora {nextMilestone.games - data.gamesPlayed} partite
                    </div>
                  </div>
                ) : (
                  <div className="text-xs font-black" style={{ color: '#4ade80' }}>SEASON COMPLETA ✓</div>
                )}
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${progressPct}%`, background: nextMilestone ? '#60a5fa' : '#4ade80' }}
                />
              </div>

              {/* Milestone markers */}
              <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--text-dim)' }}>
                {GC_MILESTONES.map((g, i) => (
                  <span
                    key={g}
                    className="font-mono"
                    style={{ color: data.gamesPlayed >= g ? '#4ade80' : 'var(--text-dim)' }}
                  >
                    {g}g/{GC_TOTALS[i]}💎
                  </span>
                ))}
              </div>
            </div>

            {/* Ledger */}
            <div>
              <h2 className="font-display font-black tracking-wider text-sm mb-3" style={{ color: 'var(--text-sec)' }}>
                STORICO MOVIMENTI
              </h2>

              {data.ledger.length === 0 ? (
                <div
                  className="rounded-xl px-5 py-8 text-center"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <p className="text-3xl mb-2">💎</p>
                  <p className="font-display font-black text-sm" style={{ color: 'var(--text-sec)' }}>
                    NESSUN MOVIMENTO
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                    I GC verranno registrati qui quando raggiungi i milestone.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  {data.ledger.map((entry, i) => {
                    const t = typeLabel(entry.type)
                    const sign = entry.amount > 0 ? '+' : ''
                    return (
                      <div
                        key={entry.id}
                        className="flex items-center gap-3 px-4 py-3"
                        style={{
                          background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
                          borderBottom: i < data.ledger.length - 1 ? '1px solid var(--border)' : 'none',
                        }}
                      >
                        {/* Amount */}
                        <div
                          className="font-display text-xl font-black w-14 text-right shrink-0"
                          style={{ color: t.color }}
                        >
                          {sign}{entry.amount}
                        </div>

                        {/* Type + note */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-[10px] font-black px-1.5 py-0.5 rounded tracking-wide font-display"
                              style={{ background: `${t.color}18`, color: t.color, border: `1px solid ${t.color}44` }}
                            >
                              {t.label.toUpperCase()}
                            </span>
                          </div>
                          {entry.note && (
                            <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-dim)' }}>
                              {entry.note}
                            </div>
                          )}
                        </div>

                        {/* Date */}
                        <div className="text-xs shrink-0" style={{ color: 'var(--text-dim)' }}>
                          {new Date(entry.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
