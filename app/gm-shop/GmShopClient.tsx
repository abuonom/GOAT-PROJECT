'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
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

type Step = 'player' | 'attribute' | 'values' | 'badge' | 'confirm'

const CATEGORIES = ['Tiro', 'Finishing', 'Playmaking', 'Difesa', 'Atletismo', 'Badge'] as const

function ovrColor(v: number) {
  if (v >= 95) return '#fde047'
  if (v >= 90) return '#c084fc'
  if (v >= 85) return '#60a5fa'
  if (v >= 80) return '#4ade80'
  return 'var(--text-sec)'
}

export default function GmShopClient() {
  const router = useRouter()

  const [roster, setRoster] = useState<RosterResponse | null>(null)
  const [catalog, setCatalog] = useState<GmShopAttribute[]>([])
  const [loading, setLoading] = useState(true)

  const [step, setStep] = useState<Step>('player')
  const [selected, setSelected] = useState<RosterEntry | null>(null)
  const [attr, setAttr] = useState<GmShopAttribute | null>(null)
  const [fromValue, setFromValue] = useState<number>(70)
  const [toValue, setToValue] = useState<number>(71)
  const [attrTab, setAttrTab] = useState<(typeof CATEGORIES)[number]>('Tiro')
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
    Promise.all([
      loadRoster(),
      fetch('/api/gm-shop?type=catalog').then(r => r.json()),
    ]).then(([, cat]) => {
      setCatalog(cat.attributes ?? [])
    }).finally(() => setLoading(false))
  }, [loadRoster])

  // Anteprima costo: solo per l'interfaccia. Il valore definitivo arriva dal server.
  const previewCost = useMemo(() => {
    if (!attr) return null
    if (attr.is_badge_upgrade) return attr.base_cost
    return calculateUpgradeCost(attr.base_cost, fromValue, false)
  }, [attr, fromValue])

  const canAfford = roster ? roster.balance >= (previewCost ?? 0) : false

  const remaining = useMemo(
    () => (selected ? GM_SHOP_RULES.MAX_UPGRADES_PER_PLAYER_PER_SEASON - selected.upgradeCount : 0),
    [selected]
  )

  const alreadyUpgraded = useMemo(
    () => new Set((selected?.upgrades ?? []).map(u => u.attribute_key)),
    [selected]
  )

  const visibleAttrs = useMemo(
    () => catalog.filter(a => a.category === attrTab),
    [catalog, attrTab]
  )

  function pickPlayer(entry: RosterEntry) {
    setSelected(entry)
    setAttr(null)
    setStep('attribute')
  }

  function pickAttribute(a: GmShopAttribute) {
    setAttr(a)
    if (a.is_badge_upgrade) {
      setBadgeName('')
      setStep('badge')
      return
    }
    setFromValue(70)
    setToValue(71)
    setStep('values')
  }

  function changeFrom(v: number) {
    const from = Math.max(0, Math.min(98, v))
    setFromValue(from)
    setToValue(from + 1)
  }

  async function submit() {
    if (!selected || !attr) return
    setSubmitting(true)
    const body = attr.is_badge_upgrade
      ? { action: 'badge', playerSlug: selected.slug, attributeKey: attr.attribute_key, badgeName: badgeName.trim() }
      : { action: 'upgrade', playerSlug: selected.slug, attributeKey: attr.attribute_key, fromValue, toValue: fromValue + 1 }

    const res = await fetch('/api/gm-roster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    setSubmitting(false)

    if (!res.ok) {
      showToast(json.error ?? 'Errore', false)
      return
    }
    showToast(`Upgrade confermato: −${json.gcCost} GC`)
    await loadRoster()
    setStep('player')
    setSelected(null)
    setAttr(null)
  }

  function reset() {
    setStep('player')
    setSelected(null)
    setAttr(null)
  }

  if (loading || !roster) {
    return <div className="min-h-screen flex items-center justify-center" style={{ color: 'var(--text-sec)' }}>Caricamento…</div>
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <header className="sticky top-0 z-10 border-b px-4 py-3 flex items-center justify-between" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <button onClick={() => router.push('/dashboard')} className="text-sm" style={{ color: 'var(--text-sec)' }}>← Dashboard</button>
        <h1 className="font-display text-xl font-black tracking-wide" style={{ color: 'var(--gold)' }}>GM SHOP</h1>
        <div className="text-sm font-bold" style={{ color: 'var(--gold)' }}>{roster.balance} GC</div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <Steps current={step} />

        {toast && (
          <div className="rounded-lg px-4 py-3 text-sm" style={{
            background: toast.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${toast.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: toast.ok ? '#4ade80' : '#f87171',
          }}>{toast.msg}</div>
        )}

        {step === 'player' && (
          <section className="space-y-3">
            <h2 className="font-display text-lg font-bold tracking-wide">1. Scegli il giocatore</h2>
            {roster.roster.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--text-sec)' }}>Il tuo roster è vuoto. Aggiungi giocatori dalla lista o inseriscine uno nuovo.</p>
            )}
            {roster.roster.map(p => (
              <button
                key={p.slug}
                onClick={() => pickPlayer(p)}
                className="w-full rounded-xl p-4 flex items-center gap-4 text-left"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <span className="font-display text-2xl font-black w-12" style={{ color: ovrColor(p.overall) }}>{p.overall}</span>
                <span className="flex-1">
                  <span className="block font-semibold">{p.name}</span>
                  <span className="block text-xs" style={{ color: 'var(--text-sec)' }}>{p.positions.join(' / ')}</span>
                </span>
                <span className="text-xs" style={{ color: 'var(--text-sec)' }}>{p.upgradeCount}/{GM_SHOP_RULES.MAX_UPGRADES_PER_PLAYER_PER_SEASON}</span>
              </button>
            ))}
            <button onClick={() => router.push('/roster')} className="w-full rounded-xl py-3 text-sm" style={{ border: '1px dashed var(--border2)', color: 'var(--gold)' }}>
              Gestisci il roster (aggiungi giocatori e rookie) →
            </button>
          </section>
        )}

        {step === 'attribute' && selected && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold tracking-wide">2. Scegli l'attributo</h2>
              <button onClick={reset} className="text-xs underline" style={{ color: 'var(--text-sec)' }}>Cambia giocatore</button>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-sec)' }}>
              {selected.name} · upgrade rimanenti: {remaining}
            </p>

            <div className="flex gap-2 overflow-x-auto">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  onClick={() => setAttrTab(c)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap"
                  style={{
                    background: attrTab === c ? 'var(--gold)' : 'var(--surface)',
                    color: attrTab === c ? '#000' : 'var(--text-sec)',
                    border: '1px solid var(--border)',
                  }}
                >{c}</button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {visibleAttrs.map(a => {
                const done = alreadyUpgraded.has(a.attribute_key)
                const disabled = done || remaining <= 0
                return (
                  <button
                    key={a.attribute_key}
                    disabled={disabled}
                    onClick={() => pickAttribute(a)}
                    className="rounded-lg p-3 text-left flex justify-between items-center disabled:opacity-40"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                  >
                    <span className="text-sm">{a.label_it}</span>
                    <span className="text-xs font-bold" style={{ color: 'var(--gold)' }}>
                      {done ? 'GIÀ FATTO' : `base ${a.base_cost} GC`}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {step === 'values' && selected && attr && (
          <section className="space-y-6">
            <h2 className="font-display text-lg font-bold tracking-wide">3. Valore attuale e valore finale</h2>
            <p className="text-sm" style={{ color: 'var(--text-sec)' }}>
              {selected.name} · {attr.label_it}. Guarda il valore attuale del giocatore sulla play e scrivilo qui: l'upgrade è sempre +1. I valori del database non vengono usati.
            </p>

            <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <label className="block text-sm">
                Valore attuale
                <input
                  type="number"
                  min={0}
                  max={98}
                  value={fromValue}
                  onChange={e => changeFrom(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg px-3 py-2"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </label>
              <div className="text-sm" style={{ color: 'var(--text-sec)' }}>Valore finale: <span className="font-bold" style={{ color: 'var(--text)' }}>{toValue}</span></div>
              <div className="text-sm">Costo stimato: <span className="font-bold" style={{ color: 'var(--gold)' }}>{previewCost} GC</span></div>
              <p className="text-[11px]" style={{ color: 'var(--text-dim)' }}>Anteprima. Il costo definitivo lo calcola il server al momento della conferma.</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('attribute')} className="flex-1 rounded-lg py-2 text-sm" style={{ border: '1px solid var(--border)', color: 'var(--text-sec)' }}>Indietro</button>
              <button onClick={() => setStep('confirm')} className="flex-1 rounded-lg py-2 text-sm font-bold" style={{ background: 'var(--gold)', color: '#000' }}>Continua</button>
            </div>
          </section>
        )}

        {step === 'badge' && selected && attr && (
          <section className="space-y-6">
            <h2 className="font-display text-lg font-bold tracking-wide">3. Quale cartellino vuoi aumentare?</h2>
            <p className="text-sm" style={{ color: 'var(--text-sec)' }}>
              {selected.name} · {attr.label_it}. Scrivi il nome del badge da Bronzo ad Argento.
            </p>
            <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <input
                placeholder="Es. Set and Fire"
                value={badgeName}
                onChange={e => setBadgeName(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
              <p className="text-[11px]" style={{ color: 'var(--text-dim)' }}>Costo fisso per i badge: 10 GC.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep('attribute')} className="flex-1 rounded-lg py-2 text-sm" style={{ border: '1px solid var(--border)', color: 'var(--text-sec)' }}>Indietro</button>
              <button
                onClick={() => setStep('confirm')}
                disabled={badgeName.trim().length === 0}
                className="flex-1 rounded-lg py-2 text-sm font-bold disabled:opacity-50"
                style={{ background: 'var(--gold)', color: '#000' }}
              >Continua</button>
            </div>
          </section>
        )}

        {step === 'confirm' && selected && attr && (
          <section className="space-y-6">
            <h2 className="font-display text-lg font-bold tracking-wide">4. Conferma</h2>
            <div className="rounded-xl p-5 space-y-2 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div>Giocatore: <span className="font-semibold">{selected.name}</span></div>
              <div>Attributo: <span className="font-semibold">{attr.label_it}</span></div>
              {attr.is_badge_upgrade
                ? <div>Cartellino: <span className="font-semibold">{badgeName.trim()}</span> (Bronzo → Argento)</div>
                : <div>Da {fromValue} a {fromValue + 1}</div>}
              <div>Costo: <span className="font-bold" style={{ color: 'var(--gold)' }}>{previewCost} GC</span></div>
              <div style={{ color: 'var(--text-sec)' }}>Saldo dopo: {roster.balance - (previewCost ?? 0)} GC</div>
              {!canAfford && (
                <div className="text-xs" style={{ color: '#f87171' }}>GC insufficienti: ti servono {previewCost} GC, ne hai {roster.balance}.</div>
              )}
            </div>
            <p className="text-xs" style={{ color: 'var(--text-sec)' }}>
              L'upgrade viene validato dall'admin in game. Dichiarare un valore non corretto comporta penalità.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setStep(attr.is_badge_upgrade ? 'badge' : 'values')} className="flex-1 rounded-lg py-2 text-sm" style={{ border: '1px solid var(--border)', color: 'var(--text-sec)' }}>Indietro</button>
              <button
                onClick={submit}
                disabled={submitting || !canAfford}
                className="flex-1 rounded-lg py-2 text-sm font-bold disabled:opacity-50"
                style={{ background: 'var(--gold)', color: '#000' }}
              >{submitting ? 'Invio…' : 'Conferma upgrade'}</button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

function Steps({ current }: { current: Step }) {
  const order: Step[] = ['player', 'attribute', 'values', 'badge', 'confirm']
  const idx = order.indexOf(current)
  return (
    <div className="flex gap-2">
      {order.map((s, i) => (
        <span key={s} className="flex-1 h-1 rounded" style={{ background: i <= idx ? 'var(--gold)' : 'var(--border)' }} />
      ))}
    </div>
  )
}
