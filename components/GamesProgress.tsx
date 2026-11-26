// Partite giocate della franchigia con le soglie dei GC (barra + traguardi).
// Usato nella dashboard e nel GM Shop, così le soglie stanno in un posto solo.

// Traguardi di partite → GC totali della stagione
export const GC_MILESTONES = [5, 10, 20, 30, 40, 50, 60, 70, 82]
export const GC_TOTALS = [1, 2, 4, 6, 9, 12, 16, 20, 25]

function nextMilestone(gamesPlayed: number) {
  const idx = GC_MILESTONES.findIndex(m => m > gamesPlayed)
  if (idx === -1) return null
  return { games: GC_MILESTONES[idx], gc: GC_TOTALS[idx] }
}

export default function GamesProgress({ gamesPlayed }: { gamesPlayed: number }) {
  const m = nextMilestone(gamesPlayed)
  const pct = m ? Math.min(100, Math.round((gamesPlayed / m.games) * 100)) : 100

  return (
    <section className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex justify-between items-baseline">
        <span className="font-display text-sm font-bold tracking-wide">Partite giocate</span>
        <span className="font-display text-lg font-black" style={{ color: 'var(--gold)' }}>{gamesPlayed}</span>
      </div>
      <div className="relative pb-10">
        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: m ? '#60a5fa' : '#4ade80' }} />
        </div>
        {GC_MILESTONES.map((g, i) => {
          const reached = gamesPlayed >= g
          return (
            <div
              key={g}
              className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
              style={{ left: `${(g / 82) * 100}%` }}
            >
              <span className="w-0.5 h-3" style={{ background: reached ? '#4ade80' : 'var(--text-dim)' }} />
              <span className="text-[10px] font-mono mt-1 whitespace-nowrap" style={{ color: reached ? '#4ade80' : 'var(--text-dim)', marginTop: i % 2 === 0 ? 4 : 22 }}>
                {g} · {GC_TOTALS[i]} GC
              </span>
            </div>
          )
        })}
      </div>
      <p className="text-xs" style={{ color: 'var(--text-sec)' }}>
        {m
          ? `Ti mancano ${m.games - gamesPlayed} partite per arrivare a ${m.games} partite: ${m.gc} GC totali.`
          : 'Hai raggiunto il massimo: tutte le partite della stagione.'}
      </p>
    </section>
  )
}
