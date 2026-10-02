'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { Player, Badge } from '@/types/nba'
import type { GmShopAttribute } from '@/types/league'
import { calculateUpgradeCost, checkUpgradeEligibility, GM_SHOP_RULES } from '@/lib/gm-shop/rules'

interface ShopUpgrade {
  player_slug: string
  attribute_key: string
  old_value: number | null
  new_value: number | null
  gc_cost: number
  created_at: string
}

interface RosterPlayer {
  slug: string
  name: string | null
  overall: number | null
}

interface ShopContext {
  balance: number
  seasonId: string
  seasonName: string
  franchise: { name: string; abbreviation: string } | null
  rosterSlugs: string[]
  rosterPlayers: RosterPlayer[]
  upgrades: ShopUpgrade[]
}

type ViewTab = 'shop' | 'history'
type AttrCategory = 'Tiro' | 'Finishing' | 'Playmaking' | 'Difesa' | 'Atletismo' | 'Badge'

const CATEGORIES: AttrCategory[] = ['Tiro', 'Finishing', 'Playmaking', 'Difesa', 'Atletismo', 'Badge']

function ovrColor(v: number) {
  if (v >= 95) return '#fde047'
  if (v >= 90) return '#c084fc'
  if (v >= 85) return '#60a5fa'
  if (v >= 80) return '#4ade80'
  return 'var(--text-sec)'
}

function surchargeLabel(v: number): string {
  if (v >= 94) return '+8 GC sovrapprice'
  if (v >= 91) return '+6 GC sovrapprice'
  if (v >= 88) return '+4 GC sovrapprice'
  if (v >= 85) return '+2 GC sovrapprice'
  return ''
}

