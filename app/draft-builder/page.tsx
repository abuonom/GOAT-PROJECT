'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Player } from '@/types/nba'
import { useSavedPlayers } from '@/hooks/useSavedPlayers'
import { useCapToasts } from '@/hooks/useCapToasts'
import type { ContractEntry } from '@/app/api/contracts/route'
import type { PlayerExtra } from '@/hooks/usePotentials'
import { scorePlayer, BuildWeights, DEFAULT_WEIGHTS, PlayerScore } from '@/lib/nba/playerScorer'
import SavedList from '@/components/SavedList'
import Toast from '@/components/Toast'
import { createClient } from '@/lib/supabase/client'
import { matchContract } from '@/lib/nba/matchContract'
import AttributeFilterPicker, { AttrFilter, ATTRS } from '@/components/AttributeFilterPicker'
import TeamLogo from '@/components/TeamLogo'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  return `$${(n / 1_000).toFixed(0)}K`
}

function ovrClass(ovr: number) {
  if (ovr >= 95) return 'ovr-s'
  if (ovr >= 90) return 'ovr-a'
  if (ovr >= 85) return 'ovr-b'
  if (ovr >= 80) return 'ovr-c'
  return 'ovr-d'
}

const POT_STYLE: Record<string, { color: string; bg: string }> = {
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

// ── Slider component ──────────────────────────────────────────────────────────

const PROFILES: { key: keyof BuildWeights; label: string; desc: string; color: string }[] = [
  { key: 'rebuild',       label: 'REBUILD',        desc: 'Giovani con alto potenziale',                    color: '#4ade80' },
  { key: 'winNow',        label: 'WIN NOW',         desc: 'Overall alto, pronti subito',                   color: '#c084fc' },
  { key: 'valueHunt',     label: 'VALUE HUNT',      desc: 'Attributi elite nascosti dall\'OVR',            color: '#facc15' },
  { key: 'teamFriendly',  label: 'TEAM FRIENDLY',   desc: 'Contratti corti e convenienti',                 color: '#60a5fa' },
  { key: 'physicalFreak', label: 'PHYSICAL FREAK',  desc: 'Grande per la sua posizione (h/wingspan/ath)',  color: '#fb923c' },
  { key: 'capRelief',     label: 'CAP RELIEF',      desc: 'Contratto alto in scadenza: libera spazio cap', color: '#f472b6' },
]

function Slider({
  profile, value, onChange,
}: { profile: typeof PROFILES[number]; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-display text-sm font-black tracking-wider" style={{ color: profile.color }}>
            {profile.label}
          </span>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-dim)' }}>{profile.desc}</div>
        </div>
        <span className="font-display text-lg font-black w-8 text-right" style={{ color: profile.color }}>
          {value}
        </span>
      </div>
      <input
        type="range" min={0} max={10} step={1} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${profile.color} ${value * 10}%, var(--border2) ${value * 10}%)`,
          accentColor: profile.color,
        }}
      />
    </div>
  )
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color, transition: 'width 0.3s' }} />
      </div>
      <span className="text-[10px] font-bold tabular-nums w-6 text-right" style={{ color }}>
        {value}
      </span>
    </div>
  )
}

// ── Total score ring ─────────────────────────────────────────────────────────

function TotalScore({ score, rank, active }: { score: number; rank: number; active: boolean }) {
  const color = score >= 75 ? '#fde047' : score >= 55 ? '#4ade80' : score >= 35 ? '#60a5fa' : 'var(--text-sec)'
  return (
    <div className="flex flex-col items-center justify-center w-12 shrink-0" style={{ minHeight: '3rem' }}>
      {active ? (
        <>
          <div className="text-[8px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-dim)' }}>#{rank}</div>
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center font-display text-lg font-black"
            style={{ background: `conic-gradient(${color} ${score * 3.6}deg, var(--border) 0deg)`, padding: '3px' }}
          >
            <div className="w-full h-full rounded-full flex items-center justify-center" style={{ background: 'var(--surface)' }}>
              <span style={{ color }}>{score}</span>
            </div>
          </div>
        </>
      ) : (
        <span className="font-display text-base font-black tabular-nums" style={{ color: 'var(--text-dim)' }}>#{rank}</span>
      )}
    </div>
  )
}

// ── Guide panel ──────────────────────────────────────────────────────────────

function GuidePanel() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--text-dim)' }}>?</span>
          <span className="font-display text-sm font-black tracking-wider" style={{ color: 'var(--text-sec)' }}>
            COME FUNZIONA
          </span>
        </div>
        <span
          className="text-xs transition-transform duration-200"
          style={{ color: 'var(--text-dim)', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none' }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="pt-3 space-y-2.5">
            {[
              {
                color: '#4ade80',
                title: 'REBUILD',
                desc: 'Premia giocatori giovani con alto potenziale (A+/A/A-). Ideale per costruire una squadra nel lungo periodo.',
              },
              {
                color: '#c084fc',
                title: 'WIN NOW',
                desc: 'Ordina per Overall. Più è alto lo slider, più conta l\'OVR attuale. Per chi vuole vincere subito.',
              },
              {
                color: '#facc15',
                title: 'VALUE HUNT',
                desc: 'Cerca giocatori con attributi specifici sopra la media rispetto al loro OVR. Trova le gemme nascoste.',
              },
              {
                color: '#60a5fa',
                title: 'TEAM FRIENDLY',
                desc: 'Favorisce contratti corti e poco costosi. Utile per tenere flessibilità salariale.',
              },
              {
                color: '#fb923c',
                title: 'PHYSICAL FREAK',
                desc: 'Premia chi è fisicamente eccezionale per la sua posizione più piccola: altezza, wingspan e atletismo. Cooper Flagg e Scottie Barnes (7\'0" che giocano PG) sono l\'esempio perfetto.',
              },
              {
                color: '#f472b6',
                title: 'CAP RELIEF',
                desc: 'Trova i giocatori con contratto alto (>8% cap) che scadono presto (1-3 anni). Ideale per pianificare chi tagliare o non rinnovare per liberare spazio salariale.',
              },
            ].map(item => (
              <div key={item.title} className="flex gap-2.5">
                <div className="w-1 rounded-full shrink-0 mt-0.5" style={{ background: item.color, minHeight: '100%' }} />
                <div>
                  <div className="text-[10px] font-black tracking-widest font-display mb-0.5" style={{ color: item.color }}>
                    {item.title}
                  </div>
                  <div className="text-[11px] leading-snug" style={{ color: 'var(--text-sec)' }}>
                    {item.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-1 space-y-1.5 text-[11px] leading-snug" style={{ color: 'var(--text-dim)', borderTop: '1px solid var(--border)' }}>
            <p className="pt-2">Gli slider si combinano: puoi mixare più dimensioni con pesi diversi (0–10).</p>
            <p>Con tutti a 0 la lista è ordinata per OVR decrescente.</p>
            <p>Usa <span style={{ color: 'var(--gold)' }}>Attributi</span> per filtrare su valori minimi specifici (es. 3PT ≥ 80).</p>
            <p>Usa <span style={{ color: 'var(--gold)' }}>Draft Class</span> per vedere solo i giocatori di una specifica classe.</p>
          </div>
        </div>
      )}
    </div>
  )
}

const NOTE_SHORT: Record<string, string> = { PO: 'PO', TO: 'TO', QO: 'QO' }

const POS_STYLE: Record<string, { color: string; background: string }> = {
  'PG':      { color: '#60a5fa', background: 'rgba(59,130,246,0.15)' },
  'SG':      { color: '#a78bfa', background: 'rgba(139,92,246,0.15)' },
  'SF':      { color: '#4ade80', background: 'rgba(34,197,94,0.15)' },
  'PF':      { color: '#fb923c', background: 'rgba(249,115,22,0.15)' },
  'C':       { color: '#f87171', background: 'rgba(239,68,68,0.15)' },
  'default': { color: 'var(--text-sec)', background: 'var(--surface2)' },
}
const NOTE_TITLE: Record<string, string> = { PO: 'Player Option', TO: 'Team Option', QO: 'Qualifying Offer' }

const BADGE_TIERS = [
  { tier: 'Legend',       short: 'LEG',  color: '#fca5a5', bg: 'rgba(239,68,68,0.2)',    border: 'rgba(239,68,68,0.45)',    shadow: '0 0 6px rgba(239,68,68,0.35)' },
  { tier: 'Hall of Fame', short: 'HOF',  color: '#d8b4fe', bg: 'rgba(168,85,247,0.2)',   border: 'rgba(168,85,247,0.45)',   shadow: '0 0 6px rgba(168,85,247,0.3)' },
  { tier: 'Gold',         short: 'GOLD', color: '#fde047', bg: 'rgba(234,179,8,0.2)',    border: 'rgba(234,179,8,0.45)' },
  { tier: 'Silver',       short: 'SLV',  color: '#cbd5e1', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.4)' },
  { tier: 'Bronze',       short: 'BRZ',  color: '#fdba74', bg: 'rgba(180,83,9,0.2)',     border: 'rgba(180,83,9,0.45)' },
]

// ── Main page ─────────────────────────────────────────────────────────────────

interface DraftPick { slug: string; rank: number; pick: string; draftYear: number }

const DRAFT_YEARS = [2026, 2025, 2024, 2023, 2022, 2021]

export default function DraftBuilderPage() {
  const router = useRouter()
  const [weights, setWeights] = useState<BuildWeights>(DEFAULT_WEIGHTS)
  const [players, setPlayers] = useState<Player[]>([])
  const [potentials, setPotentials] = useState<Map<string, PlayerExtra>>(new Map())
  const [contracts, setContracts] = useState<ContractEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [minOvr, setMinOvr] = useState(75)
  const [posFilter, setPosFilter] = useState<string | null>(null)
  const [attrFilters, setAttrFilters] = useState<AttrFilter[]>([])
  const [showSaved, setShowSaved] = useState(false)
  // Draft class filter
  const [draftYears, setDraftYears] = useState<number[]>([])
  const [draftPicks, setDraftPicks] = useState<Map<string, DraftPick>>(new Map())
  const [draftLoading, setDraftLoading] = useState(false)
  const loadedDraftYears = useRef(new Set<number>())
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Drafted (hidden) players — per-user localStorage
  const [userId, setUserId] = useState<string | null>(null)
  const [draftedSlugs, setDraftedSlugs] = useState<Set<string>>(new Set())
  const { savedPlayers, isSaved, savePlayer, removePlayer, clearAll } = useSavedPlayers()
  const { toasts, dismissToast } = useCapToasts(savedPlayers, contracts)

  // Load userId and drafted slugs from localStorage
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null
      setUserId(uid)
      if (uid) {
        try {
          const raw = localStorage.getItem(`goat_drafted_${uid}`)
          if (raw) setDraftedSlugs(new Set(JSON.parse(raw)))
        } catch {}
      }
    })
  }, [])

  const toggleDrafted = useCallback((slug: string) => {
    setDraftedSlugs(prev => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      if (userId) {
        try { localStorage.setItem(`goat_drafted_${userId}`, JSON.stringify([...next])) } catch {}
      }
      return next
    })
  }, [userId])

  const clearDrafted = useCallback(() => {
    setDraftedSlugs(new Set())
    if (userId) {
      try { localStorage.removeItem(`goat_drafted_${userId}`) } catch {}
    }
  }, [userId])

  const setWeight = useCallback((key: keyof BuildWeights, v: number) => {
    setWeights(prev => ({ ...prev, [key]: v }))
  }, [])

  const toggleDraftYear = useCallback(async (year: number) => {
    const next = draftYears.includes(year)
      ? draftYears.filter(y => y !== year)
      : [...draftYears, year]
    setDraftYears(next)

    if (!draftYears.includes(year) && !loadedDraftYears.current.has(year)) {
      setDraftLoading(true)
      try {
        const d = await fetch(`/api/draft/${year}`).then(r => r.json())
        if (d.success) {
          setDraftPicks(prev => {
            const m = new Map(prev)
            for (const p of d.data) m.set(p.slug, { slug: p.slug, rank: p.rank, pick: p.pick, draftYear: year })
            return m
          })
          loadedDraftYears.current.add(year)
        }
      } finally { setDraftLoading(false) }
    }
  }, [draftYears])

  useEffect(() => {
    Promise.all([
      fetch('/api/players').then(r => r.json()),
      fetch('/api/contracts').then(r => r.json()),
    ]).then(([pd, cd]) => {
      const allPlayers: Player[] = pd.success ? pd.data : []
      setPlayers(allPlayers)
      if (cd.success) setContracts(cd.data)

      // Fetch potentials in chunks
      const slugs = allPlayers.map((p: Player) => p.slug)
      const chunks: string[][] = []
      for (let i = 0; i < slugs.length; i += 50) chunks.push(slugs.slice(i, i + 50))
      return Promise.all(
        chunks.map(c => fetch(`/api/players/potentials?slugs=${c.join(',')}`).then(r => r.json()))
      )
    }).then(results => {
      const map = new Map<string, PlayerExtra>()
      for (const batch of results) {
        for (const [slug, val] of Object.entries(batch)) map.set(slug, val as PlayerExtra)
      }
      setPotentials(map)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const activeDraftSlugs = useMemo(() => {
    if (draftYears.length === 0) return null
    const s = new Set<string>()
    for (const [slug, pick] of draftPicks) {
      if (draftYears.includes(pick.draftYear)) s.add(slug)
    }
    return s
  }, [draftYears, draftPicks])

  const totalActive = weights.rebuild + weights.winNow + weights.valueHunt + weights.teamFriendly + weights.physicalFreak + weights.capRelief

  const scored = useMemo(() => {
    return players
      .filter(p => p.overall >= minOvr)
      .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
      .filter(p => !posFilter || p.positions.includes(posFilter))
      .filter(p => attrFilters.every(f => (p.attributes[f.key] ?? 0) >= f.min))
      .filter(p => !activeDraftSlugs || activeDraftSlugs.has(p.slug))
      .filter(p => !draftedSlugs.has(p.slug))
      .map(p => {
        const extra = potentials.get(p.slug)
        const contract = contracts.length > 0 ? matchContract(p.name, contracts) : undefined
        const score = scorePlayer(p, extra, contract, weights)
        const pick = draftPicks.get(p.slug)
        return { player: p, extra, contract, score, pick: pick ?? null }
      })
      .sort((a, b) =>
        totalActive === 0
          ? b.player.overall - a.player.overall
          : b.score.total - a.score.total
      )
  }, [players, potentials, contracts, weights, minOvr, search, posFilter, attrFilters, activeDraftSlugs, draftPicks, totalActive, draftedSlugs])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }} className="sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-display text-2xl font-bold tracking-wider" style={{ color: 'var(--gold)' }}>GOAT LEAGUE</span>
            <span className="font-display text-2xl font-bold tracking-wide" style={{ color: 'var(--text)' }}>PROJECT</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Desktop: pos filters + search + OVR */}
            <div className="hidden lg:flex items-center gap-2">
              <div className="flex gap-1">
                {['PG','SG','SF','PF','C'].map(pos => (
                  <button
                    key={pos}
                    onClick={() => setPosFilter(p => p === pos ? null : pos)}
                    className="font-display text-xs font-black px-2 py-1 rounded transition-all"
                    style={posFilter === pos
                      ? { background: 'var(--gold-bg2)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }
                      : { background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }
                    }
                  >
                    {pos}
                  </button>
                ))}
              </div>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cerca..."
                className="text-xs px-3 py-1.5 rounded-lg outline-none w-32"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--text)' }}
              />
              <select
                value={minOvr}
                onChange={e => setMinOvr(Number(e.target.value))}
                className="text-xs px-2 py-1.5 rounded-lg outline-none"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--text)' }}
              >
                {[65, 70, 75, 78, 80, 82, 85].map(v => <option key={v} value={v}>{v}+</option>)}
              </select>
            </div>

            {/* Mobile: sidebar toggle */}
            <button
              className="lg:hidden text-sm px-3 py-1.5 rounded transition-colors"
              style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}
              onClick={() => setSidebarOpen(true)}
              aria-label="Apri filtri"
            >
              ☰
            </button>

            {/* Rosa — always visible */}
            <button
              onClick={() => setShowSaved(true)}
              className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded transition-colors"
              style={{ background: 'rgba(232,160,32,0.12)', color: 'var(--gold)', border: '1px solid rgba(232,160,32,0.3)' }}
            >
              <span className="hidden sm:inline">La mia </span>Rosa
              {savedPlayers.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--gold)', color: '#000' }}>
                  {savedPlayers.length}
                </span>
              )}
            </button>

            {/* Esci */}
            <button
              onClick={async () => { const sb = createClient(); await sb.auth.signOut(); router.push('/login'); router.refresh() }}
              className="text-xs font-semibold px-3 py-1.5 rounded transition-colors"
              style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}
            >
              Esci
            </button>
          </div>
        </div>
      </header>

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-5">
        {/* Sidebar — responsive drawer on mobile, static on desktop */}
        <aside
          className={`fixed lg:static inset-y-0 lg:inset-y-auto left-0 lg:left-auto z-50 lg:z-auto w-72 lg:w-64 shrink-0 overflow-y-auto lg:overflow-visible transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
          style={{ background: 'var(--bg)' }}
        >
          {/* Mobile: sidebar header with close button */}
          <div
            className="lg:hidden flex items-center justify-between px-4 py-3 sticky top-0 z-10"
            style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
          >
            <span className="font-display text-sm font-black tracking-wider" style={{ color: 'var(--text-sec)' }}>FILTRI</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded text-base"
              style={{ color: 'var(--text-sec)', background: 'var(--surface2)' }}
            >
              ✕
            </button>
          </div>

          {/* Mobile: pos filters + search + OVR */}
          <div className="lg:hidden px-4 py-3 space-y-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex flex-wrap gap-1.5">
              {['PG','SG','SF','PF','C'].map(pos => (
                <button
                  key={pos}
                  onClick={() => setPosFilter(p => p === pos ? null : pos)}
                  className="font-display text-xs font-black px-2.5 py-1.5 rounded transition-all"
                  style={posFilter === pos
                    ? { background: 'var(--gold-bg2)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }
                    : { background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }
                  }
                >
                  {pos}
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca giocatore..."
              className="w-full text-xs px-3 py-2 rounded-lg outline-none"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--text)' }}
            />
            <select
              value={minOvr}
              onChange={e => setMinOvr(Number(e.target.value))}
              className="w-full text-xs px-2 py-2 rounded-lg outline-none"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--text)' }}
            >
              {[65, 70, 75, 78, 80, 82, 85].map(v => <option key={v} value={v}>OVR {v}+</option>)}
            </select>
          </div>

          <div className="p-4 space-y-4 lg:sticky lg:top-16 lg:overflow-y-auto lg:max-h-[calc(100vh-5rem)]">
            <div className="rounded-xl p-4 space-y-5" style={{ background: 'var(--surface)', border: '1px solid var(--border2)' }}>
              <div>
                <div className="font-display text-base font-black tracking-wider mb-0.5" style={{ color: 'var(--text)' }}>
                  PROFILO DI BUILD
                </div>
                <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                  Peso 0–10 per ogni dimensione
                </div>
              </div>
              {PROFILES.map(p => (
                <Slider key={p.key} profile={p} value={weights[p.key]} onChange={v => setWeight(p.key, v)} />
              ))}
              {totalActive === 0 && (
                <div className="text-xs text-center px-2 py-2 rounded" style={{ color: '#fb923c', background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.25)' }}>
                  Con tutti a 0 la lista è ordinata per OVR
                </div>
              )}
            </div>

            {/* Guide */}
            <GuidePanel />

            {/* Draft class filter */}
            <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border2)' }}>
              <div>
                <div className="font-display text-base font-black tracking-wider mb-0.5" style={{ color: 'var(--text)' }}>
                  DRAFT CLASS
                </div>
                <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                  Filtra per anno di draft
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {DRAFT_YEARS.map(y => {
                  const active = draftYears.includes(y)
                  return (
                    <button
                      key={y}
                      onClick={() => toggleDraftYear(y)}
                      className="font-display text-xs font-black px-2.5 py-1 rounded-lg transition-all"
                      style={active
                        ? { background: 'var(--gold-bg2)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }
                        : { background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }
                      }
                    >
                      {y}
                    </button>
                  )
                })}
              </div>
              {draftYears.length > 0 && (
                <button
                  onClick={() => setDraftYears([])}
                  className="text-[10px] w-full text-center"
                  style={{ color: 'var(--text-dim)' }}
                >
                  Mostra tutti
                </button>
              )}
              {draftLoading && (
                <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Caricamento...</div>
              )}
            </div>

            {/* Drafted players */}
            {draftedSlugs.size > 0 && (
              <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border2)' }}>
                <div className="flex items-center justify-between">
                  <div className="font-display text-base font-black tracking-wider" style={{ color: 'var(--text)' }}>
                    GIÀ DRAFTATI
                  </div>
                  <span className="font-display text-2xl font-black tabular-nums" style={{ color: 'var(--text-sec)' }}>
                    {draftedSlugs.size}
                  </span>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {players.filter(p => draftedSlugs.has(p.slug)).map(p => (
                    <div key={p.slug} className="flex items-center justify-between gap-2 text-xs py-0.5">
                      <span className="truncate" style={{ color: 'var(--text-sec)' }}>{p.name}</span>
                      <button
                        onClick={() => toggleDrafted(p.slug)}
                        className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ color: 'var(--text-dim)', background: 'var(--surface2)', border: '1px solid var(--border)' }}
                      >
                        ↩
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={clearDrafted}
                  className="w-full py-1.5 rounded-lg text-xs font-semibold"
                  style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
                >
                  Svuota lista
                </button>
              </div>
            )}

            {/* Attribute filters */}
            <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border2)' }}>
              <div>
                <div className="font-display text-base font-black tracking-wider mb-0.5" style={{ color: 'var(--text)' }}>
                  ATTRIBUTI
                </div>
                <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                  Fino a 4 valori minimi
                </div>
              </div>
              <AttributeFilterPicker value={attrFilters} onChange={setAttrFilters} />
            </div>

            {/* Legend */}
            <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="text-[9px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--text-dim)' }}>Score totale</div>
              {[
                { range: '75–100', label: 'Ideale per il tuo build', color: '#fde047' },
                { range: '55–74',  label: 'Buona scelta',            color: '#4ade80' },
                { range: '35–54',  label: 'Discreta',                color: '#60a5fa' },
                { range: '0–34',   label: 'Non adatto',              color: 'var(--text-dim)' },
              ].map(r => (
                <div key={r.range} className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                  <span className="font-bold tabular-nums w-12" style={{ color: r.color }}>{r.range}</span>
                  <span style={{ color: 'var(--text-sec)' }}>{r.label}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Main — player list */}
        <main className="flex-1 min-w-0">
          <div className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>
            {loading ? 'Caricamento...' : `${scored.length} giocatori`}
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {scored.map(({ player, extra, contract, score, pick }, idx) => (
                <DraftBuilderRow
                  key={player.slug}
                  player={player}
                  extra={extra}
                  contract={contract ?? null}
                  score={score}
                  rank={idx + 1}
                  pick={pick}
                  isSaved={isSaved(player.slug)}
                  onSave={() => savePlayer(player)}
                  onRemove={() => removePlayer(player.slug)}
                  weights={weights}
                  attrFilters={attrFilters}
                  isDrafted={draftedSlugs.has(player.slug)}
                  onToggleDrafted={() => toggleDrafted(player.slug)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      <Toast messages={toasts} onDismiss={dismissToast} />

      {showSaved && (
        <SavedList
          players={savedPlayers}
          contracts={contracts}
          onRemove={removePlayer}
          onClearAll={clearAll}
          onClose={() => setShowSaved(false)}
        />
      )}
    </div>
  )
}

// ── Row component ─────────────────────────────────────────────────────────────

function DraftBuilderRow({
  player, extra, contract, score, rank, pick, isSaved, onSave, onRemove, weights, attrFilters, isDrafted, onToggleDrafted,
}: {
  player: Player
  extra: PlayerExtra | undefined
  contract: ContractEntry | null
  score: PlayerScore
  rank: number
  pick: DraftPick | null
  isSaved: boolean
  onSave: () => void
  onRemove: () => void
  weights: BuildWeights
  attrFilters: AttrFilter[]
  isDrafted: boolean
  onToggleDrafted: () => void
}) {
  const pot = extra?.potential
  const age = extra?.age
  const potStyle = pot ? POT_STYLE[pot] : null
  const firstSalary = contract?.salaries[0]
  const salary = firstSalary?.amount
  const note = firstSalary?.note

  return (
    <div
      className="flex items-center gap-4 px-4 py-3 rounded-xl border transition-colors duration-150 hover:border-[var(--gold-dim)]"
      style={{
        background: 'var(--surface)',
        borderColor: isDrafted ? 'rgba(148,163,184,0.2)' : 'var(--border2)',
        opacity: isDrafted ? 0.45 : 1,
      }}
    >
      {/* Rank + score ring */}
      <TotalScore score={score.total} rank={rank} active={PROFILES.some(p => weights[p.key] > 0)} />

      {/* OVR */}
      <div
        className={`font-display text-3xl font-black w-12 text-center leading-none shrink-0 ${ovrClass(player.overall)}`}
        onClick={() => window.open(`/player/${player.slug}`, '_blank')}
        style={{ cursor: 'pointer' }}
      >
        {player.overall}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => window.open(`/player/${player.slug}`, '_blank')}>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-display text-lg font-bold leading-tight truncate" style={{ color: 'var(--text)' }}>
            {player.name}
          </div>
          {[...new Set(player.positions)].map(pos => (
            <span key={pos} className="text-[10px] font-black px-1.5 py-0.5 rounded tracking-wide"
              style={POS_STYLE[pos] ?? POS_STYLE['default']}>
              {pos}
            </span>
          ))}
        </div>
        {attrFilters.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {attrFilters.map(f => {
              const val = player.attributes[f.key] ?? 0
              const label = ATTRS.find(a => a.key === f.key)?.label ?? f.key
              return (
                <span
                  key={f.key}
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums"
                  style={{ background: 'var(--gold-bg)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }}
                >
                  {label} <span style={{ color: 'var(--text)' }}>{val}</span>
                </span>
              )
            })}
          </div>
        )}
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <TeamLogo team={player.team} size={18} showAbbr />
          {age != null && (
            <>
              <span style={{ color: 'var(--text-dim)' }}>·</span>
              <span className="text-xs" style={{ color: 'var(--text-sec)' }}>{age} anni</span>
            </>
          )}
          {player.height && (
            <>
              <span style={{ color: 'var(--text-dim)' }}>·</span>
              <span className="text-xs" style={{ color: 'var(--text-sec)' }}>{player.height}</span>
            </>
          )}
          {pot && potStyle && (
            <>
              <span style={{ color: 'var(--text-dim)' }}>·</span>
              <span
                className="font-display text-xs font-black px-1.5 py-0.5 rounded"
                style={{ color: potStyle.color, background: potStyle.bg }}
              >
                {pot}
              </span>
            </>
          )}
          {pick && (
            <>
              <span style={{ color: 'var(--text-dim)' }}>·</span>
              <span
                className="font-display text-[10px] font-black px-1.5 py-0.5 rounded"
                style={{ background: 'var(--gold-bg)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }}
              >
                {pick.draftYear} #{pick.pick}
              </span>
            </>
          )}
          {/* Contract info — mobile */}
          {salary != null && contract && (
            <>
              <span className="lg:hidden text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded" style={{ background: 'var(--surface2)', color: 'var(--gold)', border: '1px solid var(--border2)' }}>
                {fmt(salary)}<span className="font-normal opacity-70">/yr</span>
              </span>
              <span className="lg:hidden text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded" style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border2)' }}>
                {contract.years_remaining}yr
              </span>
              {note && NOTE_SHORT[note] && (
                <span className="lg:hidden text-[10px] font-black px-1.5 py-0.5 rounded font-display" style={{ background: 'var(--gold-bg)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }}>
                  {NOTE_SHORT[note]}
                </span>
              )}
            </>
          )}
          {contract === null && (
            <span className="lg:hidden text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: 'var(--text-dim)', background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              FA
            </span>
          )}
        </div>
      </div>

      {/* Contract block */}
      <div className="hidden lg:block shrink-0">
        {contract && firstSalary ? (
          <div className="flex divide-x rounded-lg overflow-hidden" style={{ border: '1px solid var(--border2)' }}>
            <div className="px-2.5 py-1.5 text-center" style={{ background: 'var(--surface2)' }}>
              <div className="text-[9px] uppercase tracking-widest font-semibold mb-1" style={{ color: 'var(--text-sec)' }}>Durata</div>
              <div className="font-display text-sm font-bold leading-none whitespace-nowrap" style={{ color: 'var(--text)' }}>
                {contract.years_remaining}<span className="text-[10px] font-normal ml-0.5" style={{ color: 'var(--text-sec)' }}>yr</span>
              </div>
            </div>
            <div className="px-2.5 py-1.5 text-center" style={{ background: 'var(--surface2)' }}>
              <div className="text-[9px] uppercase tracking-widest font-semibold mb-1" style={{ color: 'var(--text-sec)' }}>Valore</div>
              <div className="font-display text-sm font-bold leading-none tabular-nums whitespace-nowrap" style={{ color: 'var(--gold)' }}>
                {fmt(salary!)}<span className="text-[10px] font-normal ml-0.5" style={{ color: 'var(--text-sec)' }}>/yr</span>
              </div>
            </div>
            <div className="px-2.5 py-1.5 text-center" style={{ background: 'var(--surface2)' }}>
              <div className="text-[9px] uppercase tracking-widest font-semibold mb-1" style={{ color: 'var(--text-sec)' }}>Opzione</div>
              {note && NOTE_SHORT[note] ? (
                <span
                  className="font-display text-sm font-black px-1.5 rounded"
                  style={{ background: 'var(--gold-bg)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }}
                  title={NOTE_TITLE[note]}
                >
                  {NOTE_SHORT[note]}
                </span>
              ) : (
                <div className="text-sm font-bold" style={{ color: 'var(--text-sec)' }}>—</div>
              )}
            </div>
          </div>
        ) : contract === null ? (
          <div
            className="px-3 py-1.5 rounded-lg text-center"
            style={{ border: '1px solid var(--border2)', background: 'var(--surface2)' }}
          >
            <span className="font-display text-sm font-black tracking-widest" style={{ color: 'var(--text-sec)' }}>FA</span>
            <div className="text-[9px] uppercase tracking-widest mt-0.5" style={{ color: 'var(--text-dim)' }}>Svincolato</div>
          </div>
        ) : null}
      </div>

      {/* Badge tier counters — 5 fixed slots, always same width/height */}
      <div className="hidden lg:flex items-center gap-1 shrink-0">
        {BADGE_TIERS.map(({ tier, short, color, bg, border, shadow }) => {
          const count = player.badges?.list?.filter(b => b.tier === tier).length ?? 0
          return (
            <div
              key={tier}
              className="flex flex-col items-center justify-center rounded-lg"
              style={{
                width: '2.25rem', height: '2.25rem',
                background: count > 0 ? bg : 'var(--surface2)',
                border: `1px solid ${count > 0 ? border : 'var(--border)'}`,
                boxShadow: count > 0 ? shadow : 'none',
              }}
            >
              {count > 0 ? (
                <>
                  <span className="font-display text-sm font-black leading-none tabular-nums" style={{ color }}>{count}</span>
                  <span className="text-[7px] font-bold leading-none mt-0.5 tracking-wide" style={{ color }}>{short}</span>
                </>
              ) : (
                <span className="text-[7px] font-semibold tracking-wide" style={{ color: 'var(--border2)' }}>{short}</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Score breakdown — only active dimensions */}
      {PROFILES.some(p => weights[p.key] > 0) && (
        <div className="hidden lg:flex flex-col gap-1 w-48 shrink-0">
          {PROFILES.filter(p => weights[p.key] > 0).map(p => (
            <div key={p.key} className="flex items-center gap-2">
              <span className="text-[9px] font-bold w-16 uppercase tracking-wide shrink-0" style={{ color: p.color }}>
                {p.label}
              </span>
              <ScoreBar value={score[p.key]} color={p.color} />
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-1.5 shrink-0">
        <button
          onClick={isSaved ? onRemove : onSave}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap"
          style={isSaved
            ? { background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }
            : { background: 'var(--gold-bg)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }
          }
        >
          {isSaved ? 'Rimuovi' : '+ Rosa'}
        </button>
        <button
          onClick={e => { e.stopPropagation(); onToggleDrafted() }}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap"
          style={isDrafted
            ? { background: 'rgba(148,163,184,0.15)', color: 'var(--text-sec)', border: '1px solid var(--border2)' }
            : { background: 'rgba(148,163,184,0.08)', color: 'var(--text-dim)', border: '1px solid var(--border)' }
          }
        >
          {isDrafted ? '↩ Ripristina' : 'Preso'}
        </button>
      </div>
    </div>
  )
}
