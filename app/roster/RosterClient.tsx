'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { RosterMembership } from '@/types/league'
import type { Player } from '@/types/nba'

interface Props {
  isAdmin: boolean
  franchiseName: string | null
  seasonName: string | null
  hasFranchise: boolean
}

const STATUS_STYLE = {
  selected:  { label: 'SELEZIONATO', color: '#60a5fa', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)' },
  confirmed: { label: 'CONFERMATO',  color: '#4ade80', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)' },
}

export default function RosterClient({ isAdmin, franchiseName, seasonName, hasFranchise }: Props) {
  const router = useRouter()
  const [memberships, setMemberships] = useState<RosterMembership[]>([])
  const [players, setPlayers] = useState<Record<string, Player>>({})
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const MAX_ROSTER = 15

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/roster?type=mine')
    if (!res.ok) { setLoading(false); return }
    const data: RosterMembership[] = await res.json()
    setMemberships(data)

    // Fetch player data for each slug
    if (data.length > 0) {
      const slugs = data.map(m => m.player_slug)
      const playerMap: Record<string, Player> = {}
      await Promise.all(
        slugs.map(async slug => {
          const r = await fetch(`/api/players/${slug}`)
          if (r.ok) {
            const json = await r.json()
            if (json.data) playerMap[slug] = json.data
          }
        })
      )
      setPlayers(playerMap)
    }
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  async function removePlayer(slug: string) {
    setActing(slug)
    const res = await fetch('/api/roster', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerSlug: slug }),
    })
    const json = await res.json()
    setActing(null)
    if (json.error) { showToast(json.error, false); return }
    setMemberships(prev => prev.filter(m => m.player_slug !== slug))
    showToast('Giocatore rimosso dal roster')
  }

  function ovrColor(ovr: number) {
    if (ovr >= 95) return '#fde047'
    if (ovr >= 90) return '#c084fc'
    if (ovr >= 85) return '#60a5fa'
    if (ovr >= 80) return '#4ade80'
    return 'var(--text-sec)'
  }

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
                IL MIO ROSTER
              </span>
              {seasonName && (
                <span className="ml-2 text-xs" style={{ color: 'var(--text-dim)' }}>{seasonName}</span>
              )}
            </div>
          </div>
          <button
            onClick={() => router.push('/draft-builder')}
            className="text-xs font-semibold px-3 py-1.5 rounded"
            style={{ background: 'var(--gold-bg)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }}
          >
            + Aggiungi giocatori
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Franchise header */}
        {franchiseName && (
          <div className="rounded-xl px-5 py-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="font-display text-2xl font-black tracking-wider" style={{ color: 'var(--text)' }}>
              {franchiseName.toUpperCase()}
            </div>
            <div className="flex items-center gap-4 mt-2">
              <Stat label="Giocatori" value={memberships.length} />
              <Stat label="Max" value={MAX_ROSTER} color="var(--text-dim)" />
            </div>
          </div>
        )}

        {/* No franchise assigned */}
        {!hasFranchise && (
          <div className="rounded-xl px-5 py-6 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="text-2xl mb-2">🏀</div>
            <p className="font-display font-black tracking-wide" style={{ color: 'var(--text)' }}>
              NON SEI ANCORA ASSEGNATO
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
              Attendi che un admin ti assegni una franchigia.
            </p>
          </div>
        )}


        {/* Player list */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />
            ))}
          </div>
        ) : memberships.length === 0 ? (
          hasFranchise && (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">👥</p>
              <p className="font-display font-black tracking-wide" style={{ color: 'var(--text-sec)' }}>
                NESSUN GIOCATORE
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
                Vai alla Player List per aggiungere giocatori al tuo roster.
              </p>
              <button
                onClick={() => router.push('/draft-builder')}
                className="mt-4 font-display font-black tracking-wide text-sm px-5 py-2.5 rounded-xl"
                style={{ background: 'var(--gold-bg)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }}
              >
                APRI PLAYER LIST
              </button>
            </div>
          )
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {memberships.map((m, i) => {
              const player = players[m.player_slug]
              const statusStyle = STATUS_STYLE[m.status as keyof typeof STATUS_STYLE]
              const isActing = acting === m.player_slug

              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 px-4 py-3 transition-opacity"
                  style={{
                    background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
                    borderBottom: i < memberships.length - 1 ? '1px solid var(--border)' : 'none',
                    opacity: isActing ? 0.5 : 1,
                  }}
                >
                  {/* OVR */}
                  <div
                    className="font-display text-2xl font-black w-10 text-center shrink-0"
                    style={{ color: player ? ovrColor(player.overall) : 'var(--text-dim)' }}
                  >
                    {player?.overall ?? '—'}
                  </div>

                  {/* Name + meta */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => window.open(`/player/${m.player_slug}`, '_blank')}
                  >
                    <div className="font-display font-bold text-base leading-tight truncate" style={{ color: 'var(--text)' }}>
                      {player?.name ?? m.player_slug}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {player?.positions.map(pos => (
                        <span
                          key={pos}
                          className="text-[10px] font-black px-1.5 py-0.5 rounded tracking-wide"
                          style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}
                        >
                          {pos}
                        </span>
                      ))}
                      {player?.team && (
                        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{player.team}</span>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  {statusStyle && (
                    <span
                      className="text-[10px] font-black px-2 py-1 rounded font-display tracking-wider shrink-0"
                      style={{ background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}` }}
                    >
                      {statusStyle.label}
                    </span>
                  )}

                  {/* Remove button */}
                  <button
                    onClick={() => removePlayer(m.player_slug)}
                    disabled={isActing}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg shrink-0"
                    style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
                  >
                    {isActing ? '…' : 'Rimuovi'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-semibold shadow-xl"
          style={{
            background: toast.ok ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            color: toast.ok ? '#4ade80' : '#f87171',
            border: `1px solid ${toast.ok ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center">
      <div className="font-display text-xl font-black" style={{ color: color ?? 'var(--text)' }}>{value}</div>
      <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{label}</div>
    </div>
  )
}
