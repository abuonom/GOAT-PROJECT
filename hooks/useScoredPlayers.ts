'use client'

import { useEffect, useRef, useState } from 'react'
import type { BuildWeights } from '@/lib/nba/playerScorer'

// Lista giocatori già punteggiata dal server (/api/players/scored).
// Ricalcola solo quando i pesi cambiano, con una breve pausa per non inviare
// una richiesta per ogni posizione dello slider. Una richiesta alla volta.

export interface ScoredPlayer {
  slug: string
  name: string
  team: string
  overall: number
  positions: string[]
  height?: string
  attributes: Record<string, number | undefined>
  badges: { total: number; counts: Record<string, number> }
  potential: string | null
  age: number | null
  contract: unknown | null
  score: { rebuild: number; winNow: number; valueHunt: number; teamFriendly: number; physicalFreak: number; capRelief: number; total: number }
}

const DEBOUNCE_MS = 250

export function useScoredPlayers(weights: BuildWeights) {
  const [data, setData] = useState<ScoredPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const reqId = useRef(0)

  const key = JSON.stringify(weights)

  useEffect(() => {
    const id = ++reqId.current
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/players/scored', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weights }),
        })
        const json = await res.json()
        // Ignora risposte di richieste superate da una più recente
        if (id !== reqId.current) return
        setData(json.success ? json.data : [])
        setError(!json.success)
      } catch {
        if (id === reqId.current) setError(true)
      } finally {
        if (id === reqId.current) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { data, loading, error }
}