export default function GmShopClient() {
  const router = useRouter()

  const [context, setContext] = useState<ShopContext | null>(null)
  const [catalog, setCatalog] = useState<GmShopAttribute[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [playerData, setPlayerData] = useState<Record<string, Player>>({})
  const [playerLoading, setPlayerLoading] = useState(false)

  const [viewTab, setViewTab] = useState<ViewTab>('shop')
  const [attrTab, setAttrTab] = useState<AttrCategory>('Tiro')
  const [confirmUpgrade, setConfirmUpgrade] = useState<{
    attributeKey: string
    label: string
    currentValue: number | null
    cost: number
    badgeName?: string
  } | null>(null)
  const [purchasing, setPurchasing] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const loadContext = useCallback(async () => {
    const [ctxRes, catRes] = await Promise.all([
      fetch('/api/gm-shop?type=context'),
      fetch('/api/gm-shop?type=catalog'),
    ])
    if (ctxRes.ok) setContext(await ctxRes.json())
    if (catRes.ok) setCatalog((await catRes.json()).attributes ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadContext() }, [loadContext])

  useEffect(() => {
    if (!selectedSlug || playerData[selectedSlug]) return
    setPlayerLoading(true)
    fetch(`/api/players/${selectedSlug}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.data) setPlayerData(prev => ({ ...prev, [selectedSlug]: json.data }))
        setPlayerLoading(false)
      })
  }, [selectedSlug, playerData])

  const selectedPlayer = selectedSlug ? playerData[selectedSlug] : null
  const upgradesForSelected = useMemo(() =>
    context?.upgrades.filter(u => u.player_slug === selectedSlug) ?? [],
    [context, selectedSlug]
  )
  const upgradeCount = upgradesForSelected.length
  const upgradedKeys = useMemo(() =>
    new Set(upgradesForSelected.map(u => u.attribute_key)),
    [upgradesForSelected]
  )
  const catalogByCategory = useMemo(() =>
    catalog.filter(a => a.category === attrTab),
    [catalog, attrTab]
  )
  const bronzeBadges: Badge[] = useMemo(() => {
    if (!selectedPlayer?.badges?.list) return []
    return selectedPlayer.badges.list.filter(b => b.tier === 'Bronze')
  }, [selectedPlayer])

  async function handlePurchase() {
    if (!confirmUpgrade || !selectedSlug || !context) return
    setPurchasing(true)
    const res = await fetch('/api/gm-shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerSlug: selectedSlug,
        attributeKey: confirmUpgrade.attributeKey,
        currentValue: confirmUpgrade.currentValue,
        badgeName: confirmUpgrade.badgeName,
      }),
    })
    const json = await res.json()
    setPurchasing(false)
    setConfirmUpgrade(null)
    if (json.error) { showToast(json.error, false); return }
    showToast(`Upgrade acquistato! −${json.gcCost} GC`)
    await loadContext()
  }

  // ─── Loading / empty states ───

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <div className="px-4 py-10 space-y-3 max-w-2xl mx-auto">
          {[64, 48, 300].map(h => (
            <div key={h} className="rounded-xl animate-pulse" style={{ height: h, background: 'var(--surface)' }} />
          ))}
        </div>
      </div>
    )
  }

  if (!context) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }} className="flex items-center justify-center">
        <p className="font-display font-black" style={{ color: 'var(--text-dim)' }}>Nessuna stagione attiva</p>
      </div>
    )
  }

  // ─── Render ───

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── Header ── */}
      <header className="sticky top-0 z-40" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="px-4 py-3 flex items-center gap-3 max-w-4xl mx-auto">
          {/* Left: back / breadcrumb */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {selectedSlug && viewTab === 'shop' ? (
              <button
                onClick={() => setSelectedSlug(null)}
                className="text-xs font-semibold px-3 py-1.5 rounded shrink-0"
                style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}
              >
                ← Giocatori
              </button>
            ) : (
              <button
                onClick={() => router.push('/dashboard')}
                className="text-xs font-semibold px-3 py-1.5 rounded shrink-0"
                style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}
              >
                ← Dashboard
              </button>
            )}
            <span className="font-display text-base font-black tracking-wider truncate" style={{ color: 'var(--gold)' }}>
              GM SHOP
            </span>
            <span className="text-xs shrink-0" style={{ color: 'var(--text-dim)' }}>{context.seasonName}</span>
          </div>

          {/* Right: balance */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="font-display text-xl font-black" style={{ color: 'var(--gold)' }}>{context.balance}</span>
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>GC</span>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex max-w-4xl mx-auto" style={{ borderTop: '1px solid var(--border2)' }}>
          {(['shop', 'history'] as ViewTab[]).map(t => (
            <button key={t} onClick={() => { setViewTab(t); if (t === 'shop') {} }}
              className="flex-1 text-xs font-bold py-2.5 font-display tracking-wide"
              style={{
                color: viewTab === t ? 'var(--gold)' : 'var(--text-dim)',
                borderBottom: viewTab === t ? '2px solid var(--gold)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {t === 'shop' ? 'SHOP' : 'STORICO'}
            </button>
          ))}
        </div>
      </header>

      {/* ── SHOP VIEW ── */}
      {viewTab === 'shop' && (
        <div className="max-w-4xl mx-auto lg:flex lg:items-start">

          {/* PLAYER LIST — hidden on mobile when player selected */}
          <div className={`lg:w-64 lg:shrink-0 lg:border-r ${selectedSlug ? 'hidden lg:block' : 'block'}`}
            style={{ borderColor: 'var(--border)' }}>
            <div className="px-4 pt-5 pb-2">
              <h3 className="font-display font-black tracking-wide text-xs" style={{ color: 'var(--text-sec)' }}>
                SCEGLI GIOCATORE
              </h3>
            </div>

            {context.rosterSlugs.length === 0 ? (
              <div className="mx-4 rounded-xl p-4 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Nessun giocatore nel roster</p>
                <button onClick={() => router.push('/roster')} className="mt-2 text-xs underline" style={{ color: 'var(--gold)' }}>
                  Vai al roster →
                </button>
              </div>
            ) : (
              <div className="px-4 pb-5 space-y-1.5 lg:space-y-1">
                {(context.rosterPlayers ?? context.rosterSlugs.map(s => ({ slug: s, name: null, overall: null }))).map(rp => {
                  const slug = rp.slug
                  const p = playerData[slug]
                  const displayName = p?.name ?? rp.name
                  const displayOvr = p?.overall ?? rp.overall
                  const upgCount = context.upgrades.filter(u => u.player_slug === slug).length
                  const isSelected = selectedSlug === slug
                  return (
                    <button
                      key={slug}
                      onClick={() => { setSelectedSlug(slug); setAttrTab('Tiro') }}
                      className="w-full text-left px-3 py-3 rounded-xl transition-all"
                      style={{
                        background: isSelected ? 'var(--gold-bg)' : 'var(--surface)',
                        border: isSelected ? '1px solid var(--gold-dim)' : '1px solid var(--border)',
                      }}
                    >
                      <div className="flex items-center gap-2.5">
                        {displayOvr != null && (
                          <span className="font-display font-black text-lg w-9 text-center shrink-0"
                            style={{ color: ovrColor(displayOvr) }}>
                            {displayOvr}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate" style={{ color: isSelected ? 'var(--gold)' : 'var(--text)' }}>
                            {displayName ?? slug.replace(/-/g, ' ')}
                          </div>
                          {upgCount > 0 && (
                            <div className="text-[10px] mt-0.5" style={{ color: upgCount >= 3 ? '#f87171' : '#60a5fa' }}>
                              {upgCount}/3 upgrade
                            </div>
                          )}
                        </div>
                        <span className="text-lg shrink-0" style={{ color: 'var(--text-dim)' }}>›</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* UPGRADE PANEL — right column on desktop, full screen on mobile */}
          <div className={`flex-1 min-w-0 ${selectedSlug ? 'block' : 'hidden lg:block'}`}>
            {selectedSlug ? (
              <UpgradePanel
                selectedSlug={selectedSlug}
                selectedPlayer={selectedPlayer}
                playerLoading={playerLoading}
                upgradeCount={upgradeCount}
                upgradedKeys={upgradedKeys}
                attrTab={attrTab}
                setAttrTab={setAttrTab}
                catalogByCategory={catalogByCategory}
                bronzeBadges={bronzeBadges}
                balance={context.balance}
                onConfirm={setConfirmUpgrade}
              />
            ) : (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="text-4xl mb-3">🛒</div>
                  <p className="font-display font-black tracking-wide" style={{ color: 'var(--text-sec)' }}>
                    SELEZIONA UN GIOCATORE
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                    Scegli un giocatore dalla lista per vedere gli upgrade disponibili.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── HISTORY VIEW ── */}
      {viewTab === 'history' && (
        <div className="max-w-4xl mx-auto px-4 py-5">
          <HistoryView upgrades={context.upgrades} catalog={catalog} playerData={playerData} />
        </div>
      )}

      {/* ── Confirm dialog ── */}
      {confirmUpgrade && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setConfirmUpgrade(null) }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div>
              <h2 className="font-display text-xl font-black tracking-wider mb-2" style={{ color: 'var(--text)' }}>
                CONFERMA UPGRADE
              </h2>
              <div className="rounded-xl px-4 py-3 space-y-1"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <div className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{confirmUpgrade.label}</div>
                {selectedPlayer && (
                  <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{selectedPlayer.name}</div>
                )}
                {confirmUpgrade.currentValue !== null && (
                  <div className="font-display font-black text-sm flex items-center gap-2 mt-1">
                    <span style={{ color: ovrColor(confirmUpgrade.currentValue) }}>{confirmUpgrade.currentValue}</span>
                    <span style={{ color: 'var(--text-dim)' }}>→</span>
                    <span style={{ color: ovrColor(confirmUpgrade.currentValue + 1) }}>{confirmUpgrade.currentValue + 1}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between mt-3 px-1">
                <span className="text-sm" style={{ color: 'var(--text-sec)' }}>Costo:</span>
                <span className="font-display text-2xl font-black" style={{ color: 'var(--gold)' }}>{confirmUpgrade.cost} GC</span>
              </div>
              <div className="flex items-center justify-between px-1">
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Saldo dopo:</span>
                <span className="text-sm font-black font-display"
                  style={{ color: context.balance - confirmUpgrade.cost >= 0 ? '#4ade80' : '#f87171' }}>
                  {context.balance - confirmUpgrade.cost} GC
                </span>
              </div>
            </div>
            <p className="text-xs" style={{ color: '#fb923c' }}>
              ⚠️ L'upgrade è permanente e non reversibile.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmUpgrade(null)}
                className="flex-1 font-semibold text-sm py-3 rounded-xl"
                style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}>
                Annulla
              </button>
              <button onClick={handlePurchase} disabled={purchasing}
                className="flex-1 font-display font-black tracking-wide text-sm py-3 rounded-xl"
                style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.4)', opacity: purchasing ? 0.6 : 1 }}>
                {purchasing ? '...' : `ACQUISTA −${confirmUpgrade.cost} GC`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-xl whitespace-nowrap"
          style={{
            background: toast.ok ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            color: toast.ok ? '#4ade80' : '#f87171',
            border: `1px solid ${toast.ok ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
          }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ─── Upgrade Panel ─────────────────────────────────────────────────────────────

function UpgradePanel({
  selectedSlug, selectedPlayer, playerLoading,
  upgradeCount, upgradedKeys,
  attrTab, setAttrTab, catalogByCategory, bronzeBadges,
  balance, onConfirm,
}: {
  selectedSlug: string
  selectedPlayer: Player | null
  playerLoading: boolean
  upgradeCount: number
  upgradedKeys: Set<string>
  attrTab: AttrCategory
  setAttrTab: (c: AttrCategory) => void
  catalogByCategory: GmShopAttribute[]
  bronzeBadges: Badge[]
  balance: number
  onConfirm: (u: { attributeKey: string; label: string; currentValue: number | null; cost: number; badgeName?: string }) => void
}) {
  if (playerLoading) {
    return (
      <div className="px-4 py-8 text-center">
        <div className="text-sm" style={{ color: 'var(--text-dim)' }}>Caricamento...</div>
      </div>
    )
  }

  if (!selectedPlayer) {
    return (
      <div className="px-4 py-8 text-center rounded-xl mx-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Dati giocatore non disponibili</p>
      </div>
    )
  }

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Player header card */}
      <div className="rounded-xl px-4 py-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display text-xl font-black leading-tight" style={{ color: 'var(--text)' }}>
              {selectedPlayer.name}
            </div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {selectedPlayer.positions.map(pos => (
                <span key={pos} className="text-[10px] font-black px-1.5 py-0.5 rounded tracking-wide"
                  style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}>
                  {pos}
                </span>
              ))}
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{selectedPlayer.team}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-display text-3xl font-black" style={{ color: ovrColor(selectedPlayer.overall) }}>
              {selectedPlayer.overall}
            </div>
            <div className="text-xs font-black font-display mt-0.5"
              style={{ color: upgradeCount >= 3 ? '#f87171' : upgradeCount > 0 ? '#fb923c' : 'var(--text-dim)' }}>
              {upgradeCount}/{GM_SHOP_RULES.MAX_UPGRADES_PER_PLAYER_PER_SEASON} UPG
            </div>
          </div>
        </div>
      </div>

      {/* Category tabs — scrollable */}
      <div className="overflow-x-auto -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-0 min-w-max" style={{ borderBottom: '1px solid var(--border)' }}>
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setAttrTab(cat)}
              className="text-[11px] font-bold px-3 py-2.5 font-display tracking-wide whitespace-nowrap transition-colors"
              style={{
                color: attrTab === cat ? 'var(--gold)' : 'var(--text-dim)',
                borderBottom: attrTab === cat ? '2px solid var(--gold)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {cat.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Attributes or badges */}
      {attrTab !== 'Badge' ? (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {catalogByCategory.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
              Nessun attributo in questa categoria
            </div>
          ) : catalogByCategory.map((attr, i) => {
            const currentVal = selectedPlayer.attributes[attr.attribute_key] ?? null
            const alreadyDone = upgradedKeys.has(attr.attribute_key)
            const eli = checkUpgradeEligibility({
              baseCost: attr.base_cost,
              currentValue: currentVal,
              isBadgeUpgrade: false,
              gcBalance: balance,
              upgradeCountForPlayer: upgradeCount,
              alreadyUpgradedThisSeason: alreadyDone,
              playerInRoster: true,
            })
            const surcharge = currentVal !== null ? surchargeLabel(currentVal) : ''

            return (
              <div key={attr.attribute_key}
                className="flex items-center gap-2 px-3 py-3"
                style={{
                  background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
                  borderBottom: i < catalogByCategory.length - 1 ? '1px solid var(--border)' : 'none',
                  opacity: alreadyDone ? 0.65 : 1,
                }}>
                {/* Name */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{attr.label_it}</div>
                  {surcharge && !alreadyDone && (
                    <div className="text-[10px]" style={{ color: '#fb923c' }}>{surcharge}</div>
                  )}
                  {alreadyDone && (
                    <div className="text-[10px]" style={{ color: '#4ade80' }}>✓ Già potenziato</div>
                  )}
                </div>

                {/* Value arrow */}
                {currentVal !== null && (
                  <div className="font-display font-black text-sm flex items-center gap-1 shrink-0">
                    <span style={{ color: ovrColor(currentVal) }}>{currentVal}</span>
                    {eli.canUpgrade && <>
                      <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>→</span>
                      <span style={{ color: ovrColor(currentVal + 1) }}>{currentVal + 1}</span>
                    </>}
                  </div>
                )}

                {/* Cost + button */}
                <div className="shrink-0 flex flex-col items-end gap-0.5">
                  <div className="text-xs font-black font-display" style={{ color: 'var(--gold)' }}>{eli.cost} GC</div>
                  <button
                    disabled={!eli.canUpgrade}
                    onClick={() => onConfirm({
                      attributeKey: attr.attribute_key,
                      label: attr.label_it,
                      currentValue: currentVal,
                      cost: eli.cost,
                    })}
                    className="text-[11px] font-black px-3 py-1.5 rounded-lg font-display tracking-wide"
                    style={{
                      background: eli.canUpgrade ? 'rgba(74,222,128,0.15)' : 'var(--surface2)',
                      color: eli.canUpgrade ? '#4ade80' : 'var(--text-dim)',
                      border: `1px solid ${eli.canUpgrade ? 'rgba(74,222,128,0.35)' : 'var(--border)'}`,
                      cursor: eli.canUpgrade ? 'pointer' : 'default',
                      minWidth: 64,
                    }}
                    title={eli.blockMessage}
                  >
                    {alreadyDone ? '✓' : eli.canUpgrade ? 'UPGRADE' : '—'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <BadgePanel
          bronzeBadges={bronzeBadges}
          badgeAlreadyUsed={upgradedKeys.has('badge_bronze_silver')}
          upgradeCount={upgradeCount}
          balance={balance}
          onUpgrade={(badge) => onConfirm({
            attributeKey: 'badge_bronze_silver',
            label: `Badge: ${badge.name}`,
            currentValue: null,
            cost: 10,
            badgeName: badge.name,
          })}
        />
      )}
    </div>
  )
}

// ─── Badge Panel ─────────────────────────────────────────────────────────────

function BadgePanel({
  bronzeBadges, badgeAlreadyUsed, upgradeCount, balance, onUpgrade,
}: {
  bronzeBadges: Badge[]
  badgeAlreadyUsed: boolean
  upgradeCount: number
  balance: number
  onUpgrade: (badge: Badge) => void
}) {
  const slotAvailable = upgradeCount < GM_SHOP_RULES.MAX_UPGRADES_PER_PLAYER_PER_SEASON
  const canAfford = balance >= 10

  if (bronzeBadges.length === 0) {
    return (
      <div className="rounded-xl px-5 py-8 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="font-display font-black text-sm" style={{ color: 'var(--text-sec)' }}>NESSUN BADGE BRONZO</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>Questo giocatore non ha badge Bronze da potenziare.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {badgeAlreadyUsed && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-2"
          style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.25)' }}>
          <span>✅</span>
          <p className="text-sm font-semibold" style={{ color: '#4ade80' }}>Badge upgrade già usato questa stagione</p>
        </div>
      )}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {bronzeBadges.map((badge, i) => {
          const canUpgrade = !badgeAlreadyUsed && slotAvailable && canAfford
          return (
            <div key={badge.name}
              className="flex items-center gap-2 px-3 py-3"
              style={{
                background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
                borderBottom: i < bronzeBadges.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{badge.name}</div>
                <div className="text-[10px] flex items-center gap-1 mt-0.5">
                  <span className="font-black px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(205,127,50,0.15)', color: '#cd7f32', border: '1px solid rgba(205,127,50,0.3)' }}>
                    BRONZE
                  </span>
                  <span style={{ color: 'var(--text-dim)' }}>→</span>
                  <span className="font-black px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(192,192,192,0.15)', color: '#c0c0c0', border: '1px solid rgba(192,192,192,0.3)' }}>
                    SILVER
                  </span>
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-0.5">
                <div className="text-xs font-black font-display" style={{ color: 'var(--gold)' }}>10 GC</div>
                <button
                  disabled={!canUpgrade}
                  onClick={() => canUpgrade && onUpgrade(badge)}
                  className="text-[11px] font-black px-3 py-1.5 rounded-lg font-display tracking-wide"
                  style={{
                    background: canUpgrade ? 'rgba(74,222,128,0.15)' : 'var(--surface2)',
                    color: canUpgrade ? '#4ade80' : 'var(--text-dim)',
                    border: `1px solid ${canUpgrade ? 'rgba(74,222,128,0.35)' : 'var(--border)'}`,
                    cursor: canUpgrade ? 'pointer' : 'default',
                    minWidth: 64,
                  }}
                >
                  {badgeAlreadyUsed ? '✓' : canUpgrade ? 'UPGRADE' : '—'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] px-1" style={{ color: 'var(--text-dim)' }}>
        1 badge upgrade per giocatore per stagione (conta come 1 dei 3 upgrade totali).
      </p>
    </div>
  )
}

// ─── History View ─────────────────────────────────────────────────────────────

function HistoryView({ upgrades, catalog, playerData }: {
  upgrades: ShopUpgrade[]
  catalog: GmShopAttribute[]
  playerData: Record<string, Player>
}) {
  const catalogMap = useMemo(() => {
    const m: Record<string, GmShopAttribute> = {}
    catalog.forEach(a => { m[a.attribute_key] = a })
    return m
  }, [catalog])

  if (upgrades.length === 0) {
    return (
      <div className="rounded-xl py-16 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="text-4xl mb-3">📋</div>
        <p className="font-display font-black tracking-wide" style={{ color: 'var(--text-sec)' }}>NESSUN ACQUISTO</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>Gli upgrade acquistati appariranno qui.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      {upgrades.map((u, i) => {
        const player = playerData[u.player_slug]
        const attr = catalogMap[u.attribute_key]
        return (
          <div key={`${u.player_slug}-${u.attribute_key}-${i}`}
            className="flex items-center gap-3 px-4 py-3"
            style={{
              background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
              borderBottom: i < upgrades.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                {player?.name ?? u.player_slug.replace(/-/g, ' ')}
              </div>
              <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-dim)' }}>
                {attr?.label_it ?? u.attribute_key}
                {u.old_value !== null && u.new_value !== null && (
                  <span className="ml-2 font-mono">{u.old_value} → {u.new_value}</span>
                )}
              </div>
            </div>
            <div className="font-display font-black text-sm shrink-0" style={{ color: '#f87171' }}>
              −{u.gc_cost} GC
            </div>
            <div className="text-xs shrink-0" style={{ color: 'var(--text-dim)' }}>
              {new Date(u.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
