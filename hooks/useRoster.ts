'use client'
import { useState, useEffect, useCallback } from 'react'
import type { RosterMembership } from '@/types/league'

export type OwnershipMap = Record<string, {
  franchiseName: string
  abbreviation: string
  status: 'selected' | 'confirmed'
}>

// Lightweight hook for the player list — just loads ownership map once
export function useOwnershipMap() {
  const [map, setMap] = useState<OwnershipMap>({})
  const [myRosterSlugs, setMyRosterSlugs] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const [ownershipRes, mineRes] = await Promise.all([
      fetch('/api/roster?type=ownership'),
      fetch('/api/roster?type=mine'),
    ])
    if (ownershipRes.ok) setMap(await ownershipRes.json())
    if (mineRes.ok) {
      const mine: RosterMembership[] = await mineRes.json()
      setMyRosterSlugs(new Set(mine.map(m => m.player_slug)))
    }
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  return { map, myRosterSlugs, loading, reload }
}

// Full roster management hook for the /roster page
export function useMyRoster() {
  const [memberships, setMemberships] = useState<RosterMembership[]>([])
  const [franchiseName, setFranchiseName] = useState<string | null>(null)
  const [seasonName, setSeasonName] = useState<string | null>(null)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/roster?type=mine')
    if (res.ok) {
      const data = await res.json()
      setMemberships(data)
      setIsConfirmed(data.length > 0 && data.every((m: RosterMembership) => m.status === 'confirmed'))
    }
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  async function removePlayer(playerSlug: string) {
    setActing(playerSlug)
    const res = await fetch('/api/roster', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerSlug }),
    })
    const json = await res.json()
    setActing(null)
    if (json.error) return json.error as string
    setMemberships(prev => prev.filter(m => m.player_slug !== playerSlug))
    return null
  }

  async function confirm(): Promise<string | null> {
    const res = await fetch('/api/roster', { method: 'PATCH' })
    const json = await res.json()
    if (json.error) return json.error as string
    await reload()
    return null
  }

  return {
    memberships, franchiseName, seasonName, isConfirmed,
    loading, acting,
    removePlayer, confirm, reload,
    setFranchiseName, setSeasonName,
  }
}
