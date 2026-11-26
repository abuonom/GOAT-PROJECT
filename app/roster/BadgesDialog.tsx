'use client'

import { useState } from 'react'
import { BADGE_CATALOG, BADGE_TIERS, findCatalogBadge } from '@/lib/badges/catalog'

// Pannello "Cartellini" di un giocatore del roster.
// Serve quando il giocatore è cresciuto nel gioco ma l'app ha ancora i dati vecchi:
// il GM aggiunge i cartellini che il giocatore non ha.

export type PlayerBadge = { name: string; tier: string; category: string; manual?: boolean }

interface Props {
  slug: string
  playerName: string
  badges: PlayerBadge[]
  onClose: () => void
  onChanged: () => Promise<void> | void
  onMessage: (msg: string, ok: boolean) => void
}

const TIER_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'Legend':       { color: '#fca5a5', bg: 'rgba(239,68,68,0.2)',    border: 'rgba(239,68,68,0.5)' },
  'Hall of Fame': { color: '#d8b4fe', bg: 'rgba(168,85,247,0.2)',   border: 'rgba(168,85,247,0.5)' },
  'Gold':         { color: '#fde047', bg: 'rgba(234,179,8,0.2)',    border: 'rgba(234,179,8,0.5)' },
  'Silver':       { color: '#cbd5e1', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.4)' },
  'Bronze':       { color: '#fdba74', bg: 'rgba(180,83,9,0.2)',     border: 'rgba(180,83,9,0.5)' },
}
const TIER_LABEL: Record<string, string> = { 'Hall of Fame': 'HOF' }
const TIER_RANK = ['Legend', 'Hall of Fame', 'Gold', 'Silver', 'Bronze']

export default function BadgesDialog({ slug, playerName, badges, onClose, onChanged, onMessage }: Props) {
  const [badgeName, setBadgeName] = useState('')
  const [tier, setTier] = useState<string>('Bronze')
  const [saving, setSaving] = useState(false)

  const owned = new Set(badges.map(b => b.name.toLowerCase()))
  const known = findCatalogBadge(badgeName)
  const alreadyHas = badgeName.trim() !== '' && owned.has((known?.name ?? badgeName.trim()).toLowerCase())
  const canAdd = badgeName.trim().length > 0 && !alreadyHas && !saving

  const sorted = [...badges].sort((a, b) => TIER_RANK.indexOf(a.tier) - TIER_RANK.indexOf(b.tier))

  async function add() {
    setSaving(true)
    const res = await fetch('/api/roster/badges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, name: badgeName, tier }),
    })
    const json = await res.json()
    setSaving(false)
    if (json.error) { onMessage(json.error, false); return }
    onMessage(`${json.badge.name} (${json.badge.tier}) aggiunto a ${playerName}`, true)
    setBadgeName('')
    await onChanged()
  }

  async function remove(b: PlayerBadge) {
    if (!confirm(`Togliere ${b.name} (${b.tier}) a ${playerName}?`)) return
    const res = await fetch('/api/roster/badges', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, name: b.name }),
    })
    const json = await res.json()
    if (json.error) { onMessage(json.error, false); return }
    onMessage('Cartellino tolto', true)
    await onChanged()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-2xl flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '90vh' }}>

        <div className="px-5 py-4 flex items-center justify-between gap-3 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="min-w-0">
            <div className="text-[10px] font-black tracking-widest" style={{ color: 'var(--text-dim)' }}>CARTELLINI</div>
            <div className="font-display text-xl font-black truncate" style={{ color: 'var(--gold)' }}>{playerName}</div>
          </div>
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded shrink-0"
            style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}>✕</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          <div>
            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-sec)' }}>
              Ha {badges.length} cartellini
            </div>
            {sorted.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {sorted.map(b => {
                  const s = TIER_STYLE[b.tier] ?? TIER_STYLE.Bronze
                  return (
                    <span key={b.name} className="text-xs px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1.5"
                      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                      {b.name} · {TIER_LABEL[b.tier] ?? b.tier}
                      {b.manual && (
                        <button onClick={() => remove(b)} title="Togli (aggiunto da te)"
                          className="font-black leading-none" style={{ color: s.color }}>×</button>
                      )}
                    </span>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Nessun cartellino.</p>
            )}
            {badges.some(b => b.manual) && (
              <p className="text-[11px] mt-2" style={{ color: 'var(--text-dim)' }}>
                Con la × puoi togliere i cartellini aggiunti a mano, se hai sbagliato.
              </p>
            )}
          </div>

          <div className="space-y-3 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="font-display font-black tracking-wide text-sm" style={{ color: 'var(--text)' }}>AGGIUNGI UN CARTELLINO</div>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
              Se nel gioco {playerName} ha un cartellino che qui manca, aggiungilo. Vale per i cartellini che non ha:
              per far salire di livello uno che ha già, usa il GM Shop.
            </p>

            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-sec)' }}>NOME</label>
              <input
                list="badge-catalog" type="text" value={badgeName} onChange={e => setBadgeName(e.target.value)}
                placeholder="Es. Set Shooter"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
              />
              <datalist id="badge-catalog">
                {BADGE_CATALOG.filter(b => !owned.has(b.name.toLowerCase())).map(b => (
                  <option key={b.name} value={b.name}>{b.category}</option>
                ))}
              </datalist>
              {alreadyHas && (
                <p className="text-xs mt-1.5" style={{ color: '#f87171' }}>Il giocatore ha già questo cartellino.</p>
              )}
              {badgeName.trim() !== '' && !known && !alreadyHas && (
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-dim)' }}>
                  Non è nell&apos;elenco: verrà salvato così com&apos;è. Controlla di averlo scritto giusto.
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-sec)' }}>LIVELLO</label>
              <div className="grid grid-cols-5 gap-2">
                {BADGE_TIERS.map(t => {
                  const s = TIER_STYLE[t]
                  const on = tier === t
                  return (
                    <button key={t} onClick={() => setTier(t)}
                      className="py-2 rounded-lg text-[11px] font-bold tracking-wide"
                      style={{
                        background: on ? s.bg : 'var(--surface2)',
                        color: on ? s.color : 'var(--text-dim)',
                        border: `1px solid ${on ? s.border : 'var(--border)'}`,
                      }}>
                      {TIER_LABEL[t] ?? t}
                    </button>
                  )
                })}
              </div>
            </div>

            <button onClick={add} disabled={!canAdd}
              className="font-display font-black tracking-wide text-sm px-6 py-3 rounded-xl w-full"
              style={{
                background: canAdd ? 'rgba(234,179,8,0.15)' : 'var(--surface2)',
                color: canAdd ? 'var(--gold)' : 'var(--text-dim)',
                border: `1px solid ${canAdd ? 'rgba(234,179,8,0.4)' : 'var(--border)'}`,
              }}>
              {saving ? 'Salvataggio…' : '＋ AGGIUNGI CARTELLINO'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
