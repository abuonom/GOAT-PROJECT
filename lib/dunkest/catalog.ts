import { createClient } from '@/lib/supabase/server'
import type { DunkestPlayer } from '@/types/dunkest'

export interface CatalogFilter {
  search?: string
  role?: string
  team?: string
  excludeIds?: number[]
}

export async function getDunkestPlayers(filter: CatalogFilter = {}): Promise<DunkestPlayer[]> {
  const supabase = await createClient()
  let query = supabase.from('dunkest_players').select('*').order('value', { ascending: false })

  if (filter.search) {
    query = query.ilike('name', `%${filter.search}%`)
  }
  if (filter.role) {
    query = query.eq('role', filter.role)
  }
  if (filter.team) {
    query = query.eq('team', filter.team)
  }
  if (filter.excludeIds && filter.excludeIds.length > 0) {
    query = query.not('id', 'in', `(${filter.excludeIds.join(',')})`)
  }

  const { data, error } = await query
  if (error) throw new Error(`getDunkestPlayers: ${error.message}`)
  return data ?? []
}

export async function getDunkestPlayerById(id: number): Promise<DunkestPlayer | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('dunkest_players')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}

export async function getDunkestRoles(): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('dunkest_players')
    .select('role')
    .order('role')
  const roles = [...new Set((data ?? []).map(r => r.role))]
  return roles
}

export async function getDunkestTeams(): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('dunkest_players')
    .select('team')
    .order('team')
  const teams = [...new Set((data ?? []).map(r => r.team))]
  return teams
}
