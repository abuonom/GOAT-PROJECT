'use client'

import { useEffect, useState, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { useProfile } from '@/hooks/useProfile'
import { createClient } from '@/lib/supabase/client'
import type { GoatDraftState, DunkestPlayer, GoatDraftParticipant, RosterSlots } from '@/types/dunkest'
import { ROLE_LIMITS, TOTAL_ROUNDS } from '@/types/dunkest'

type Tab = 'catalogo' | 'rose' | 'cronologia'

export default function GoatDraftSessionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: sessionId } = use(params)
  const router = useRouter()
  const { profile, loading: profileLoading } = useProfile()
  const isAdmin = profile?.role === 'admin'

  const [state, setState] = useState<GoatDraftState | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('catalogo')

  // Catalog
  const [catalog, setCatalog] = useState<DunkestPlayer[]>([])
  const [myRosterSlots, setMyRosterSlots] = useState<RosterSlots | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [teams, setTeams] = useState<string[]>([])

  // Pick flow
  const [selectedPlayer, setSelectedPlayer] = useState<DunkestPlayer | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [picking, setPicking] = useState(false)

  const [botPicking, setBotPicking] = useState(false)
  const [deletingDemo, setDeletingDemo] = useState(false)

  const [toast, setToast] = useState<{ msg: string; ok: boolean; key: number } | null>(null)

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok, key: Date.now() })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Fetch session state ───────────────────────────────────────────────────

  const fetchState = useCallback(async () => {
    const res = await fetch(`/api/goat-draft/${sessionId}`)
    const json = await res.json()
    if (!json.error) setState(json as GoatDraftState)
    setLoading(false)
  }, [sessionId])

  useEffect(() => {
    if (!profileLoading) fetchState()
  }, [profileLoading, fetchState])

  // ── Supabase Realtime subscription ───────────────────────────────────────

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`goat-draft-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'goat_draft_sessions', filter: `id=eq.${sessionId}` },
        () => { fetchState(); fetchCatalog() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'goat_draft_picks', filter: `session_id=eq.${sessionId}` },
        () => { fetchState(); fetchCatalog() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'goat_draft_participants', filter: `session_id=eq.${sessionId}` },
        () => fetchState(),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sessionId, fetchState])

  // ── Fetch catalog ─────────────────────────────────────────────────────────

  const fetchCatalog = useCallback(async () => {
    setCatalogLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (roleFilter) params.set('role', roleFilter)
    if (teamFilter) params.set('team', teamFilter)
    const res = await fetch(`/api/goat-draft/${sessionId}/catalog?${params}`)
    const json = await res.json()
    if (!json.error) { setCatalog(json.players ?? []); setMyRosterSlots(json.myRosterSlots ?? null) }
    setCatalogLoading(false)
  }, [sessionId, search, roleFilter, teamFilter])

  useEffect(() => {
    if (!profileLoading && state) fetchCatalog()
  }, [profileLoading, state, fetchCatalog])

  // Fetch roles/teams once
  useEffect(() => {
    if (!profileLoading) {
      fetch('/api/goat-draft/catalog').then(r => r.json()).then(j => {
        if (!j.error) { setRoles(j.roles ?? []); setTeams(j.teams ?? []) }
      })
    }
  }, [profileLoading])

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleBotPick() {
    setBotPicking(true)
    const res = await fetch(`/api/admin/demo-session/${sessionId}/bot-pick`, { method: 'POST' })
    const json = await res.json()
    setBotPicking(false)
    if (json.error) showToast(json.error, false)
    else showToast(json.roundAdvanced ? `🤖 ${json.player?.name} — giro avanzato!` : `🤖 ${json.player?.name} selezionato`)
  }

  async function handleDeleteDemo() {
    if (!confirm('Eliminare questa sessione demo? L\'operazione è irreversibile.')) return
    setDeletingDemo(true)
    const res = await fetch(`/api/admin/demo-session?sessionId=${sessionId}`, { method: 'DELETE' })
    const json = await res.json()
    setDeletingDemo(false)
    if (json.error) { showToast(json.error, false); return }
    router.push('/goat-draft')
  }

  async function handleStartDraft() {
    if (!confirm('Avviare il draft? L\'ordine iniziale è già estratto.')) return
    const res = await fetch(`/api/goat-draft/${sessionId}/start`, { method: 'POST' })
    const json = await res.json()
    if (json.error) showToast(json.error, false)
    else { showToast('Draft avviato!'); fetchState() }
  }

  async function confirmPick() {
    if (!selectedPlayer || !state) return
    const myParticipant = state.participants.find(p => p.user_id === profile?.id)
    if (!myParticipant) { showToast('Non sei un partecipante di questa sessione', false); return }
    if (state.currentParticipant?.id !== myParticipant.id) {
      showToast('Non è il tuo turno', false)
      return
    }

    setPicking(true)
    const res = await fetch(`/api/goat-draft/${sessionId}/pick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId: myParticipant.id, dunkestPlayerId: selectedPlayer.id }),
    })
    const json = await res.json()
    setPicking(false)

    if (json.error) {
      showToast(json.error, false)
    } else {
      setSelectedPlayer(null)
      setConfirming(false)
      showToast(
        json.roundAdvanced
          ? `${selectedPlayer.name} selezionato! Giro avanzato.`
          : `${selectedPlayer.name} selezionato!`,
      )
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  if (profileLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />
          ))}
        </div>
      </div>
    )
  }

  if (!state) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <div className="max-w-5xl mx-auto px-4 py-8 text-center">
          <p style={{ color: 'var(--text-dim)' }}>Sessione non trovata.</p>
          <button onClick={() => router.push('/goat-draft')} className="mt-4 text-sm underline" style={{ color: 'var(--gold)' }}>
            Torna alla lista
          </button>
        </div>
      </div>
    )
  }

  const { session, participants, picks, currentParticipant, nextParticipant, roundOrder, valueRanking, picksRemainingInRound } = state
  const myParticipant = participants.find(p => p.user_id === profile?.id)
  const isMyTurn = !!myParticipant && currentParticipant?.id === myParticipant.id
  const isSetup = session.status === 'setup'
  const isActive = session.status === 'active'
  const isCompleted = session.status === 'completed'

  const picksThisRound = picks.filter(p => p.round_number === session.current_round)
  // Hide players whose role is already full for the current participant
  const visibleCatalog = myRosterSlots
    ? catalog.filter(p => (myRosterSlots[p.role] ?? 1) > 0)
    : catalog
  const globalPicksDone = picks.length

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* ── Header ── */}
      <header className="sticky top-0 z-40" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => router.push('/goat-draft')}
                className="text-xs font-semibold px-3 py-1.5 rounded shrink-0"
                style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}
              >
                ←
              </button>
              <div className="min-w-0">
                <div className="font-display font-black text-base tracking-wider truncate" style={{ color: 'var(--gold)' }}>
                  {session.name}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
                  DUNKEST GOAT DRAFT
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isSetup && isAdmin && (
                <button
                  onClick={handleStartDraft}
                  className="font-display font-black tracking-wide text-xs px-4 py-2 rounded-lg"
                  style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.4)' }}
                >
                  ▶ AVVIA
                </button>
              )}
              {/* Demo controls */}
              {session.is_demo && isAdmin && isActive && !isMyTurn && (
                <button
                  onClick={handleBotPick}
                  disabled={botPicking}
                  className="font-display font-black tracking-wide text-xs px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)', opacity: botPicking ? 0.6 : 1 }}
                >
                  {botPicking ? '...' : '🤖 AUTO'}
                </button>
              )}
              {session.is_demo && isAdmin && (
                <button
                  onClick={handleDeleteDemo}
                  disabled={deletingDemo}
                  className="text-xs px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', opacity: deletingDemo ? 0.6 : 1 }}
                >
                  {deletingDemo ? '...' : '✕ DEMO'}
                </button>
              )}
              <StatusBadge status={session.status} />
            </div>
          </div>

          {/* ── Round progress bar ── */}
          {isActive && (
            <div className="mt-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-dim)' }}>
                <span>GIRO {session.current_round}/{TOTAL_ROUNDS} — SCELTA {session.current_pick_index + 1}/8</span>
                <span>{globalPicksDone} pick totali</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${(picksThisRound.length / 8) * 100}%`, background: 'var(--gold)' }}
                />
              </div>

              {/* Current turn indicator */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>Turno:</span>
                  <span
                    className="font-display font-black text-sm tracking-wide px-2 py-0.5 rounded"
                    style={{
                      background: isMyTurn ? 'rgba(212,160,23,0.15)' : 'var(--surface2)',
                      color: isMyTurn ? 'var(--gold)' : 'var(--text)',
                      border: `1px solid ${isMyTurn ? 'rgba(212,160,23,0.4)' : 'var(--border)'}`,
                    }}
                  >
                    {currentParticipant?.display_name ?? '—'}
                    {isMyTurn && ' (TU)'}
                  </span>
                </div>
                {nextParticipant && (
                  <div className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
                    Prossimo: <span style={{ color: 'var(--text-sec)' }}>{nextParticipant.display_name}</span>
                  </div>
                )}
              </div>

              {/* Not my turn message */}
              {myParticipant && !isMyTurn && (
                <div
                  className="rounded-lg px-3 py-2 text-xs"
                  style={{ background: 'rgba(148,163,184,0.05)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}
                >
                  Non è il tuo turno. Attendi che <strong style={{ color: 'var(--text-sec)' }}>{currentParticipant?.display_name}</strong> completi la selezione.
                </div>
              )}
            </div>
          )}

          {isSetup && (
            <div className="mt-2 text-xs rounded-lg px-3 py-2"
              style={{ background: 'rgba(251,146,60,0.05)', border: '1px solid rgba(251,146,60,0.2)', color: '#fb923c' }}>
              Draft in configurazione.{isAdmin ? ' Avvia il draft quando pronto.' : ' Attendi che l\'admin avvii il draft.'}
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="max-w-5xl mx-auto flex" style={{ borderTop: '1px solid var(--border2)' }}>
          {(['catalogo', 'rose', 'cronologia'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 text-[11px] font-bold py-2.5 font-display tracking-wide uppercase"
              style={{
                color: tab === t ? 'var(--gold)' : 'var(--text-dim)',
                borderBottom: tab === t ? '2px solid var(--gold)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-4">

        {/* ── CATALOGO tab ── */}
        {tab === 'catalogo' && (
          <div className="space-y-3">
            {/* My roster slots */}
            {myParticipant && myRosterSlots && (
              <div className="rounded-xl px-4 py-3 space-y-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="text-[10px] font-black font-display tracking-widest" style={{ color: 'var(--text-dim)' }}>
                  SLOT DISPONIBILI
                </div>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(ROLE_LIMITS).map(([role, limit]) => {
                    const remaining = myRosterSlots![role] ?? limit
                    const full = remaining === 0
                    return (
                      <span
                        key={role}
                        className="text-xs px-2.5 py-1 rounded font-display font-black tracking-wide"
                        style={{
                          background: full ? 'rgba(74,222,128,0.1)' : 'var(--surface2)',
                          color: full ? '#4ade80' : 'var(--text)',
                          border: `1px solid ${full ? 'rgba(74,222,128,0.3)' : 'var(--border)'}`,
                        }}
                      >
                        {role} {limit - remaining}/{limit}
                        {full && ' ✓'}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="space-y-2">
              {/* Search + team */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Cerca giocatore..."
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                />
                <select
                  value={teamFilter}
                  onChange={e => setTeamFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                >
                  <option value="">Tutte le squadre</option>
                  {teams.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {/* Role quick filters */}
              <div className="flex gap-1.5 flex-wrap">
                {['', ...Object.keys(ROLE_LIMITS)].map(r => {
                  const active = roleFilter === r
                  const remaining = r && myRosterSlots ? (myRosterSlots[r] ?? ROLE_LIMITS[r]) : null
                  const full = remaining !== null && remaining === 0
                  return (
                    <button
                      key={r || 'all'}
                      onClick={() => setRoleFilter(r)}
                      className="font-display font-black tracking-wide text-xs px-3 py-1.5 rounded-lg"
                      style={{
                        background: active ? 'var(--gold-bg)' : full ? 'rgba(74,222,128,0.06)' : 'var(--surface)',
                        color: active ? 'var(--gold)' : full ? '#4ade80' : 'var(--text-sec)',
                        border: `1px solid ${active ? 'var(--gold-dim)' : full ? 'rgba(74,222,128,0.25)' : 'var(--border)'}`,
                      }}
                    >
                      {r || 'TUTTI'}
                      {remaining !== null && (
                        <span className="ml-1 font-sans font-normal" style={{ opacity: 0.7 }}>
                          {ROLE_LIMITS[r] - remaining}/{ROLE_LIMITS[r]}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Catalog list */}
            {catalogLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: 'var(--surface)' }} />
                ))}
              </div>
            ) : visibleCatalog.length === 0 ? (
              <div className="rounded-xl p-8 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p style={{ color: 'var(--text-dim)' }}>
                  {myRosterSlots && catalog.length > 0
                    ? 'Slot esauriti per i ruoli disponibili.'
                    : 'Nessun giocatore disponibile.'}
                </p>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {visibleCatalog.map((player, i) => {
                  const isSelected = selectedPlayer?.id === player.id
                  return (
                    <div
                      key={player.id}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                      style={{
                        background: isSelected
                          ? 'rgba(212,160,23,0.08)'
                          : i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
                        borderBottom: i < visibleCatalog.length - 1 ? '1px solid var(--border)' : 'none',
                        borderLeft: isSelected ? '3px solid var(--gold)' : '3px solid transparent',
                      }}
                      onClick={() => {
                        if (!isActive) return
                        if (!isMyTurn) { showToast('Non è il tuo turno', false); return }
                        setSelectedPlayer(isSelected ? null : player)
                        setConfirming(false)
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
                          {player.name}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                          {player.role} · {player.team}
                        </div>
                      </div>
                      <div className="font-display font-black text-lg shrink-0" style={{ color: 'var(--gold)' }}>
                        {player.value}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ROSE tab ── */}
        {tab === 'rose' && (
          <div className="space-y-3">
            {/* Value ranking clarification */}
            <div className="rounded-lg px-4 py-3 text-xs"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
              <strong style={{ color: 'var(--text-sec)' }}>CLASSIFICA ROSE</strong> — ordinata per valore crescente. L'ordine del giro corrente è quello nel turno, non questa classifica.
            </div>

            {valueRanking.map((p, rankIdx) => {
              const roundIdx = roundOrder.findIndex(r => r.id === p.id)
              const isCurrentTurn = currentParticipant?.id === p.id
              const isMe = p.user_id === profile?.id
              const myPicks = picks.filter(pick => pick.participant_id === p.id)

              return (
                <div
                  key={p.id}
                  className="rounded-xl overflow-hidden"
                  style={{
                    border: `1px solid ${isCurrentTurn ? 'rgba(212,160,23,0.5)' : isMe ? 'rgba(96,165,250,0.3)' : 'var(--border)'}`,
                    background: isCurrentTurn ? 'rgba(212,160,23,0.04)' : 'var(--surface)',
                  }}
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Rank */}
                    <div
                      className="font-display font-black text-lg w-7 text-center shrink-0"
                      style={{ color: rankIdx === 0 ? '#4ade80' : 'var(--text-dim)' }}
                    >
                      {rankIdx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                          {p.display_name}
                          {isMe && <span className="text-[11px] ml-1" style={{ color: '#60a5fa' }}>(tu)</span>}
                        </span>
                        {isCurrentTurn && isActive && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded font-display tracking-wider"
                            style={{ background: 'rgba(212,160,23,0.15)', color: 'var(--gold)', border: '1px solid rgba(212,160,23,0.3)' }}>
                            TURNO
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-dim)' }}>
                        {myPicks.length} giocatori · Turno giro: #{roundIdx + 1}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-display font-black text-xl" style={{ color: 'var(--gold)' }}>
                        {p.roster_value.toFixed(1)}
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>valore</div>
                    </div>
                  </div>

                  {/* Player list grouped by role */}
                  {myPicks.length > 0 && (
                    <div className="px-4 pb-3 space-y-2">
                      {Object.entries(ROLE_LIMITS).map(([role, limit]) => {
                        const rolePicks = myPicks.filter(pick =>
                          (pick.dunkest_player as DunkestPlayer | undefined)?.role === role,
                        )
                        if (rolePicks.length === 0) return null
                        return (
                          <div key={role} className="space-y-1">
                            <div className="text-[9px] font-black font-display tracking-widest" style={{ color: 'var(--text-dim)' }}>
                              {role} ({rolePicks.length}/{limit})
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {rolePicks.map(pick => (
                                <span
                                  key={pick.id}
                                  className="text-[11px] px-2 py-0.5 rounded font-semibold"
                                  style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}
                                >
                                  {(pick.dunkest_player as DunkestPlayer | undefined)?.name ?? `#${pick.dunkest_player_id}`}
                                  <span className="ml-1 text-[10px]" style={{ color: 'var(--gold)' }}>
                                    {pick.player_value_at_pick}
                                  </span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── CRONOLOGIA tab ── */}
        {tab === 'cronologia' && (
          <div>
            {picks.length === 0 ? (
              <div className="rounded-xl p-8 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p style={{ color: 'var(--text-dim)' }}>Nessuna selezione ancora.</p>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {[...picks].reverse().map((pick, i) => {
                  const participant = participants.find(p => p.id === pick.participant_id)
                  const player = pick.dunkest_player as DunkestPlayer | undefined
                  return (
                    <div
                      key={pick.id}
                      className="flex items-center gap-3 px-4 py-3"
                      style={{
                        background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
                        borderBottom: i < picks.length - 1 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <div className="font-display font-black text-base w-6 text-center shrink-0" style={{ color: 'var(--text-dim)' }}>
                        {pick.global_pick_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                          {player?.name ?? `#${pick.dunkest_player_id}`}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                          {participant?.display_name} · G{pick.round_number}P{pick.pick_in_round}
                          {player && ` · ${player.role} · ${player.team}`}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-display font-black text-base" style={{ color: 'var(--gold)' }}>
                          {pick.player_value_at_pick}
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                          {new Date(pick.picked_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Confirm pick bottom sheet ── */}
      {selectedPlayer && isMyTurn && isActive && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
          <div className="max-w-lg mx-auto">
            {!confirming ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{selectedPlayer.name}</div>
                  <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    {selectedPlayer.role} · {selectedPlayer.team} · <span style={{ color: 'var(--gold)' }}>{selectedPlayer.value}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPlayer(null)}
                  className="text-sm px-3 py-2 rounded-lg"
                  style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}
                >
                  ✕
                </button>
                <button
                  onClick={() => setConfirming(true)}
                  className="font-display font-black tracking-wide text-sm px-5 py-2 rounded-lg"
                  style={{ background: 'rgba(212,160,23,0.15)', color: 'var(--gold)', border: '1px solid rgba(212,160,23,0.4)' }}
                >
                  SELEZIONA
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm" style={{ color: 'var(--text-sec)' }}>
                  Confermi la selezione di <strong style={{ color: 'var(--text)' }}>{selectedPlayer.name}</strong>?
                  <br />
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    Valore: <span style={{ color: 'var(--gold)' }}>{selectedPlayer.value}</span> · Questa scelta è definitiva.
                  </span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirming(false)}
                    className="flex-1 font-semibold text-sm py-2.5 rounded-xl"
                    style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}
                  >
                    Indietro
                  </button>
                  <button
                    onClick={confirmPick}
                    disabled={picking}
                    className="flex-1 font-display font-black tracking-wide text-sm py-2.5 rounded-xl"
                    style={{
                      background: picking ? 'var(--surface2)' : 'rgba(212,160,23,0.2)',
                      color: picking ? 'var(--text-dim)' : 'var(--gold)',
                      border: `1px solid ${picking ? 'var(--border)' : 'rgba(212,160,23,0.5)'}`,
                    }}
                  >
                    {picking ? 'CONFERMA...' : '✓ CONFERMA PICK'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          key={toast.key}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-xl"
          style={{
            background: toast.ok ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)',
            color: toast.ok ? '#4ade80' : '#f87171',
            border: `1px solid ${toast.ok ? 'rgba(74,222,128,0.35)' : 'rgba(239,68,68,0.35)'}`,
            whiteSpace: 'nowrap',
            marginBottom: selectedPlayer && isMyTurn && isActive ? '120px' : '0',
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg = {
    setup:     { label: 'SETUP',     color: '#fb923c' },
    active:    { label: 'IN CORSO',  color: '#4ade80' },
    completed: { label: 'COMPLETATO', color: 'var(--text-dim)' },
  }[status] ?? { label: status.toUpperCase(), color: 'var(--text-dim)' }

  return (
    <span
      className="text-[10px] font-black font-display tracking-wider px-2 py-1 rounded"
      style={{
        background: `${cfg.color}18`,
        color: cfg.color,
        border: `1px solid ${cfg.color}44`,
      }}
    >
      {cfg.label}
    </span>
  )
}
