'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { GmShopAttribute } from '@/types/league'
import { calculateUpgradeCost, GM_SHOP_RULES } from '@/lib/gm-shop/rules'

interface RosterEntry {
  slug: string
  name: string
  overall: number
  positions: string[]
  upgradeCount: number
  upgrades: { attribute_key: string; old_value: number | null; new_value: number | null; gc_cost: number }[]
}

interface RosterResponse {
  roster: RosterEntry[]
  balance: number
}

interface Props { isSuperAdmin: boolean }

const CATEGORIES = ['Tiro', 'Finishing', 'Playmaking', 'Difesa', 'Atletismo', 'Badge'] as const

function ovrColor(v: number) {
  if (v >= 95) return '#fde047'
  if (v >= 90) return '#c084fc'
  if (v >= 85) return '#60a5fa'
  if (v >= 80) return '#4ade80'
  return 'var(--text-sec)'
}

// Un solo schermo: giocatore → attributo → valore → costo → Acquista.
// Il server ricalcola e valida tutto; qui la preview è solo per l'interfaccia.
export default function GmShopClient({ isSuperAdmin }: Props) {
  const router = useRouter()

  const [roster, setRoster] = useState<RosterResponse | null>(null)
  const [catalog, setCatalog] = useState<GmShopAttribute[]>([])
  const [loading, setLoading] = useState(true)
  const [shopOpen, setShopOpen] = useState(true)
  const [togglingShop, setTogglingShop] = useState(false)

  const [selected, setSelected] = useState<RosterEntry | null>(null)
  const [attr, setAttr] = useState<GmShopAttribute | null>(null)
  const [attrTab, setAttrTab] = useState<(typeof CATEGORIES)[number]>('Tiro')
  const [fromValue, setFromValue] = useState<number | ''>('')
  const [badgeName, setBadgeName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const loadRoster = useCallback(async () => {
    const res = await fetch('/api/gm-roster')
    if (res.status === 401) { router.push('/login'); return }
    setRoster(await res.json())
  }, [router])

  useEffect(() => {
    fetch('/api/shop/state').then(r => r.json()).then(j => { if (typeof j.open === 'boolean') setShopOpen(j.open) })
    Promise.all([
      loadRoster(),
      fetch('/api/gm-shop?type=catalog').then(r => r.json()),
    ]).then(([, cat]) => setCatalog(cat.attributes ?? []))
      .finally(() => setLoading(false))
  }, [loadRoster])

  async function toggleShop() {
    setTogglingShop(true)
    const res = await fetch('/api/shop/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ open: !shopOpen }),
    })
    const json = await res.json()
    setTogglingShop(false)
    if (json.error) { showToast(json.error, false); return }
    setShopOpen(json.open)
    showToast(json.open ? 'Shop aperto' : 'Shop chiuso')
  }

  const isBadge = attr?.is_badge_upgrade === true

  // Costo: badge fisso, attributo = base + maggiorazione dal valore attuale
  const previewCost = useMemo(() => {
    if (!attr) return null
    if (isBadge) return attr.base_cost
    if (fromValue === '') return null
    return calculateUpgradeCost(attr.base_cost, Number(fromValue), false)
  }, [attr, fromValue, isBadge])

  const alreadyUpgraded = useMemo(
    () => new Set((selected?.upgrades ?? []).map(u => u.attribute_key)),
    [selected]
  )
  const remaining = selected ? GM_SHOP_RULES.MAX_UPGRADES_PER_PLAYER_PER_SEASON - selected.upgradeCount : 0

  const visibleAttrs = useMemo(() => catalog.filter(a => a.category === attrTab), [catalog, attrTab])

  const valueOk = isBadge
    ? badgeName.trim().length > 0
    : fromValue !== '' && Number(fromValue) >= 0 && Number(fromValue) <= 98
  const canAfford = roster && previewCost !== null ? roster.balance >= previewCost : false
  const canBuy = !!selected && !!attr && valueOk && canAfford && shopOpen && remaining > 0 && !submitting

  function pickPlayer(p: RosterEntry) {
    setSelected(p)
    setAttr(null)
    setFromValue('')
    setBadgeName('')
  }

  function pickAttribute(a: GmShopAttribute) {
    setAttr(a)
    setFromValue('')
    setBadgeName('')
  }

  async function buy() {
    if (!selected || !attr || !canBuy) return
    setSubmitting(true)
    const body = isBadge
      ? { action: 'badge', playerSlug: selected.slug, attributeKey: attr.attribute_key, badgeName: badgeName.trim() }
      : { action: 'upgrade', playerSlug: selected.slug, attributeKey: attr.attribute_key, fromValue: Number(fromValue), toValue: Number(fromValue) + 1 }

    const res = await fetch('/api/gm-roster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    setSubmitting(false)
    if (!res.ok) { showToast(json.error ?? 'Errore', false); return }
    showToast(`Upgrade confermato: −${json.gcCost} GC`)
    await loadRoster()
    setAttr(null)
    setFromValue('')
    setBadgeName('')
  }

  if (loading || !roster) {
    return <div className="min-h-screen flex items-center justify-center" style={{ color: 'var(--text-sec)' }}>Caricamento…</div>
  }

  return (
    <div className="min-h-screen pb-48" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <header className="sticky top-0 z-10 border-b px-4 py-3 flex items-center justify-between" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <button onClick={() => router.push('/dashboard')} className="text-sm" style={{ color: 'var(--text-sec)' }}>← Dashboard</button>
        <h1 className="font-display text-xl font-black tracking-wide" style={{ color: 'var(--gold)' }}>GM SHOP</h1>
        <div className="text-sm font-bold" style={{ color: 'var(--gold)' }}>{roster.balance} GC</div>
      </header>

      {!shopOpen && (
        <div className="px-4 py-3 text-sm text-center" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', borderBottom: '1px solid rgba(239,68,68,0.3)' }}>
          Lo shop è chiuso: non puoi fare acquisti al momento.
        </div>
      )}

      {isSuperAdmin && (
        <div className="px-4 py-3 flex items-center justify-center gap-3">
          <span className="text-xs" style={{ color: 'var(--text-sec)' }}>Superadmin · shop {shopOpen ? 'aperto' : 'chiuso'}</span>
          <button
            onClick={toggleShop}
            disabled={togglingShop}
            className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50"
            style={{ background: shopOpen ? 'rgba(239,68,68,0.12)' : 'rgba(74,222,128,0.12)', color: shopOpen ? '#f87171' : '#4ade80', border: '1px solid var(--border)' }}
          >
            {togglingShop ? '…' : shopOpen ? 'Chiudi shop' : 'Apri shop'}
          </button>
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        {toast && (
          <div className="rounded-lg px-4 py-3 text-sm" style={{
            background: toast.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${toast.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: toast.ok ? '#4ade80' : '#f87171',
          }}>{toast.msg}</div>
        )}

        {/* 1. Giocatore */}
        <section className="space-y-3">
          <h2 className="font-display text-base font-bold tracking-wide">1. Giocatore</h2>
          {roster.roster.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-sec)' }}>Il tuo roster è vuoto. Aggiungi giocatori dalla pagina Il mio roster.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {roster.roster.map(p => {
                const on = selected?.slug === p.slug
                return (
                  <button
                    key={p.slug}
                    onClick={() => pickPlayer(p)}
                    className="rounded-xl p-3 flex items-center gap-3 text-left"
                    style={{ background: on ? 'var(--gold-bg2)' : 'var(--surface)', border: `1px solid ${on ? 'var(--gold)' : 'var(--border)'}` }}
                  >
                    <span className="font-display text-xl font-black w-10" style={{ color: ovrColor(p.overall) }}>{p.overall}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold truncate">{p.name}</span>
                      <span className="block text-xs" style={{ color: 'var(--text-sec)' }}>{p.upgradeCount}/{GM_SHOP_RULES.MAX_UPGRADES_PER_PLAYER_PER_SEASON} upgrade</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* 2. Attributo */}
        {selected && (
          <section className="space-y-3">
            <h2 className="font-display text-base font-bold tracking-wide">2. Attributo <span className="text-xs font-normal" style={{ color: 'var(--text-sec)' }}>· upgrade rimanenti: {remaining}</span></h2>
            <div className="flex gap-2 overflow-x-auto">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  onClick={() => setAttrTab(c)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap"
                  style={{ background: attrTab === c ? 'var(--gold)' : 'var(--surface)', color: attrTab === c ? '#000' : 'var(--text-sec)', border: '1px solid var(--border)' }}
                >{c}</button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {visibleAttrs.map(a => {
                const done = alreadyUpgraded.has(a.attribute_key)
                const on = attr?.attribute_key === a.attribute_key
                return (
                  <button
                    key={a.attribute_key}
                    disabled={done || remaining <= 0}
                    onClick={() => pickAttribute(a)}
                    className="rounded-lg p-3 flex justify-between items-center text-left disabled:opacity-40"
                    style={{ background: on ? 'var(--gold-bg2)' : 'var(--surface)', border: `1px solid ${on ? 'var(--gold)' : 'var(--border)'}` }}
                  >
                    <span className="text-sm">{a.label_it}</span>
                    <span className="text-xs font-bold" style={{ color: 'var(--gold)' }}>{done ? 'FATTO' : `${a.base_cost} GC`}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* 3. Valore */}
        {selected && attr && (
          <section className="space-y-3">
            <h2 className="font-display text-base font-bold tracking-wide">3. {isBadge ? 'Nome del cartellino' : 'Valore attuale'}</h2>
            {isBadge ? (
              <>
                <input
                  placeholder="Es. Set and Fire"
                  value={badgeName}
                  onChange={e => setBadgeName(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Bronzo → Argento: costo fisso 10 GC.</p>
              </>
            ) : (
              <>
                <p className="text-xs" style={{ color: 'var(--text-sec)' }}>Scrivi il valore attuale che vedi sulla play. L&apos;upgrade è sempre +1.</p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    max={98}
                    value={fromValue}
                    onChange={e => setFromValue(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Es. 70"
                    className="w-28 rounded-lg px-3 py-2 text-sm font-bold"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  <span className="text-sm" style={{ color: 'var(--text-sec)' }}>→ {fromValue === '' ? '—' : Number(fromValue) + 1}</span>
                </div>
              </>
            )}
          </section>
        )}
      </main>

      {/* Riepilogo e acquisto, sempre visibili in basso */}
      <div className="fixed bottom-0 inset-x-0 border-t px-4 py-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <div className="flex-1 min-w-0 text-sm">
            {selected && attr ? (
              <>
                <div className="truncate font-semibold">{selected.name} · {attr.label_it}{!isBadge && fromValue !== '' ? ` ${fromValue}→${Number(fromValue) + 1}` : ''}</div>
                <div className="text-xs" style={{ color: 'var(--text-sec)' }}>
                  Costo <span className="font-bold" style={{ color: canAfford ? 'var(--gold)' : '#f87171' }}>{previewCost ?? '—'} GC</span>
                  {' · '}saldo dopo {previewCost !== null ? roster.balance - previewCost : roster.balance} GC
                </div>
              </>
            ) : (
              <div className="text-xs" style={{ color: 'var(--text-sec)' }}>Scegli un giocatore e un attributo</div>
            )}
          </div>
          <button
            onClick={buy}
            disabled={!canBuy}
            className="font-display font-black tracking-wide px-5 py-3 rounded-xl disabled:opacity-40"
            style={{ background: 'var(--gold)', color: '#000' }}
          >
            {submitting ? 'Invio…' : 'Acquista'}
          </button>
        </div>
        {selected && attr && !canAfford && previewCost !== null && (
          <div className="max-w-3xl mx-auto text-xs mt-2" style={{ color: '#f87171' }}>GC insufficienti: ti servono {previewCost} GC.</div>
        )}
      </div>
    </div>
  )
}
