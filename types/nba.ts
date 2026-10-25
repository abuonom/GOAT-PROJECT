export interface PlayerAttributes {
  closeShot?: number
  midRangeShot?: number
  threePointShot?: number
  freeThrow?: number
  shotIQ?: number
  offensiveConsistency?: number
  speedWithBall?: number
  ballHandle?: number
  passAccuracy?: number
  passVision?: number
  passIQ?: number
  passPerception?: number
  drivingLayup?: number
  standingDunk?: number
  drivingDunk?: number
  postHook?: number
  postFade?: number
  postControl?: number
  drawFoul?: number
  hands?: number
  interiorDefense?: number
  perimeterDefense?: number
  steal?: number
  block?: number
  lateralQuickness?: number
  helpDefenseIQ?: number
  defensiveConsistency?: number
  defensiveRebound?: number
  offensiveRebound?: number
  speed?: number
  agility?: number
  strength?: number
  vertical?: number
  stamina?: number
  hustle?: number
  durability?: number
  [key: string]: number | undefined
}

export interface Badge {
  name: string
  tier: string
  category: string
  description?: string
}

export interface PlayerBadges {
  total?: number
  counts?: Record<string, number>
  list?: Badge[]
}

export interface RatingHistory {
  gameVersion: string
  overall: number
  delta?: number
}

export interface Player {
  name: string
  slug: string
  team: string
  teamType: string
  overall: number
  positions: string[]
  archetype?: string
  height?: string
  weight?: string
  wingspan?: string
  college?: string
  gameVersion?: string
  attributes: PlayerAttributes
  badges: PlayerBadges
  ratingHistory?: RatingHistory[]
}

export interface PlayersResponse {
  success: boolean
  data: Player[]
  meta?: {
    pagination?: {
      hasMore: boolean
      nextCursor: string | null
      count: number
      total: number
    }
  }
}

export interface PlayerFilters {
  position?: string
  team?: string
  minRating?: number
  maxRating?: number
  search?: string
  [key: string]: string | number | undefined
}
