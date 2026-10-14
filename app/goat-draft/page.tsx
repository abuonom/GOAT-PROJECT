'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProfile } from '@/hooks/useProfile'
import type { GoatDraftStatus } from '@/types/dunkest'

type AccessStatus = 'none' | 'pending' | 'approved' | 'rejected'

interface SessionSummary {
  id: string
  name: string
  status: GoatDraftStatus
  current_round: number
  total_picks: number
  created_at: string
  updated_at: string
  is_demo: boolean
}

interface AccessRequest {
  id: string
  user_id: string
  display_name: string | null
  email: string | null
  status: AccessStatus
  requested_at: string
}

interface ApprovedUser {
  id: string
  display_name: string | null
  email: string | null
}

const STATUS_LABEL: Record<GoatDraftStatus, string> = {
  setup: 'SETUP',
  active: 'IN CORSO',
  completed: 'COMPLETATO',
}
const STATUS_COLOR: Record<GoatDraftStatus, string> = {
  setup: '#fb923c',
  active: '#4ade80',
  completed: 'var(--text-dim)',
}

export default function GoatDraftPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useProfile()
  const isAdmin = profile?.role === 'admin'

  const [accessStatus, setAccessStatus] = useState<AccessStatus | null>(null)
  const [accessLoading, setAccessLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)

  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)

  // Admin: requests panel
  const [adminTab, setAdminTab] = useState<'sessions' | 'requests'>('sessions')
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)

  // Admin: demo session
  const [creatingDemo, setCreatingDemo] = useState(false)

  async function handleCreateDemo() {
    setCreatingDemo(true)
    const res = await fetch('/api/admin/demo-session', { method: 'POST' })
    const json = await res.json()
    setCreatingDemo(false)
    if (json.error) { showToast(json.error, false); return }
    router.push(`/goat-draft/${json.id}`)
  }

  // Admin: create session dialog
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [approvedUsers, setApprovedUsers] = useState<ApprovedUser[]>([])
  const [approvedLoading, setApprovedLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const [toast, setToast] = useState<{ msg: string; ok: boolean; key: number } | null>(null)

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok, key: Date.now() })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Load access status ────────────────────────────────────────────────────

  useEffect(() => {
    if (profileLoading) return
    fetch('/api/goat-draft/access')
      .then(r => r.json())
      .then(j => {
        setAccessStatus(j.status ?? 'none')
        setAccessLoading(false)
      })
  }, [profileLoading])

  // ── Load sessions when access is granted ─────────────────────────────────

  useEffect(() => {
    if (accessStatus === 'approved') fetchSessions()
  }, [accessStatus])

  async function fetchSessions() {
    setSessionsLoading(true)
    const res = await fetch('/api/goat-draft')
    const json = await res.json()
    if (!json.error) setSessions(json.sessions ?? [])
    setSessionsLoading(false)
  }

  // ── Request access ────────────────────────────────────────────────────────

  async function handleRequest() {
    setRequesting(true)
    const res = await fetch('/api/goat-draft/access', { method: 'POST' })
    const json = await res.json()
    setRequesting(false)
    if (json.error) { showToast(json.error, false); return }
    setAccessStatus('pending')
    showToast('Richiesta inviata!')
  }

  // ── Admin: load requests ──────────────────────────────────────────────────

  useEffect(() => {
    if (isAdmin && adminTab === 'requests') fetchRequests()
  }, [isAdmin, adminTab])

  async function fetchRequests() {
    setRequestsLoading(true)
    const res = await fetch('/api/admin/goat-draft-access')
    const json = await res.json()
    if (!json.error) setRequests(json.requests ?? [])
    setRequestsLoading(false)
  }

  async function handleReview(id: string, action: 'approve' | 'reject') {
    setActingId(id)
    const res = await fetch('/api/admin/goat-draft-access', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
    const json = await res.json()
    setActingId(null)
    if (json.error) { showToast(json.error, false); return }
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: json.status } : r))
    showToast(action === 'approve' ? 'Accesso approvato' : 'Richiesta rifiutata')
  }

  // ── Admin: create session ─────────────────────────────────────────────────

  async function openCreate() {
    setCreating(true)
    setNewName('')
    setSelectedIds([])
    setApprovedLoading(true)
    const res = await fetch('/api/admin/goat-draft-access')
    const json = await res.json()
    const approved = (json.requests ?? []).filter((r: AccessRequest) => r.status === 'approved')
    setApprovedUsers(approved)
    setApprovedLoading(false)
  }

  function toggleUser(id: string) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 7 ? [...prev, id] : prev
    )
  }

  async function handleCreate() {
    if (!newName.trim()) { showToast('Inserisci un nome', false); return }
    if (selectedIds.length !== 7) { showToast('Seleziona esattamente 7 partecipanti', false); return }
    setSaving(true)
    const res = await fetch('/api/goat-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), otherUserIds: selectedIds }),
    })
    const json = await res.json()
    setSaving(false)
    if (json.error) { showToast(json.error, false); return }
    setCreating(false)
    router.push(`/goat-draft/${json.id}`)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (profileLoading || accessLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-3">
          {[1, 2].map(i => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />)}
        </div>
      </div>
    )
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
            <span className="font-display text-lg font-black tracking-wider" style={{ color: 'var(--gold)' }}>
              DUNKEST GOAT DRAFT
            </span>
          </div>
          {isAdmin && accessStatus === 'approved' && (
            <div className="flex gap-2">
              <button
                onClick={handleCreateDemo}
                disabled={creatingDemo}
                className="font-display font-black tracking-wide text-xs px-3 py-2 rounded-lg"
                style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)', opacity: creatingDemo ? 0.6 : 1 }}
              >
                {creatingDemo ? '...' : '🤖 DEMO'}
              </button>
              <button
                onClick={openCreate}
                className="font-display font-black tracking-wide text-xs px-4 py-2 rounded-lg"
                style={{ background: 'rgba(212,160,23,0.15)', color: 'var(--gold)', border: '1px solid rgba(212,160,23,0.4)' }}
              >
                + NUOVA
              </button>
            </div>
          )}
        </div>

        {/* Admin tab bar */}
        {isAdmin && (
          <div className="max-w-3xl mx-auto flex" style={{ borderTop: '1px solid var(--border2)' }}>
            {(['sessions', 'requests'] as const).map(t => {
              const pending = requests.filter(r => r.status === 'pending').length
              return (
                <button
                  key={t}
                  onClick={() => setAdminTab(t)}
                  className="flex-1 text-[11px] font-bold py-2.5 font-display tracking-wide uppercase relative"
                  style={{
                    color: adminTab === t ? 'var(--gold)' : 'var(--text-dim)',
                    borderBottom: adminTab === t ? '2px solid var(--gold)' : '2px solid transparent',
                    marginBottom: '-1px',
                  }}
                >
                  {t === 'sessions' ? 'SESSIONI' : 'RICHIESTE'}
                  {t === 'requests' && pending > 0 && (
                    <span className="ml-1 text-[9px] font-black px-1 py-0.5 rounded tabular-nums"
                      style={{ background: '#fb923c', color: '#000' }}>
                      {pending}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5">

        {/* ── ACCESS GATE (non-admin) ── */}
        {!isAdmin && accessStatus !== 'approved' && (
          <div className="rounded-2xl px-6 py-8 text-center space-y-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="text-5xl">🏆</div>
            <div>
              <div className="font-display text-2xl font-black tracking-wider" style={{ color: 'var(--text)' }}>
                DUNKEST GOAT DRAFT
              </div>
              <p className="text-sm mt-2" style={{ color: 'var(--text-dim)' }}>
                Funzionalità riservata. Richiedi l'accesso all'admin per partecipare.
              </p>
            </div>

            {accessStatus === 'none' && (
              <button
                onClick={handleRequest}
                disabled={requesting}
                className="font-display font-black tracking-wide text-sm px-8 py-3 rounded-xl"
                style={{ background: 'rgba(212,160,23,0.15)', color: 'var(--gold)', border: '1px solid rgba(212,160,23,0.4)', opacity: requesting ? 0.6 : 1 }}
              >
                {requesting ? 'INVIO...' : 'RICHIEDI ACCESSO'}
              </button>
            )}

            {accessStatus === 'pending' && (
              <div className="rounded-xl px-5 py-4"
                style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.3)' }}>
                <p className="font-display font-black tracking-wide text-sm" style={{ color: '#fb923c' }}>
                  RICHIESTA IN ATTESA
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                  L'admin vedrà la tua richiesta e ti darà accesso se parteciperai.
                </p>
              </div>
            )}

            {accessStatus === 'rejected' && (
              <div className="rounded-xl px-5 py-4"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <p className="font-display font-black tracking-wide text-sm" style={{ color: '#f87171' }}>
                  RICHIESTA NON APPROVATA
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                  Contatta l'admin per maggiori informazioni.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── SESSIONS (approved user or admin on sessions tab) ── */}
        {(accessStatus === 'approved') && (!isAdmin || adminTab === 'sessions') && (
          <>
            {sessionsLoading ? (
              <div className="space-y-3">
                {[1, 2].map(i => <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />)}
              </div>
            ) : sessions.length === 0 ? (
              <div className="rounded-xl p-10 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="text-4xl mb-3">🏀</div>
                <div className="font-display font-black text-lg tracking-wider" style={{ color: 'var(--text-sec)' }}>
                  NESSUNA SESSIONE
                </div>
                {isAdmin && (
                  <p className="text-sm mt-2" style={{ color: 'var(--text-dim)' }}>
                    Crea la prima sessione con il pulsante in alto.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => router.push(`/goat-draft/${s.id}`)}
                    className="w-full rounded-xl px-4 py-4 text-left"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-display font-black text-base tracking-wide truncate" style={{ color: 'var(--text)' }}>
                            {s.name}
                          </span>
                          {s.is_demo && (
                            <span className="text-[9px] font-black font-display tracking-wider px-1.5 py-0.5 rounded shrink-0"
                              style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                              DEMO
                            </span>
                          )}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
                          Giro {s.current_round} · {s.total_picks} pick · {new Date(s.updated_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                        </div>
                      </div>
                      <span
                        className="text-[10px] font-black font-display tracking-wider px-2 py-1 rounded shrink-0"
                        style={{ background: `${STATUS_COLOR[s.status]}18`, color: STATUS_COLOR[s.status], border: `1px solid ${STATUS_COLOR[s.status]}44` }}
                      >
                        {STATUS_LABEL[s.status]}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── ADMIN: REQUESTS tab ── */}
        {isAdmin && adminTab === 'requests' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-black tracking-wide text-sm" style={{ color: 'var(--text-sec)' }}>
                RICHIESTE DI ACCESSO
              </h2>
              <button onClick={fetchRequests} className="text-xs px-3 py-1.5 rounded"
                style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}>
                Aggiorna
              </button>
            </div>

            {requestsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />)}
              </div>
            ) : requests.length === 0 ? (
              <div className="rounded-xl p-8 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p style={{ color: 'var(--text-dim)' }}>Nessuna richiesta.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {requests.map(r => {
                  const isPending = r.status === 'pending'
                  const isActing = actingId === r.id
                  const statusColorMap: Record<string, string> = { pending: '#fb923c', approved: '#4ade80', rejected: '#f87171' }
                  const statusLabelMap: Record<string, string> = { pending: 'IN ATTESA', approved: 'APPROVATO', rejected: 'RIFIUTATO' }
                  const statusColor = statusColorMap[r.status] ?? 'var(--text-dim)'
                  const statusLabel = statusLabelMap[r.status] ?? r.status.toUpperCase()
                  return (
                    <div key={r.id} className="rounded-xl px-4 py-3"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', opacity: isActing ? 0.6 : 1 }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
                            {r.display_name ?? r.email ?? r.user_id.slice(0, 8)}
                          </div>
                          {r.display_name && (
                            <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{r.email}</div>
                          )}
                          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-dim)' }}>
                            {new Date(r.requested_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-black font-display tracking-wider px-2 py-1 rounded"
                            style={{ background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}44` }}>
                            {statusLabel}
                          </span>
                          {isPending && (
                            <>
                              <button
                                onClick={() => handleReview(r.id, 'reject')}
                                disabled={isActing}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                                style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
                              >
                                {isActing ? '…' : 'Rifiuta'}
                              </button>
                              <button
                                onClick={() => handleReview(r.id, 'approve')}
                                disabled={isActing}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                                style={{ background: 'rgba(74,222,128,0.08)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)' }}
                              >
                                {isActing ? '…' : 'Approva'}
                              </button>
                            </>
                          )}
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

      {/* ── Create Session Dialog ── */}
      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={e => { if (e.target === e.currentTarget) setCreating(false) }}
        >
          <div className="w-full max-w-md rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div>
              <h2 className="font-display text-xl font-black tracking-wider" style={{ color: 'var(--text)' }}>NUOVA SESSIONE</h2>
              <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>Sei incluso automaticamente. Seleziona altri 7 partecipanti approvati.</p>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-sec)' }}>NOME SESSIONE</label>
              <input
                type="text" value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="es. GOAT Draft 2026"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold" style={{ color: 'var(--text-sec)' }}>
                  ALTRI PARTECIPANTI ({selectedIds.length}/7)
                </label>
                {selectedIds.length === 7 && <span className="text-[10px] font-black text-green-400">✓ COMPLETO</span>}
              </div>
              {approvedLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: 'var(--surface2)' }} />)}
                </div>
              ) : approvedUsers.length === 0 ? (
                <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-dim)' }}>
                  Nessun utente approvato oltre a te. Approva prima le richieste nella tab "Richieste".
                </div>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {approvedUsers.map(u => {
                    const selected = selectedIds.includes(u.id)
                    return (
                      <button
                        key={u.id}
                        onClick={() => toggleUser(u.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left"
                        style={{
                          background: selected ? 'rgba(212,160,23,0.1)' : 'var(--surface2)',
                          border: `1px solid ${selected ? 'rgba(212,160,23,0.4)' : 'var(--border)'}`,
                          opacity: !selected && selectedIds.length >= 7 ? 0.4 : 1,
                        }}
                      >
                        <div className="w-4 h-4 rounded flex items-center justify-center shrink-0 text-[10px] font-black"
                          style={{ background: selected ? 'var(--gold)' : 'var(--border)', color: selected ? '#000' : 'transparent' }}>
                          {selected ? selectedIds.indexOf(u.id) + 1 : ''}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                            {u.display_name ?? u.email}
                          </div>
                          {u.display_name && <div className="text-[11px] truncate" style={{ color: 'var(--text-dim)' }}>{u.email}</div>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="rounded-lg px-4 py-3 text-xs"
              style={{ background: 'rgba(212,160,23,0.05)', border: '1px solid rgba(212,160,23,0.2)', color: 'var(--text-dim)' }}>
              L'ordine iniziale verrà estratto casualmente. Il primo giro rispetta l'ordine sorteggiato.
            </div>

            <div className="flex gap-3">
              <button onClick={() => setCreating(false)} className="flex-1 font-semibold text-sm py-2.5 rounded-xl"
                style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}>
                Annulla
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || selectedIds.length !== 7 || !newName.trim()}
                className="flex-1 font-display font-black tracking-wide text-sm py-2.5 rounded-xl"
                style={{
                  background: (saving || selectedIds.length !== 7 || !newName.trim()) ? 'var(--surface2)' : 'rgba(212,160,23,0.15)',
                  color: (saving || selectedIds.length !== 7 || !newName.trim()) ? 'var(--text-dim)' : 'var(--gold)',
                  border: `1px solid ${(saving || selectedIds.length !== 7 || !newName.trim()) ? 'var(--border)' : 'rgba(212,160,23,0.4)'}`,
                }}
              >
                {saving ? 'CREAZIONE...' : 'CREA E SORTEGGIA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div key={toast.key}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-xl"
          style={{
            background: toast.ok ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)',
            color: toast.ok ? '#4ade80' : '#f87171',
            border: `1px solid ${toast.ok ? 'rgba(74,222,128,0.35)' : 'rgba(239,68,68,0.35)'}`,
            whiteSpace: 'nowrap',
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}
