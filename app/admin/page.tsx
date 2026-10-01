'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProfile } from '@/hooks/useProfile'

interface AdminUser {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  email_confirmed_at: string | null
  display_name: string | null
  role: 'gm' | 'admin'
  franchiseName: string | null
  franchiseAbbr: string | null
}

type Tab = 'notifications' | 'users' | 'credits' | 'season'

interface AdminNotification {
  id: string
  type: 'gc_earned' | 'shop_purchase' | 'roster_confirmed' | 'franchise_claimed'
  userId: string
  displayName: string | null
  franchiseName: string | null
  franchiseAbbr: string | null
  title: string
  detail: string
  amount?: number
  createdAt: string
  processedAt?: string | null
  processedBy?: string | null
  cancelledAt?: string | null
}

interface GmCreditRow {
  userId: string
  displayName: string | null
  email: string | null
  franchiseName: string | null
  franchiseAbbr: string | null
  gamesPlayed: number
  balance: number
  seasonId: string
}

interface UpgradePlayer {
  slug: string
  displayName: string
  gcSpent: number
}

export default function AdminPage() {
  const router = useRouter()
  const { profile, loading: profileLoading, isAdmin } = useProfile()
  const [tab, setTab] = useState<Tab>('notifications')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  // Notifications
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const [showProcessed, setShowProcessed] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)

  // GM Credits
  const [creditsRows, setCreditsRows] = useState<GmCreditRow[]>([])
  const [creditsLoading, setCreditsLoading] = useState(false)
  const [creditsSeason, setCreditsSeason] = useState<string>('')
  const [editingGames, setEditingGames] = useState<string | null>(null)
  const [editGamesValue, setEditGamesValue] = useState('')
  const [adjustTarget, setAdjustTarget] = useState<GmCreditRow | null>(null)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [adjustLoading, setAdjustLoading] = useState(false)

  // Reset GM dialog
  const [resetGmTarget, setResetGmTarget] = useState<GmCreditRow | null>(null)
  const [resetGmLoading, setResetGmLoading] = useState(false)
  const [upgradePlayerList, setUpgradePlayerList] = useState<UpgradePlayer[]>([])
  const [upgradeListLoading, setUpgradeListLoading] = useState(false)
  const [removingUpgradeSlug, setRemovingUpgradeSlug] = useState<string | null>(null)

  // Reset password
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  // Season
  const [currentSeason, setCurrentSeason] = useState<{ name: string; game_version: string } | null>(null)
  const [newSeasonName, setNewSeasonName] = useState('')
  const [gameVersion, setGameVersion] = useState('2K27')
  const [seasonLoading, setSeasonLoading] = useState(false)

  // Toast (single global)
  const [toast, setToast] = useState<{ msg: string; ok: boolean; key: number } | null>(null)
  function showToast(msg: string, ok = true) {
    setToast({ msg, ok, key: Date.now() })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    if (!profileLoading && !isAdmin) router.replace('/dashboard')
  }, [profileLoading, isAdmin, router])

  useEffect(() => { if (isAdmin) fetchUsers() }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    if (tab === 'credits') fetchCredits()
    if (tab === 'notifications') fetchNotifications()
    if (tab === 'season') fetchSeason()
  }, [isAdmin, tab])

  // ── Notifications ─────────────────────────────────────────────────────────

  async function fetchNotifications() {
    setNotifLoading(true)
    const res = await fetch('/api/admin/notifications')
    const json = await res.json()
    if (!json.error) setNotifications(json.notifications ?? [])
    setNotifLoading(false)
  }

  async function markProcessed(id: string) {
    setProcessingId(id)
    const res = await fetch('/api/admin/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'mark_processed' }),
    })
    const json = await res.json()
    setProcessingId(null)
    if (json.error) { showToast(json.error, false); return }
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, processedAt: new Date().toISOString() } : n))
  }

  async function cancelPurchase(id: string) {
    setProcessingId(id)
    const res = await fetch('/api/admin/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'cancel' }),
    })
    const json = await res.json()
    setProcessingId(null)
    if (json.error) { showToast(json.error, false); return }
    showToast(`Annullato · +${json.refunded} GC rimborsati`)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, cancelledAt: new Date().toISOString() } : n))
  }

  // ── GM Credits ────────────────────────────────────────────────────────────

  async function fetchCredits() {
    setCreditsLoading(true)
    try {
      const res = await fetch('/api/admin/gm-credits')
      const json = await res.json()
      if (json.error) showToast(json.error, false)
      else { setCreditsRows(json.rows ?? []); setCreditsSeason(json.season?.name ?? '') }
    } catch {
      showToast('Errore caricamento crediti', false)
    } finally {
      setCreditsLoading(false)
    }
  }

  async function saveGames(row: GmCreditRow) {
    const g = parseInt(editGamesValue)
    if (isNaN(g) || g < 0 || g > 82) { showToast('Valore non valido (0–82)', false); return }
    setActing(row.userId)
    const res = await fetch('/api/admin/gm-credits', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_games', targetUserId: row.userId, seasonId: row.seasonId, gamesPlayed: g }),
    })
    const json = await res.json()
    setActing(null); setEditingGames(null)
    if (json.error) { showToast(json.error, false); return }
    showToast(`Aggiornato: ${g} partite`)
    fetchCredits()
  }

  async function saveAdjustment() {
    if (!adjustTarget) return
    const amt = parseInt(adjustAmount)
    if (isNaN(amt) || amt === 0) { showToast('Importo non valido', false); return }
    if (!adjustNote.trim()) { showToast('La nota è obbligatoria', false); return }
    setAdjustLoading(true)
    const res = await fetch('/api/admin/gm-credits', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'adjustment', targetUserId: adjustTarget.userId, seasonId: adjustTarget.seasonId, amount: amt, note: adjustNote }),
    })
    const json = await res.json()
    setAdjustLoading(false)
    if (json.error) { showToast(json.error, false); return }
    setAdjustTarget(null); setAdjustAmount(''); setAdjustNote('')
    showToast(`${amt > 0 ? '+' : ''}${amt} GC applicati`)
    fetchCredits()
  }

  // ── Reset GM ──────────────────────────────────────────────────────────────

  async function openResetGm(row: GmCreditRow) {
    setResetGmTarget(row)
    setUpgradePlayerList([])
    setUpgradeListLoading(true)
    const res = await fetch(`/api/admin/gm-shop?userId=${row.userId}&seasonId=${row.seasonId}`)
    const json = await res.json()
    setUpgradePlayerList(json.players ?? [])
    setUpgradeListLoading(false)
  }

  async function resetBalance() {
    if (!resetGmTarget) return
    setResetGmLoading(true)
    const res = await fetch('/api/admin/gm-credits', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_balance', targetUserId: resetGmTarget.userId, seasonId: resetGmTarget.seasonId }),
    })
    const json = await res.json()
    setResetGmLoading(false)
    if (json.error) { showToast(json.error, false); return }
    showToast('GC azzerati')
    fetchCredits()
    setResetGmTarget(prev => prev ? { ...prev, balance: 0 } : null)
  }

  async function resetGames() {
    if (!resetGmTarget) return
    setResetGmLoading(true)
    const res = await fetch('/api/admin/gm-credits', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_games', targetUserId: resetGmTarget.userId, seasonId: resetGmTarget.seasonId }),
    })
    const json = await res.json()
    setResetGmLoading(false)
    if (json.error) { showToast(json.error, false); return }
    showToast('Partite azzerate')
    fetchCredits()
    setResetGmTarget(prev => prev ? { ...prev, gamesPlayed: 0 } : null)
  }

  async function removePlayerUpgrades(playerSlug: string) {
    if (!resetGmTarget) return
    setRemovingUpgradeSlug(playerSlug)
    const res = await fetch('/api/admin/gm-shop', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: resetGmTarget.userId, seasonId: resetGmTarget.seasonId, playerSlug }),
    })
    const json = await res.json()
    setRemovingUpgradeSlug(null)
    if (json.error) { showToast(json.error, false); return }
    setUpgradePlayerList(prev => prev.filter(p => p.slug !== playerSlug))
    showToast('Upgrade rimossi')
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async function fetchUsers() {
    setLoading(true); setError(null)
    const res = await fetch('/api/admin/users')
    const json = await res.json()
    if (json.error) { setError(json.error); setLoading(false); return }
    setUsers(json.users.sort((a: AdminUser, b: AdminUser) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ))
    setLoading(false)
  }

  async function setRole(userId: string, newRole: 'gm' | 'admin') {
    const user = users.find(u => u.id === userId)
    if (!confirm(`${newRole === 'admin' ? 'Promuovere' : 'Rimuovere i privilegi admin da'} ${user?.email ?? userId}?`)) return
    setActing(userId)
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role: newRole }),
    })
    const json = await res.json()
    if (json.error) { showToast(json.error, false); setActing(null); return }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
    setActing(null)
  }

  async function deleteUser(userId: string, email: string) {
    if (!confirm(`Eliminare definitivamente l'account di ${email}?`)) return
    setActing(userId)
    const res = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    const json = await res.json()
    if (json.error) { showToast(json.error, false); setActing(null); return }
    setUsers(prev => prev.filter(u => u.id !== userId))
    setActing(null)
  }

  async function handleResetPassword() {
    if (!resetTarget) return
    if (resetPassword.length < 6) { showToast('Password di almeno 6 caratteri', false); return }
    setResetLoading(true)
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_password', userId: resetTarget.id, password: resetPassword }),
    })
    const json = await res.json()
    setResetLoading(false)
    if (json.error) { showToast(json.error, false); return }
    setResetTarget(null); setResetPassword('')
    showToast(`Password aggiornata per ${resetTarget.display_name ?? resetTarget.email}`)
  }

  // ── Season ────────────────────────────────────────────────────────────────

  async function fetchSeason() {
    const res = await fetch('/api/admin/season')
    const json = await res.json()
    if (json.season) setCurrentSeason(json.season)
  }

  async function advanceSeason() {
    if (!newSeasonName.trim()) { showToast('Inserisci il nome della nuova stagione', false); return }
    if (!confirm(`Sei sicuro di voler chiudere "${currentSeason?.name}" e aprire "${newSeasonName}"?\n\nVengono copiati: franchise, roster, upgrade GM Shop e GC (max 5).`)) return
    setSeasonLoading(true)
    const res = await fetch('/api/admin/season', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newSeasonName: newSeasonName.trim(), gameVersion }),
    })
    const json = await res.json()
    setSeasonLoading(false)
    if (json.error) { showToast(json.error, false); return }
    showToast(`Stagione "${newSeasonName}" aperta!`)
    setNewSeasonName('')
    fetchSeason()
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function fmt(dateStr: string | null) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  if (profileLoading) return null

  const adminCount = users.filter(u => u.role === 'admin').length
  const gmCount = users.filter(u => u.role === 'gm').length
  const confirmedCount = users.filter(u => u.email_confirmed_at).length
  const visibleNotifications = showProcessed
    ? notifications
    : notifications.filter(n => n.type !== 'shop_purchase' || (!n.processedAt && !n.cancelledAt))
  const unprocessedShopCount = notifications.filter(n => n.type === 'shop_purchase' && !n.processedAt && !n.cancelledAt).length

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header className="sticky top-0 z-40" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-xs font-semibold px-3 py-1.5 rounded"
              style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}
            >
              ← Dashboard
            </button>
            <span className="font-display text-lg font-black tracking-wider" style={{ color: 'var(--gold)' }}>BACKOFFICE</span>
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded font-display tracking-wider"
              style={{ background: 'rgba(234,179,8,0.15)', color: 'var(--gold)', border: '1px solid rgba(234,179,8,0.3)' }}>
              ADMIN
            </span>
          </div>
          <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>
            {profile?.display_name ?? profile?.role}
          </span>
        </div>

        {/* Tab bar — equal-width, no scroll */}
        <div className="max-w-5xl mx-auto flex" style={{ borderTop: '1px solid var(--border2)' }}>
          {([
            ['notifications', 'NOTIFICHE', unprocessedShopCount],
            ['users',         'UTENTI',    0],
            ['credits',       'CREDITI',   0],
            ['season',        'STAGIONE',  0],
          ] as [Tab, string, number][]).map(([t, label, badge]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 text-[11px] font-bold py-2.5 transition-colors font-display tracking-wide relative"
              style={{
                color: tab === t ? 'var(--gold)' : 'var(--text-dim)',
                borderBottom: tab === t ? '2px solid var(--gold)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {label}
              {badge > 0 && (
                <span className="ml-1 text-[9px] font-black px-1 py-0.5 rounded tabular-nums align-middle"
                  style={{ background: '#fb923c', color: '#000' }}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        {/* Stats bar */}
        {!loading && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Utenti', value: users.length },
              { label: 'Admin', value: adminCount },
              { label: 'GM', value: gmCount },
            ].map(stat => (
              <div key={stat.label} className="rounded-xl px-3 py-3 text-center"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="font-display text-2xl font-black" style={{ color: 'var(--text)' }}>{stat.value}</div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-dim)' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── NOTIFICATIONS ── */}
        {tab === 'notifications' && (
          <section>
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <h2 className="font-display font-black tracking-wide text-sm" style={{ color: 'var(--text-sec)' }}>ATTIVITÀ RECENTE</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowProcessed(v => !v)}
                  className="text-xs px-3 py-1.5 rounded"
                  style={{
                    background: showProcessed ? 'rgba(74,222,128,0.1)' : 'var(--surface2)',
                    color: showProcessed ? '#4ade80' : 'var(--text-dim)',
                    border: `1px solid ${showProcessed ? 'rgba(74,222,128,0.3)' : 'var(--border)'}`,
                  }}
                >
                  {showProcessed ? '✓ Storico' : '○ Da fare'}
                </button>
                <button onClick={fetchNotifications} className="text-xs px-3 py-1.5 rounded"
                  style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}>
                  Aggiorna
                </button>
              </div>
            </div>

            {notifLoading ? (
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />
              ))}</div>
            ) : visibleNotifications.length === 0 ? (
              <div className="rounded-xl p-8 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-3xl mb-2">🔔</p>
                <p className="font-display font-black text-sm" style={{ color: 'var(--text-sec)' }}>NESSUNA ATTIVITÀ</p>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {visibleNotifications.map((n, i) => {
                  const typeInfo = {
                    gc_earned:         { icon: '💎', color: '#4ade80',      label: 'GC' },
                    shop_purchase:     { icon: '🛒', color: '#fb923c',      label: 'UPGRADE' },
                    roster_confirmed:  { icon: '✅', color: '#60a5fa',      label: 'ROSTER' },
                    franchise_claimed: { icon: '🏀', color: 'var(--gold)',  label: 'FRANCHISE' },
                  }[n.type]
                  const isCancelled = n.type === 'shop_purchase' && !!n.cancelledAt
                  const isProcessed = n.type === 'shop_purchase' && !!n.processedAt && !isCancelled
                  const isProcessing = processingId === n.id
                  const isDone = isProcessed || isCancelled

                  return (
                    <div key={n.id} className="flex flex-col px-4 py-3 gap-2"
                      style={{
                        background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
                        borderBottom: i < visibleNotifications.length - 1 ? '1px solid var(--border)' : 'none',
                        opacity: isDone ? 0.5 : 1,
                      }}>
                      <div className="flex items-start gap-3">
                        <div className="text-lg w-7 text-center shrink-0 mt-0.5">
                          {isCancelled ? '🚫' : isProcessed ? '✅' : typeInfo.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded font-display tracking-wider shrink-0"
                              style={{ background: `${typeInfo.color}18`, color: typeInfo.color, border: `1px solid ${typeInfo.color}44` }}>
                              {isCancelled ? 'ANNULLATO' : typeInfo.label}
                            </span>
                            <span className="text-sm font-semibold" style={{ color: 'var(--text)', textDecoration: isDone ? 'line-through' : 'none', wordBreak: 'break-word' }}>
                              {n.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-xs font-semibold" style={{ color: 'var(--text-sec)' }}>
                              {n.displayName ?? n.userId.slice(0, 8)}
                            </span>
                            {n.franchiseAbbr && (
                              <span className="text-xs font-black font-display" style={{ color: 'var(--text-dim)' }}>· {n.franchiseAbbr}</span>
                            )}
                            {n.detail && (
                              <span className="text-xs" style={{ color: 'var(--text-dim)', wordBreak: 'break-word' }}>· {n.detail}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-[11px] shrink-0 text-right" style={{ color: 'var(--text-dim)' }}>
                          {new Date(n.createdAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                          <br />
                          {new Date(n.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>

                      {(n.amount !== undefined || (n.type === 'shop_purchase' && !isDone)) && (
                        <div className="flex items-center justify-between pl-10">
                          {n.amount !== undefined ? (
                            <span className="font-display font-black text-sm" style={{ color: n.amount > 0 ? '#4ade80' : '#f87171' }}>
                              {n.amount > 0 ? '+' : ''}{n.amount} GC
                            </span>
                          ) : <span />}
                          {n.type === 'shop_purchase' && !isDone && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => cancelPurchase(n.id)}
                                disabled={isProcessing}
                                className="text-xs font-semibold px-3 py-2 rounded-lg"
                                style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', opacity: isProcessing ? 0.5 : 1 }}
                              >
                                {isProcessing ? '…' : '🚫 Annulla'}
                              </button>
                              <button
                                onClick={() => markProcessed(n.id)}
                                disabled={isProcessing}
                                className="text-xs font-semibold px-3 py-2 rounded-lg"
                                style={{ background: 'rgba(74,222,128,0.08)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)', opacity: isProcessing ? 0.5 : 1 }}
                              >
                                {isProcessing ? '…' : '✓ Fatto su PS'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* ── GM CREDITS ── */}
        {tab === 'credits' && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-black tracking-wide text-sm" style={{ color: 'var(--text-sec)' }}>
                GM CREDITS — {creditsSeason}
              </h2>
              <button onClick={fetchCredits} className="text-xs px-3 py-1.5 rounded"
                style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}>
                Aggiorna
              </button>
            </div>

            {creditsLoading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />
              ))}</div>
            ) : creditsRows.length === 0 ? (
              <div className="rounded-xl p-6 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nessun GM assegnato a questa stagione.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {creditsRows.map(row => {
                  const isEditing = editingGames === row.userId
                  const isAct = acting === row.userId
                  return (
                    <div key={row.userId} className="rounded-xl px-4 py-3"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', opacity: isAct ? 0.6 : 1 }}>
                      {/* Row top: name + balance */}
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
                            {row.displayName ?? row.email ?? row.userId.slice(0, 8)}
                          </div>
                          {row.franchiseName && (
                            <div className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
                              {row.franchiseAbbr} · {row.franchiseName}
                            </div>
                          )}
                        </div>
                        <div className="font-display text-2xl font-black shrink-0"
                          style={{ color: row.balance > 0 ? 'var(--gold)' : 'var(--text-dim)' }}>
                          {row.balance} <span className="text-xs font-bold">GC</span>
                        </div>
                      </div>

                      {/* Row bottom: games + actions */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Games played inline edit */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>Partite:</span>
                          {isEditing ? (
                            <>
                              <input
                                type="number" min={0} max={82}
                                value={editGamesValue}
                                onChange={e => setEditGamesValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveGames(row); if (e.key === 'Escape') setEditingGames(null) }}
                                autoFocus
                                className="w-14 text-center text-sm font-bold rounded px-1 py-0.5"
                                style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--gold)' }}
                              />
                              <button onClick={() => saveGames(row)} className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                                style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>✓</button>
                              <button onClick={() => setEditingGames(null)} className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                                style={{ background: 'var(--surface2)', color: 'var(--text-dim)' }}>✕</button>
                            </>
                          ) : (
                            <button
                              onClick={() => { setEditingGames(row.userId); setEditGamesValue(String(row.gamesPlayed)) }}
                              className="text-sm font-bold px-2 py-0.5 rounded"
                              style={{ color: 'var(--text)', background: 'transparent', border: '1px dashed var(--border)' }}
                            >
                              {row.gamesPlayed}
                            </button>
                          )}
                        </div>

                        <div className="ml-auto flex items-center gap-2">
                          <button
                            onClick={() => { setAdjustTarget(row); setAdjustAmount(''); setAdjustNote('') }}
                            className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg"
                            style={{ background: 'rgba(251,146,60,0.1)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.25)' }}
                          >
                            ± GC
                          </button>
                          <button
                            onClick={() => openResetGm(row)}
                            className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg"
                            style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* ── USERS ── */}
        {tab === 'users' && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-black tracking-wide text-sm" style={{ color: 'var(--text-sec)' }}>GESTIONE UTENTI</h2>
              <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>{confirmedCount}/{users.length} confermati</span>
            </div>

            {loading ? (
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />
              ))}</div>
            ) : error ? (
              <div className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {users.map(user => {
                  const isSelf = user.id === profile?.id
                  const isDisabled = acting === user.id
                  return (
                    <div key={user.id} className="rounded-xl px-4 py-3"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', opacity: isDisabled ? 0.6 : 1 }}>
                      {/* Top: name + role */}
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                              {user.display_name ?? user.email}
                            </span>
                            <RoleBadge role={user.role} />
                            {!user.email_confirmed_at && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                                style={{ background: 'rgba(251,146,60,0.1)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.25)' }}>
                                non confermato
                              </span>
                            )}
                            {isSelf && <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>(tu)</span>}
                          </div>
                          {user.display_name && (
                            <div className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{user.email}</div>
                          )}
                        </div>
                      </div>

                      {/* Middle: franchise + dates */}
                      <div className="flex gap-3 flex-wrap mb-2">
                        {user.franchiseName ? (
                          <span className="text-[11px] font-semibold" style={{ color: 'var(--gold)' }}>
                            {user.franchiseAbbr} · {user.franchiseName}
                          </span>
                        ) : (
                          <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>nessuna squadra</span>
                        )}
                        <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>· Reg. {fmt(user.created_at)}</span>
                      </div>

                      {/* Actions */}
                      {!isSelf && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {user.role === 'gm' ? (
                            <button onClick={() => setRole(user.id, 'admin')} disabled={isDisabled}
                              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                              style={{ background: 'rgba(234,179,8,0.1)', color: 'var(--gold)', border: '1px solid rgba(234,179,8,0.3)' }}>
                              {isDisabled ? '…' : '↑ Admin'}
                            </button>
                          ) : (
                            <button onClick={() => setRole(user.id, 'gm')} disabled={isDisabled}
                              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                              style={{ background: 'rgba(148,163,184,0.1)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}>
                              {isDisabled ? '…' : '↓ GM'}
                            </button>
                          )}
                          <button onClick={() => { setResetTarget(user); setResetPassword('') }} disabled={isDisabled}
                            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                            style={{ background: 'rgba(96,165,250,0.08)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' }}>
                            {isDisabled ? '…' : 'Reset pwd'}
                          </button>
                          <button onClick={() => deleteUser(user.id, user.email ?? '')} disabled={isDisabled}
                            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                            style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                            {isDisabled ? '…' : 'Elimina'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* ── SEASON ── */}
        {tab === 'season' && (
          <section className="space-y-4">
            <h2 className="font-display font-black tracking-wide text-sm" style={{ color: 'var(--text-sec)' }}>GESTIONE STAGIONE</h2>

            <div className="rounded-xl px-5 py-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="text-[10px] font-black tracking-widest mb-1" style={{ color: 'var(--text-dim)' }}>STAGIONE ATTIVA</div>
              <div className="font-display text-2xl font-black" style={{ color: 'var(--gold)' }}>{currentSeason?.name ?? '—'}</div>
              {currentSeason?.game_version && (
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>NBA2K {currentSeason.game_version}</div>
              )}
            </div>

            <div className="rounded-xl px-5 py-5 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div>
                <div className="font-display font-black tracking-wide text-sm mb-1" style={{ color: 'var(--text)' }}>AVANZA STAGIONE</div>
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  Copia automaticamente: franchise, roster, upgrade GM Shop e GC (max 5 per GM).
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-sec)' }}>NOME NUOVA STAGIONE</label>
                  <input
                    type="text" value={newSeasonName} onChange={e => setNewSeasonName(e.target.value)}
                    placeholder="es. Stagione 2 — 2K28"
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-sec)' }}>VERSIONE GIOCO</label>
                  <input
                    type="text" value={gameVersion} onChange={e => setGameVersion(e.target.value)}
                    placeholder="es. 2K28"
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
                  />
                </div>
              </div>

              <button
                onClick={advanceSeason}
                disabled={seasonLoading || !newSeasonName.trim()}
                className="font-display font-black tracking-wide text-sm px-6 py-3 rounded-xl w-full"
                style={{
                  background: (seasonLoading || !newSeasonName.trim()) ? 'var(--surface2)' : 'rgba(234,179,8,0.15)',
                  color: (seasonLoading || !newSeasonName.trim()) ? 'var(--text-dim)' : 'var(--gold)',
                  border: `1px solid ${(seasonLoading || !newSeasonName.trim()) ? 'var(--border)' : 'rgba(234,179,8,0.4)'}`,
                }}
              >
                {seasonLoading ? 'Avanzamento in corso...' : '⚡ AVANZA STAGIONE'}
              </button>

              <div className="rounded-lg px-4 py-3" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <p className="text-[11px]" style={{ color: '#f87171' }}>
                  ⚠️ Operazione irreversibile. La stagione corrente verrà chiusa definitivamente.
                </p>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* ── DIALOG: Adjustment ── */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget) setAdjustTarget(null) }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div>
              <h2 className="font-display text-xl font-black tracking-wider" style={{ color: 'var(--text)' }}>AGGIUSTAMENTO GC</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
                {adjustTarget.displayName ?? adjustTarget.email} · <strong style={{ color: 'var(--gold)' }}>{adjustTarget.balance} GC</strong>
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-sec)' }}>IMPORTO (negativo = sottrai)</label>
                <input type="number" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)}
                  placeholder="es. +5 o -3" className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }} />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-sec)' }}>NOTA OBBLIGATORIA</label>
                <input type="text" value={adjustNote} onChange={e => setAdjustNote(e.target.value)}
                  placeholder="Motivo..." className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }} />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setAdjustTarget(null)} className="flex-1 font-semibold text-sm py-2.5 rounded-xl"
                style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}>Annulla</button>
              <button onClick={saveAdjustment} disabled={adjustLoading} className="flex-1 font-display font-black tracking-wide text-sm py-2.5 rounded-xl"
                style={{ background: 'rgba(251,146,60,0.15)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.35)', opacity: adjustLoading ? 0.6 : 1 }}>
                {adjustLoading ? '...' : 'APPLICA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DIALOG: Reset GM ── */}
      {resetGmTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget) setResetGmTarget(null) }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div>
              <h2 className="font-display text-xl font-black tracking-wider" style={{ color: 'var(--text)' }}>RESET GM</h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-dim)' }}>
                {resetGmTarget.displayName ?? resetGmTarget.email}
              </p>
            </div>

            {/* Reset GC */}
            <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>GM Credits</div>
                  <div className="text-xs" style={{ color: 'var(--text-dim)' }}>Saldo attuale: {resetGmTarget.balance} GC</div>
                </div>
                <button onClick={resetBalance} disabled={resetGmLoading || resetGmTarget.balance === 0}
                  className="text-xs font-semibold px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)', opacity: (resetGmLoading || resetGmTarget.balance === 0) ? 0.5 : 1 }}>
                  Azzera GC
                </button>
              </div>
            </div>

            {/* Reset games */}
            <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Partite giocate</div>
                  <div className="text-xs" style={{ color: 'var(--text-dim)' }}>Attuale: {resetGmTarget.gamesPlayed}</div>
                </div>
                <button onClick={resetGames} disabled={resetGmLoading || resetGmTarget.gamesPlayed === 0}
                  className="text-xs font-semibold px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)', opacity: (resetGmLoading || resetGmTarget.gamesPlayed === 0) ? 0.5 : 1 }}>
                  Azzera
                </button>
              </div>
            </div>

            {/* Reset upgrades per player */}
            <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Upgrade GM Shop per giocatore</div>
              {upgradeListLoading ? (
                <div className="space-y-1.5">{Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-8 rounded-lg animate-pulse" style={{ background: 'var(--surface)' }} />
                ))}</div>
              ) : upgradePlayerList.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Nessun upgrade presente.</p>
              ) : (
                <div className="space-y-1.5">
                  {upgradePlayerList.map(p => (
                    <div key={p.slug} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <div>
                        <div className="text-xs font-semibold capitalize" style={{ color: 'var(--text)' }}>{p.displayName}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{p.gcSpent} GC spesi</div>
                      </div>
                      <button onClick={() => removePlayerUpgrades(p.slug)}
                        disabled={removingUpgradeSlug === p.slug}
                        className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg shrink-0"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)', opacity: removingUpgradeSlug === p.slug ? 0.5 : 1 }}>
                        {removingUpgradeSlug === p.slug ? '…' : 'Rimuovi'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => setResetGmTarget(null)} className="w-full font-semibold text-sm py-2.5 rounded-xl"
              style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}>
              Chiudi
            </button>
          </div>
        </div>
      )}

      {/* ── DIALOG: Reset password ── */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget) setResetTarget(null) }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div>
              <h2 className="font-display text-xl font-black tracking-wider" style={{ color: 'var(--text)' }}>RESET PASSWORD</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>{resetTarget.display_name ?? resetTarget.email}</p>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-sec)' }}>NUOVA PASSWORD (min 6 caratteri)</label>
              <input type="text" value={resetPassword} onChange={e => setResetPassword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleResetPassword() }}
                placeholder="es. Goat2026!" autoFocus
                className="w-full px-3 py-2 rounded-lg text-sm font-mono"
                style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }} />
              <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-dim)' }}>Comunica questa password al GM via canale privato.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setResetTarget(null)} className="flex-1 font-semibold text-sm py-2.5 rounded-xl"
                style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}>Annulla</button>
              <button onClick={handleResetPassword} disabled={resetLoading || resetPassword.length < 6}
                className="flex-1 font-display font-black tracking-wide text-sm py-2.5 rounded-xl"
                style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.35)', opacity: (resetLoading || resetPassword.length < 6) ? 0.5 : 1 }}>
                {resetLoading ? '...' : 'AGGIORNA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
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

function RoleBadge({ role }: { role: 'gm' | 'admin' }) {
  if (role === 'admin') {
    return (
      <span className="text-[10px] font-black px-1.5 py-0.5 rounded font-display tracking-wider shrink-0"
        style={{ background: 'rgba(234,179,8,0.15)', color: 'var(--gold)', border: '1px solid rgba(234,179,8,0.3)' }}>
        ADMIN
      </span>
    )
  }
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
      style={{ background: 'var(--surface2)', color: 'var(--text-dim)', border: '1px solid var(--border2)' }}>
      GM
    </span>
  )
}
