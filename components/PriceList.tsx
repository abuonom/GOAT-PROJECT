'use client'

import { useState } from 'react'
import type { GmShopAttribute } from '@/types/league'

// Listino del GM Shop: costo base di ogni attributo e maggiorazione per fascia di valore.
// Legge gli stessi dati che usa il server (gm_shop_attributes e gc_surcharge_tiers).

interface Tier { min_value: number; max_value: number | null; extra_gc: number }

interface Props {
  attributes: GmShopAttribute[]
  tiers: Tier[]
}

function tierLabel(t: Tier) {
  return t.max_value === null ? `${t.min_value}+` : `${t.min_value}–${t.max_value}`
}

export default function PriceList({ attributes, tiers }: Props) {
  const [open, setOpen] = useState(false)

  const byCategory = attributes
    .filter(a => !a.is_badge_upgrade)
    .reduce<Record<string, GmShopAttribute[]>>((acc, a) => {
      ;(acc[a.category] ??= []).push(a)
      return acc
    }, {})

  const badge = attributes.find(a => a.is_badge_upgrade)

  return (
    <section className="space-y-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full rounded-xl px-4 py-3 text-sm font-bold text-left flex justify-between items-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
      >
        <span>Listino prezzi</span>
        <span style={{ color: 'var(--gold)' }}>{open ? 'Chiudi' : 'Vedi quanto costa'}</span>
      </button>

      {open && (
        <div className="rounded-xl p-4 space-y-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="space-y-2">
            <div className="text-xs font-bold tracking-widest" style={{ color: 'var(--text-sec)' }}>COSTO BASE PER +1</div>
            {Object.entries(byCategory).map(([cat, list]) => (
              <div key={cat}>
                <div className="text-[11px] font-bold mt-2" style={{ color: 'var(--gold)' }}>{cat.toUpperCase()}</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
                  {list.map(a => (
                    <div key={a.attribute_key} className="flex justify-between text-sm">
                      <span style={{ color: 'var(--text)' }}>{a.label_it}</span>
                      <span className="font-bold" style={{ color: 'var(--gold)' }}>{a.base_cost} GC</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold tracking-widest" style={{ color: 'var(--text-sec)' }}>MAGGIORAZIONE PER VALORE ATTUALE</div>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Si aggiunge al costo base, in base al valore che il giocatore ha prima dell&apos;upgrade.</p>
            <div className="grid grid-cols-2 gap-2">
              {tiers.map(t => (
                <div key={tierLabel(t)} className="flex justify-between text-sm rounded-lg px-3 py-2" style={{ background: 'var(--surface2)' }}>
                  <span>Valore {tierLabel(t)}</span>
                  <span className="font-bold" style={{ color: t.extra_gc > 0 ? 'var(--gold)' : 'var(--text-sec)' }}>
                    {t.extra_gc > 0 ? `+${t.extra_gc} GC` : 'nessuna'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {badge && (
            <div className="text-sm flex justify-between">
              <span style={{ color: 'var(--text)' }}>{badge.label_it}</span>
              <span className="font-bold" style={{ color: 'var(--gold)' }}>{badge.base_cost} GC fissi</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
