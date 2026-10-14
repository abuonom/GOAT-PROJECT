'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProfile } from '@/hooks/useProfile'
import type { GoatDraftStatus } from '@/types/dunkest'

interface SessionSummary {
  id: string
  name: string
  status: GoatDraftStatus
  current_round: number
  total_picks: number
  created_at: string
  updated_at: string
}

interface AdminUser {
  id: string
  email: string
  display_name: string | null
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

  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)

  // Create session dialog
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const [toast, setToast] = useState<{ msg: string; ok: boolean; key: number } | null>(null)

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok, key: Date.now() })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    if (!profileLoading) fetchSessions()
  }, [profileLoading])

  async function fetchSessions() {
    setLoading(true)
    const res = await fetch('/api/goat-draft')
    const json = await res.json()
    if (!json.error) setSessions(json.sessions ?? [])
    setLoading(false)
  }

  async function openCreate() {
    setCreating(true)
    setNewName('')
    setSelectedIds([])
    if (users.length === 0) {
      setUsersLoading(true)
      const res = await fetch('/api/admin/users')
      const json = await res.json()
      setUsers(json.users ?? [])
      setUsersLoading(false)
    }
  }

  function toggleUser(id: string) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 8 ? [...prev, id] : prev
    )
  }

  async function handleCreate() {
    if (!newName.trim()) { showToast('Inserisci un nome per la sessione', false); return }
    if (selectedIds.length !== 8) { showToast('Seleziona esattamente 8 partecipanti', false); return }
    setSaving(true)
    const displayNames: Record<string, string> = {}
    selectedIds.forEach(id => {
      const u = users.find(u => u.id === id)
      displayNames[id] = u?.display_name ?? u?.email ?? id
    })
    const res = await fetch('/api/goat-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), participantUserIds: selectedIds, participantDisplayNames: displayNames }),
    })
    const json = await res.json()
    setSaving(false)
    if (json.error) { showToast(json.error, false); return }
    setCreating(false)
    router.push(`/goat-draft/${json.id}`)
  }

  if (profileLoading) return null

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
              <span className="font-display text-lg font-black tracking-wider" style={{ color: 'var(--gold)' }}>
                DUNKEST GOAT DRAFT
              </span>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={openCreate}
              className="font-display font-black tracking-wide text-xs px-4 py-2 rounded-lg"
              style={{ background: 'rgba(212,160,23,0.15)', color: 'var(--gold)', border: '1px solid rgba(212,160,23,0.4)' }}
            >
              + NUOVA SESSIONE
            </button>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />
            ))}
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
                className="w-full rounded-xl px-4 py-4 text-left transition-colors"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-display font-black text-base tracking-wide truncate" style={{ color: 'var(--text)' }}>
                      {s.name}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
                      Giro {s.current_round} · {s.total_picks} pick
                      {' · '}
                      {new Date(s.updated_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                    </div>
                  </div>
                  <span
                    className="text-[10px] font-black font-display tracking-wider px-2 py-1 rounded shrink-0"
                    style={{
                      background: `${STATUS_COLOR[s.status]}18`,
                      color: STATUS_COLOR[s.status],
                      border: `1px solid ${STATUS_COLOR[s.status]}44`,
                    }}
                  >
                    {STATUS_LABEL[s.status]}
                  </span>
                </div>
              </button>
            ))}
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
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <h2 className="font-display text-xl font-black tracking-wider" style={{ color: 'var(--text)' }}>
              NUOVA SESSIONE
            </h2>

            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-sec)' }}>
                NOME SESSIONE
              </label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="es. GOAT Draft 2026"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold" style={{ color: 'var(--text-sec)' }}>
                  PARTECIPANTI ({selectedIds.length}/8)
                </label>
                {selectedIds.length === 8 && (
                  <span className="text-[10px] font-black text-green-400">✓ COMPLETO</span>
                )}
              </div>
              {usersLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: 'var(--surface2)' }} />)}
                </div>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {users.map(u => {
                    const selected = selectedIds.includes(u.id)
                    return (
                      <button
                        key={u.id}
                        onClick={() => toggleUser(u.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
                        style={{
                          background: selected ? 'rgba(212,160,23,0.1)' : 'var(--surface2)',
                          border: `1px solid ${selected ? 'rgba(212,160,23,0.4)' : 'var(--border)'}`,
                          opacity: !selected && selectedIds.length >= 8 ? 0.4 : 1,
                        }}
                      >
                        <div
                          className="w-4 h-4 rounded flex items-center justify-center shrink-0 text-[10px] font-black"
                          style={{
                            background: selected ? 'var(--gold)' : 'var(--border)',
                            color: selected ? '#000' : 'transparent',
                          }}
                        >
                          {selected ? selectedIds.indexOf(u.id) + 1 : ''}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                            {u.display_name ?? u.email}
                          </div>
                          {u.display_name && (
                            <div className="text-[11px] truncate" style={{ color: 'var(--text-dim)' }}>{u.email}</div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div
              className="rounded-lg px-4 py-3 text-xs"
              style={{ background: 'rgba(212,160,23,0.05)', border: '1px solid rgba(212,160,23,0.2)', color: 'var(--text-dim)' }}
            >
              L'ordine iniziale verrà estratto casualmente dopo la conferma. Il primo giro rispetta l'ordine sorteggiato.
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setCreating(false)}
                className="flex-1 font-semibold text-sm py-2.5 rounded-xl"
                style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}
              >
                Annulla
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || selectedIds.length !== 8 || !newName.trim()}
                className="flex-1 font-display font-black tracking-wide text-sm py-2.5 rounded-xl"
                style={{
                  background: (saving || selectedIds.length !== 8 || !newName.trim())
                    ? 'var(--surface2)'
                    : 'rgba(212,160,23,0.15)',
                  color: (saving || selectedIds.length !== 8 || !newName.trim())
                    ? 'var(--text-dim)'
                    : 'var(--gold)',
                  border: `1px solid ${(saving || selectedIds.length !== 8 || !newName.trim()) ? 'var(--border)' : 'rgba(212,160,23,0.4)'}`,
                }}
              >
                {saving ? 'CREAZIONE...' : 'CREA E SORTEGGIA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          key={toast.key}
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
