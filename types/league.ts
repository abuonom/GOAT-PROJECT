export type UserRole = 'gm' | 'admin'

export interface Profile {
  id: string
  display_name: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export interface League {
  id: string
  name: string
  max_franchises: number
  active: boolean
  created_at: string
}

export interface Season {
  id: string
  league_id: string
  name: string
  game_version: string
  start_date: string | null
  end_date: string | null
  status: 'upcoming' | 'active' | 'closing' | 'closed'
  carry_over_max: number
  created_at: string
}

export interface Franchise {
  id: string
  league_id: string
  name: string
  abbreviation: string
  city: string
  conference: 'East' | 'West'
  division: string
  espn_id: string | null
  sort_order: number
}

export interface LeagueMember {
  id: string
  league_id: string
  season_id: string
  user_id: string
  franchise_id: string
  games_played: number
  joined_at: string
  // joined from queries
  profile?: Profile
  franchise?: Franchise
}

export interface RosterMembership {
  id: string
  season_id: string
  franchise_id: string
  player_slug: string
  status: 'selected' | 'confirmed' | 'released'
  acquired_at: string
  released_at: string | null
  created_by: string
}

export interface GmShopAttribute {
  id: string
  attribute_key: string
  label_it: string
  base_cost: number
  category: string
  is_badge_upgrade: boolean
  sort_order: number
  active: boolean
}

export interface GmShopUpgrade {
  id: string
  transaction_id: string
  season_id: string
  user_id: string
  player_slug: string
  attribute_key: string
  old_value: number | null
  new_value: number | null
  gc_cost: number
  created_at: string
}

export interface GmCreditLedgerEntry {
  id: string
  season_id: string
  user_id: string
  amount: number
  type: 'earned' | 'spent' | 'carryover' | 'adjustment'
  reference_id: string | null
  note: string | null
  created_at: string
  created_by: string
}
