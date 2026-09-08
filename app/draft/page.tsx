'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Player } from '@/types/nba'
import { useSavedPlayers } from '@/hooks/useSavedPlayers'
import { PlayerExtra } from '@/hooks/usePotentials'
import { ContractEntry } from '@/app/api/contracts/route'

interface DraftPlayer {
  rank: number
  pick: string
  name: string
  slug: string
  positions: string[]
  height: string
  teamAbbr: string
  overall: number
  draftYear: number
}

const DRAFT_YEARS = [2026, 2025, 2024, 2023, 2022, 2021]

const POTENTIAL_STYLE: Record<string, { color: string; bg: string }> = {
  'A+': { color: '#fde047', bg: 'rgba(234,179,8,0.15)' },
  'A':  { color: '#86efac', bg: 'rgba(34,197,94,0.12)' },
  'A-': { color: '#4ade80', bg: 'rgba(34,197,94,0.08)' },
  'B+': { color: '#93c5fd', bg: 'rgba(59,130,246,0.12)' },
  'B':  { color: '#7dd3fc', bg: 'rgba(14,165,233,0.1)' },
  'B-': { color: '#60a5fa', bg: 'rgba(59,130,246,0.07)' },
  'C+': { color: '#cbd5e1', bg: 'rgba(148,163,184,0.1)' },
  'C':  { color: '#94a3b8', bg: 'rgba(100,116,139,0.1)' },
  'D':  { color: '#fca5a5', bg: 'rgba(239,68,68,0.1)' },
}

const POT_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D']

const POS_STYLE: Record<string, { color: string; background: string }> = {
  'PG':      { color: '#60a5fa', background: 'rgba(59,130,246,0.15)' },
  'SG':      { color: '#a78bfa', background: 'rgba(139,92,246,0.15)' },
  'SF':      { color: '#4ade80', background: 'rgba(34,197,94,0.15)' },
  'PF':      { color: '#fb923c', background: 'rgba(249,115,22,0.15)' },
  'C':       { color: '#f87171', background: 'rgba(239,68,68,0.15)' },
  'default': { color: 'var(--text-sec)', background: 'var(--surface2)' },
}

function ovrColor(ovr: number) {
  if (ovr >= 90) return 'var(--ovr-a)'
  if (ovr >= 85) return 'var(--ovr-b)'
  if (ovr >= 80) return 'var(--ovr-c)'
  return 'var(--ovr-d)'
}

function formatSalary(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  return `$${(n / 1_000).toFixed(0)}K`
}

function matchContract(name: string, contracts: ContractEntry[]): ContractEntry | null {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const n = norm(name)
  return contracts.find(c => norm(c.name) === n) ??
    contracts.find(c => norm(c.name).includes(n) || n.includes(norm(c.name))) ??
    null
}

type LoadStep = { label: string; done: boolean }

