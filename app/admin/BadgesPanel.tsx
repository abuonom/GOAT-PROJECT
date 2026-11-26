'use client'

import { useRef, useState } from 'react'
import { BADGE_CATALOG, BADGE_TIERS, findCatalogBadge } from '@/lib/badges/catalog'

// Backoffice: aggiungere cartellini ai giocatori esistenti.
// Serve quando il giocatore è cresciuto nel gioco ma l'app ha ancora i dati vecchi.

type Badge = { name: string; tier: string; category: string; manual?: boolean }
type Found = { slug: string; name: string; overall: number; team: string; badgeCount: number }
type Selected = { slug: string; name: string; overall: number; team: string; badges: Badge[] }

const TIER_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'Legend':       { color: '#fca5a5', bg: 'rgba(239,68,68,0.2)',    border: 'rgba(239,68,68,0.5)' },
  'Hall of Fame': { color: '#d8b4fe', bg: 'rgba(168,85,247,0.2)',   border: 'rgba(168,85,247,0.5)' },
  'Gold':         { color: '#fde047', bg: 'rgba(234,179,8,0.2)',    border: 'rgba(234,179,8,0.5)' },
  'Silver':       { color: '#cbd5e1', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.4)' },
  'Bronze':       { color: '#fdba74', bg: 'rgba(180,83,9,0.2)',     border: 'rgba(180,83,9,0.5)' },
}

const TIER_LABEL: Record<string, string> = { 'Hall of Fame': 'HOF' }

export default function BadgesPanel({ showToast }: { showToast: (msg: string, ok?: boolean) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Found[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<Selected | null>(null)
  const [badgeName, setBadgeName] = useState('')
  const [tier, setTier] = useState<string>('Bronze')
  const [saving, setSaving] = useState(false)
  const searchSeq = useRef(0)

  // Ricerca con piccola attesa, ignorando le risposte arrivate in ritardo
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function onQueryChange(value: string) {
    setQuery(value)
    if (timer.current) clearTimeout(timer.current)
    const q = value.trim()
    const seq = ++searchSeq.current
    if (q.length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/admin/player-badges?q=${encodeURIComponent(q)}`)
      const json = await res.json()
      if (seq !== searchSeq.current) return
      setSearching(false)
      setResults(json.players ?? [])
    }, 250)
  }

  async function pick(slug: string) {
    const res = await fetch(`/api/admin/player-badges?slug=${encodeURIComponent(slug)}`)
    const json = await res.json()
    if (json.error) { showToast(json.error, false); return }
    setSelected(json.player)
    searchSeq.current++
    setResults([])
    setSearching(false)
    setQuery('')
    setBadgeName('')
  }

  async function addBadge() {
    if (!selected) return
    setSaving(true)
    const res = await fetch('/api/admin/player-badges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: selected.slug, name: badgeName, tier }),
    })
    const json = await res.json()
    setSaving(false)
    if (json.error) { showToast(json.error, false); return }
    showToast(`${json.badge.name} (${json.badge.tier}) aggiunto a ${selected.name}`)
    setBadgeName('')
    await pick(selected.slug)
  }

  async function removeBadge(b: Badge) {
    if (!selected) return
    if (!confirm(`Togliere ${b.name} (${b.tier}) a ${selected.name}?`)) return
    const res = await fetch('/api/admin/player-badges', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: selected.slug, name: b.name }),
    })
    const json = await res.json()
    if (json.error) { showToast(json.error, false); return }
    showToast('Cartellino tolto')
    await pick(selected.slug)
  }

  const owned = new Set((selected?.badges ?? []).map(b => b.name.toLowerCase()))
  const known = findCatalogBadge(badgeName)
  const alreadyHas = badgeName.trim() !== '' && owned.has((known?.name ?? badgeName.trim()).toLowerCase())
  const canAdd = !!selected && badgeName.trim().length > 0 && !alreadyHas && !saving

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display font-black tracking-wide text-sm" style={{ color: 'var(--text-sec)' }}>AGGIUNGI CARTELLINI</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
          Se un giocatore è cresciuto nel gioco ma l&apos;app ha ancora i dati vecchi, aggiungigli qui i cartellini che non ha.
          I cartellini aggiunti a mano non vengono cancellati dagli aggiornamenti automatici dei dati.
        </p>
      </div>

      {/* 1. Giocatore */}
      <div className="rounded-xl px-5 py-4 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="text-[10px] font-black tracking-widest" style={{ color: 'var(--text-dim)' }}>1 · GIOCATORE</div>
        <input
          type="text" value={query} onChange={e => onQueryChange(e.target.value)}
          placeholder="Cerca per nome (almeno 2 lettere)"
          className="w-full px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
        />
        {searching && <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Ricerca…</p>}
        {results.length > 0 && (
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {results.map(p => (
              <button key={p.slug} onClick={() => pick(p.slug)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left"
                style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{p.name}</span>
                <span className="text-xs tabular-nums" style={{ color: 'var(--text-dim)' }}>
                  {p.team} · OVR {p.overall} · {p.badgeCount} cartellini
                </span>
              </button>
            ))}
          </div>
        )}
        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Nessun giocatore trovato.</p>
        )}
      </div>

      {/* 2. Cartellino */}
      {selected && (
        <div className="rounded-xl px-5 py-4 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-baseline justify-between gap-3">
            <div className="font-display text-xl font-black" style={{ color: 'var(--gold)' }}>{selected.name}</div>
            <div className="text-xs tabular-nums" style={{ color: 'var(--text-dim)' }}>
              {selected.team} · OVR {selected.overall} · {selected.badges.length} cartellini
            </div>
          </div>

          {/* Cartellini attuali */}
          {selected.badges.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {selected.badges.map(b => {
                const s = TIER_STYLE[b.tier] ?? TIER_STYLE.Bronze
                return (
                  <span key={b.name} className="text-xs px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1.5"
                    style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                    {b.name} · {TIER_LABEL[b.tier] ?? b.tier}
                    {b.manual && (
                      <button onClick={() => removeBadge(b)} title="Togli (aggiunto a mano)"
                        className="font-black leading-none" style={{ color: s.color }}>×</button>
                    )}
                  </span>
                )
              })}
            </div>
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Questo giocatore non ha ancora cartellini.</p>
          )}

          <div className="space-y-3 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="text-[10px] font-black tracking-widest pt-3" style={{ color: 'var(--text-dim)' }}>2 · NUOVO CARTELLINO</div>
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
                  Non è nel catalogo: verrà salvato così com&apos;è, senza categoria.
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

            <button onClick={addBadge} disabled={!canAdd}
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
      )}
    </section>
  )
}
