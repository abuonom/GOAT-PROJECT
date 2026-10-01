'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Franchise } from '@/types/league'

interface Props {
  profile: Profile | null
  userEmail: string
}

const CONF_COLORS: Record<string, string> = { East: '#60a5fa', West: '#f87171' }

export default function DashboardClient({ profile, userEmail }: Props) {
  const router = useRouter()

  // Franchise state
  const [myFranchise, setMyFranchise] = useState<{ name: string; abbreviation: string } | null | undefined>(undefined)
  const [franchiseLoading, setFranchiseLoading] = useState(true)
  const [showFranchisePicker, setShowFranchisePicker] = useState(false)
  const [availableFranchises, setAvailableFranchises] = useState<Franchise[]>([])
  const [pickLoading, setPickLoading] = useState(false)
  const [pickActing, setPickActing] = useState<string | null>(null)
  const [pickError, setPickError] = useState<string | null>(null)

  const checkFranchise = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setFranchiseLoading(false); return }

    const { data: season } = await supabase
      .from('seasons').select('id').eq('status', 'active').single()

    if (!season) { setMyFranchise(null); setFranchiseLoading(false); return }

    const { data: member } = await supabase
      .from('league_members')
      .select('franchises(name, abbreviation)')
      .eq('user_id', user.id)
      .eq('season_id', season.id)
      .single()

    const f = member?.franchises as unknown as { name: string; abbreviation: string } | null
    setMyFranchise(f ?? null)
    setFranchiseLoading(false)
  }, [])

  useEffect(() => { checkFranchise() }, [checkFranchise])

  async function openFranchisePicker() {
    setPickError(null)
    setPickLoading(true)
    const res = await fetch('/api/franchise')
    const json = await res.json()
    setAvailableFranchises(json.franchises ?? [])
    setPickLoading(false)
    setShowFranchisePicker(true)
  }

  async function claimFranchise(id: string) {
    setPickActing(id)
    setPickError(null)
    const res = await fetch('/api/franchise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ franchiseId: id }),
    })
    const json = await res.json()
    setPickActing(null)
    if (json.error) { setPickError(json.error); return }
    setShowFranchisePicker(false)
    await checkFranchise()
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Group available franchises by conference
  const east = availableFranchises.filter(f => f.conference === 'East')
  const west = availableFranchises.filter(f => f.conference === 'West')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header className="sticky top-0 z-40" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-display text-lg font-black tracking-wider" style={{ color: 'var(--gold)' }}>
            🏀 GOAT LEAGUE
          </span>
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/draft-builder')}
              className="text-xs font-semibold px-3 py-1.5 rounded"
              style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}>
              Player List
            </button>
            {profile?.role === 'admin' && (
              <button onClick={() => router.push('/admin')}
                className="text-xs font-semibold px-3 py-1.5 rounded"
                style={{ background: 'rgba(234,179,8,0.1)', color: 'var(--gold)', border: '1px solid rgba(234,179,8,0.3)' }}>
                Backoffice
              </button>
            )}
            <button onClick={handleLogout}
              className="text-xs font-semibold px-3 py-1.5 rounded"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="font-display text-3xl font-black tracking-wider mb-1" style={{ color: 'var(--text)' }}>
            BENVENUTO, {(profile?.display_name ?? userEmail).toUpperCase()}
          </h1>
          {!franchiseLoading && myFranchise && (
            <p className="text-sm font-semibold" style={{ color: 'var(--text-dim)' }}>
              Franchigia: <span style={{ color: 'var(--gold)' }}>{myFranchise.name}</span>
            </p>
          )}
        </div>

        {/* Franchise picker banner — shown when no franchise assigned */}
        {!franchiseLoading && myFranchise === null && (
          <div className="rounded-2xl px-6 py-5 space-y-3"
            style={{ background: 'rgba(234,179,8,0.06)', border: '2px solid rgba(234,179,8,0.3)' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-display text-xl font-black tracking-wider" style={{ color: 'var(--gold)' }}>
                  SCEGLI LA TUA FRANCHIGIA
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-sec)' }}>
                  Non hai ancora una franchigia assegnata per questa stagione. Scegli subito tra quelle disponibili.
                </p>
              </div>
              <span className="text-3xl shrink-0">🏀</span>
            </div>
            <button
              onClick={openFranchisePicker}
              disabled={pickLoading}
              className="font-display font-black tracking-wide text-sm px-5 py-2.5 rounded-xl"
              style={{ background: 'var(--gold-bg)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }}>
              {pickLoading ? 'Caricamento...' : 'SCEGLI FRANCHIGIA →'}
            </button>
          </div>
        )}

        {/* Quick actions grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: 'Il mio Roster', icon: '👥', path: '/roster' },
            { label: 'GM Shop', icon: '🛒', path: '/gm-shop' },
            { label: 'GM Credits', icon: '💎', path: '/gm-credits' },
            { label: 'Player List', icon: '📋', path: '/draft-builder' },
            { label: 'Draft Class', icon: '🎓', path: '/draft' },
          ].map(item => (
            <button key={item.label} onClick={() => router.push(item.path)}
              className="rounded-xl p-5 text-left"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer' }}>
              <div className="text-2xl mb-2">{item.icon}</div>
              <div className="font-display font-black text-sm tracking-wide" style={{ color: 'var(--text)' }}>
                {item.label}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Franchise picker modal */}
      {showFranchisePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowFranchisePicker(false) }}>
          <div className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '85vh' }}>

            {/* Modal header */}
            <div className="px-6 py-4 flex items-center justify-between shrink-0"
              style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="font-display text-xl font-black tracking-wider" style={{ color: 'var(--text)' }}>
                SCEGLI LA TUA FRANCHIGIA
              </h2>
              <button onClick={() => setShowFranchisePicker(false)}
                className="text-sm px-3 py-1.5 rounded"
                style={{ background: 'var(--surface2)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}>
                ✕
              </button>
            </div>

            {pickError && (
              <div className="mx-6 mt-4 px-4 py-2 rounded-lg text-sm"
                style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                {pickError}
              </div>
            )}

            {availableFranchises.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <p className="font-display font-black" style={{ color: 'var(--text-dim)' }}>NESSUNA FRANCHIGIA DISPONIBILE</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>Tutte le franchige sono già state assegnate.</p>
              </div>
            ) : (
              <div className="overflow-y-auto px-6 py-4 space-y-5">
                {[['East', east], ['West', west]] .filter(([, list]) => (list as Franchise[]).length > 0)
                  .map(([conf, list]) => (
                  <div key={conf as string}>
                    <div className="text-[10px] font-black tracking-widest mb-2 font-display"
                      style={{ color: CONF_COLORS[conf as string] ?? 'var(--text-dim)' }}>
                      {conf as string}ERN CONFERENCE
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {(list as Franchise[]).map(f => {
                        const isActing = pickActing === f.id
                        return (
                          <button key={f.id} onClick={() => claimFranchise(f.id)} disabled={!!pickActing}
                            className="text-left rounded-xl px-4 py-3 transition-all"
                            style={{
                              background: 'var(--surface2)',
                              border: '1px solid var(--border)',
                              opacity: pickActing && !isActing ? 0.5 : 1,
                            }}>
                            <div className="font-display font-black text-sm" style={{ color: 'var(--text)' }}>
                              {isActing ? '...' : f.abbreviation}
                            </div>
                            <div className="text-xs mt-0.5 leading-tight" style={{ color: 'var(--text-sec)' }}>
                              {f.name}
                            </div>
                            <div className="text-[10px] mt-1" style={{ color: 'var(--text-dim)' }}>
                              {f.division}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