export default function DraftPage() {
  const [selectedYears, setSelectedYears] = useState<number[]>([2026, 2025, 2024, 2023])
  const [sortBy, setSortBy] = useState<'overall' | 'potential' | 'pick'>('overall')
  const [filterYear, setFilterYear] = useState<number | 'all'>('all')

  // All data
  const [players, setPlayers] = useState<DraftPlayer[]>([])
  const [potentials, setPotentials] = useState<Map<string, PlayerExtra>>(new Map())
  const [contracts, setContracts] = useState<ContractEntry[]>([])

  // Loading state
  const [steps, setSteps] = useState<LoadStep[]>([])
  const [ready, setReady] = useState(false)
  const loadedYears = useRef(new Set<number>())

  const { isSaved, savePlayer, removePlayer } = useSavedPlayers()

  const markStep = (label: string) =>
    setSteps(prev => prev.map(s => s.label === label ? { ...s, done: true } : s))

  const loadAll = useCallback(async (years: number[]) => {
    const toFetch = years.filter(y => !loadedYears.current.has(y))
    if (toFetch.length === 0 && contracts.length > 0) return

    setReady(false)

    const stepList: LoadStep[] = [
      ...toFetch.map(y => ({ label: `Draft ${y}`, done: false })),
      { label: 'Contratti', done: contracts.length > 0 },
      { label: 'Potenziali', done: false },
    ]
    setSteps(stepList)

    // 1. Fetch draft classes in parallel
    const draftResults = await Promise.all(
      toFetch.map(year =>
        fetch(`/api/draft/${year}`)
          .then(r => r.json())
          .then(d => {
            markStep(`Draft ${year}`)
            if (d.success) return (d.data as DraftPlayer[]).map((p: DraftPlayer) => ({ ...p, draftYear: year }))
            return []
          })
          .catch(() => { markStep(`Draft ${year}`); return [] })
      )
    )

    const newPlayers = draftResults.flat()
    toFetch.forEach(y => loadedYears.current.add(y))

    setPlayers(prev => {
      const existing = prev.filter(p => !toFetch.includes(p.draftYear))
      return [...existing, ...newPlayers]
    })

    // 2. Fetch contracts (if not already loaded)
    let contractData = contracts
    if (contractData.length === 0) {
      contractData = await fetch('/api/contracts')
        .then(r => r.json())
        .then(d => { markStep('Contratti'); return d.success ? d.data : [] })
        .catch(() => { markStep('Contratti'); return [] })
      setContracts(contractData)
    }

    // 3. Fetch potentials for all players (including already-loaded years)
    const allCurrentPlayers = [
      ...players.filter(p => !toFetch.includes(p.draftYear)),
      ...newPlayers,
    ]
    const allSlugs = [...new Set(allCurrentPlayers.map(p => p.slug))]
    const CHUNK = 50
    const chunks: string[][] = []
    for (let i = 0; i < allSlugs.length; i += CHUNK) chunks.push(allSlugs.slice(i, i + CHUNK))

    const potResults = await Promise.all(
      chunks.map(chunk =>
        fetch(`/api/players/potentials?slugs=${chunk.join(',')}`)
          .then(r => r.json())
          .catch(() => ({}))
      )
    )
    const potMap = new Map<string, PlayerExtra>()
    for (const batch of potResults) {
      for (const [slug, val] of Object.entries(batch)) potMap.set(slug, val as PlayerExtra)
    }
    markStep('Potenziali')
    setPotentials(potMap)
    setReady(true)
  }, [contracts, players])

  // Initial load
  useEffect(() => {
    loadAll(selectedYears)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleYear = (y: number) => {
    const next = selectedYears.includes(y)
      ? selectedYears.filter(x => x !== y)
      : [...selectedYears, y]
    setSelectedYears(next)
    loadAll(next)
  }

  const visiblePlayers = useMemo(() => {
    let list = players.filter(p => selectedYears.includes(p.draftYear))
    if (filterYear !== 'all') list = list.filter(p => p.draftYear === filterYear)
    return list
  }, [players, selectedYears, filterYear])

  const sorted = useMemo(() => {
    return [...visiblePlayers].sort((a, b) => {
      if (sortBy === 'overall') return b.overall - a.overall
      if (sortBy === 'pick') return a.rank - b.rank
      if (sortBy === 'potential') {
        const pa = potentials.get(a.slug)?.potential
        const pb = potentials.get(b.slug)?.potential
        const ia = pa ? POT_ORDER.indexOf(pa) : 99
        const ib = pb ? POT_ORDER.indexOf(pb) : 99
        return ia !== ib ? ia - ib : b.overall - a.overall
      }
      return 0
    })
  }, [visiblePlayers, sortBy, potentials])

  // Loading screen
  if (!ready) {
    const done = steps.filter(s => s.done).length
    const total = steps.length
    const pct = total > 0 ? Math.round((done / total) * 100) : 0

    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-8"
        style={{ background: 'var(--bg)' }}
      >
        <div className="text-center">
          <div className="font-display text-4xl font-black tracking-widest" style={{ color: 'var(--gold)' }}>
            DRAFT TOOL
          </div>
          <div className="text-sm mt-2" style={{ color: 'var(--text-sec)' }}>
            Caricamento dati in corso...
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-64">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: 'var(--gold)' }}
            />
          </div>
          <div className="text-xs mt-2 text-center" style={{ color: 'var(--text-dim)' }}>{pct}%</div>
        </div>

        {/* Steps */}
        <div className="space-y-2 w-56">
          {steps.map(step => (
            <div key={step.label} className="flex items-center gap-3">
              <div
                className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[10px] font-black transition-colors duration-300"
                style={step.done
                  ? { background: 'var(--gold)', color: '#000' }
                  : { background: 'var(--border)', color: 'transparent' }
                }
              >
                {step.done ? '✓' : ''}
              </div>
              {!step.done && (
                <div
                  className="w-3 h-3 rounded-full border-2 animate-spin absolute ml-0.5"
                  style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent', display: step.done ? 'none' : undefined }}
                />
              )}
              <span className="text-sm" style={{ color: step.done ? 'var(--text)' : 'var(--text-sec)' }}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }} className="sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-xs font-medium transition-colors" style={{ color: 'var(--text-sec)' }}>
              ← Lista
            </a>
            <span style={{ color: 'var(--border)' }}>|</span>
            <h1 className="font-display text-2xl font-bold tracking-wider" style={{ color: 'var(--gold)' }}>
              DRAFT
            </h1>
            <span className="font-display text-2xl font-bold tracking-wide" style={{ color: 'var(--text)' }}>
              TOOL
            </span>
          </div>
          <span className="text-xs" style={{ color: 'var(--text-sec)' }}>
            {sorted.length} giocatori
          </span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        {/* Controls */}
        <div
          className="rounded-xl p-4 flex flex-wrap gap-4 items-end"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {/* Anno draft */}
          <div>
            <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text-dim)' }}>Classi Draft</div>
            <div className="flex gap-1.5">
              {DRAFT_YEARS.map(y => (
                <button
                  key={y}
                  onClick={() => toggleYear(y)}
                  className="text-xs font-bold px-3 py-1.5 rounded transition-colors"
                  style={selectedYears.includes(y)
                    ? { background: 'var(--gold)', color: '#000', border: '1px solid var(--gold)' }
                    : { background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }
                  }
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          {/* Filtro singolo anno */}
          <div>
            <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text-dim)' }}>Mostra</div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setFilterYear('all')}
                className="text-xs font-bold px-3 py-1.5 rounded transition-colors"
                style={filterYear === 'all'
                  ? { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border2)' }
                  : { background: 'transparent', color: 'var(--text-sec)', border: '1px solid var(--border)' }
                }
              >
                Tutti
              </button>
              {selectedYears.map(y => (
                <button
                  key={y}
                  onClick={() => setFilterYear(y)}
                  className="text-xs font-bold px-3 py-1.5 rounded transition-colors"
                  style={filterYear === y
                    ? { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border2)' }
                    : { background: 'transparent', color: 'var(--text-sec)', border: '1px solid var(--border)' }
                  }
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          {/* Sort */}
          <div className="ml-auto">
            <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text-dim)' }}>Ordina per</div>
            <div className="flex gap-1.5">
              {([['overall', 'OVR'], ['potential', 'POT'], ['pick', 'Pick']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setSortBy(val)}
                  className="text-xs font-bold px-3 py-1.5 rounded transition-colors"
                  style={sortBy === val
                    ? { background: 'rgba(232,160,32,0.15)', color: 'var(--gold)', border: '1px solid rgba(232,160,32,0.35)' }
                    : { background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Column headers */}
        <div
          className="hidden md:grid gap-3 px-4 pb-2 text-[10px] font-semibold uppercase tracking-widest"
          style={{
            color: 'var(--text-dim)',
            borderBottom: '1px solid var(--border)',
            gridTemplateColumns: '2.5rem 3.5rem 1fr 3.5rem 3rem 3.5rem 1fr 4rem',
          }}
        >
          <span>Pick</span><span>OVR</span><span>Giocatore</span>
          <span>Anno</span><span>POT</span><span>Età</span>
          <span>Contratto</span><span></span>
        </div>

        {/* Rows */}
        <div className="space-y-1.5">
          {sorted.map(player => {
            const extra = potentials.get(player.slug)
            const potential = extra?.potential
            const age = extra?.age
            const contract = matchContract(player.name, contracts)
            const ps = potential ? POTENTIAL_STYLE[potential] : null

            const fakePlayer: Player = {
              name: player.name, slug: player.slug, team: player.teamAbbr,
              teamType: 'curr', overall: player.overall, positions: player.positions,
              attributes: {}, badges: {},
            }

            return (
              <div
                key={`${player.slug}-${player.draftYear}`}
                className="rounded-lg px-4 py-3 md:grid gap-3 items-center transition-colors hover:border-[var(--border2)]"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  gridTemplateColumns: '2.5rem 3.5rem 1fr 3.5rem 3rem 3.5rem 1fr 4rem',
                }}
              >
                <div className="font-display text-base font-bold" style={{ color: 'var(--text-sec)' }}>
                  {player.pick}
                </div>

                <div
                  className="font-display text-3xl font-bold leading-none cursor-pointer"
                  style={{ color: ovrColor(player.overall) }}
                  onClick={() => window.open(`/player/${player.slug}`, '_blank')}
                >
                  {player.overall}
                </div>

                <div className="cursor-pointer min-w-0" onClick={() => window.open(`/player/${player.slug}`, '_blank')}>
                  <div className="font-display text-lg font-bold leading-tight truncate" style={{ color: 'var(--text)' }}>
                    {player.name}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {[...new Set(player.positions)].map(pos => (
                      <span key={pos} className="text-[10px] font-black px-1.5 py-0.5 rounded tracking-wide"
                        style={POS_STYLE[pos] ?? POS_STYLE['default']}>
                        {pos}
                      </span>
                    ))}
                    <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                      {player.teamAbbr}{player.height ? ` · ${player.height}` : ''}
                    </span>
                  </div>
                </div>

                <div className="text-xs font-bold px-2 py-0.5 rounded text-center w-fit"
                  style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}>
                  {player.draftYear}
                </div>

                <div className="flex items-center justify-center">
                  {ps ? (
                    <span className="font-display text-base font-black px-2 py-0.5 rounded"
                      style={{ color: ps.color, background: ps.bg }}>
                      {potential}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-dim)' }}>—</span>
                  )}
                </div>

                <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  {age ?? '—'}
                </div>

                {/* Contract block */}
                <div className="min-w-0">
                  {contract ? (() => {
                    const s = contract.salaries[0]
                    const noteLabel: Record<string, string> = { PO: 'PO', TO: 'TO', QO: 'QO' }
                    const noteTitle: Record<string, string> = { PO: 'Player Option', TO: 'Team Option', QO: 'Qualifying Offer' }
                    return (
                      <div className="flex divide-x rounded-lg overflow-hidden text-center" style={{ border: '1px solid var(--border)' }}>
                        <div className="px-2 py-1 min-w-[48px]" style={{ background: 'var(--surface2)' }}>
                          <div className="text-[9px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: 'var(--text-dim)' }}>Durata</div>
                          <div className="font-display text-sm font-bold leading-none" style={{ color: 'var(--text)' }}>
                            {contract.years_remaining}<span className="text-[10px] font-normal ml-0.5" style={{ color: 'var(--text-sec)' }}>yr</span>
                          </div>
                        </div>
                        <div className="px-2 py-1 min-w-[68px]" style={{ background: 'var(--surface2)' }}>
                          <div className="text-[9px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: 'var(--text-dim)' }}>Valore</div>
                          <div className="font-display text-sm font-bold leading-none tabular-nums" style={{ color: 'var(--gold)' }}>
                            {formatSalary(s.amount)}<span className="text-[10px] font-normal ml-0.5" style={{ color: 'var(--text-sec)' }}>/yr</span>
                          </div>
                        </div>
                        <div className="px-2 py-1 min-w-[68px]" style={{ background: 'var(--surface2)' }}>
                          <div className="text-[9px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: 'var(--text-dim)' }}>Opzione</div>
                          {s.note && noteLabel[s.note] ? (
                            <span
                              className="font-display text-sm font-black px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--gold-bg2)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }}
                              title={noteTitle[s.note]}
                            >
                              {noteLabel[s.note]}
                            </span>
                          ) : (
                            <div className="text-[10px]" style={{ color: 'var(--text-sec)' }}>—</div>
                          )}
                        </div>
                      </div>
                    )
                  })() : (
                    <div
                      className="px-3 py-1 rounded-lg text-center inline-block"
                      style={{ border: '1px solid var(--border2)', background: 'var(--surface2)' }}
                    >
                      <span className="font-display text-sm font-black tracking-widest" style={{ color: 'var(--text-sec)' }}>FA</span>
                      <div className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>Free Agent</div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => isSaved(player.slug) ? removePlayer(player.slug) : savePlayer(fakePlayer)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap"
                  style={isSaved(player.slug)
                    ? { background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }
                    : { background: 'var(--gold-bg)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }
                  }
                >
                  {isSaved(player.slug) ? 'Rimuovi' : 'Salva'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
