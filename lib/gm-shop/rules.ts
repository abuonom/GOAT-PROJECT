/**
 * GM Shop domain rules — single source of truth.
 * These rules are derived from GM_SHOP_Definitivo_2K27_Attributo_Unico.xlsx.
 * The same logic is enforced at DB level via functions/triggers; this module
 * exists for frontend cost preview and validation ONLY.
 * Never duplicate these rules elsewhere.
 */

export const GM_SHOP_RULES = {
  MAX_UPGRADES_PER_PLAYER_PER_SEASON: 3,
  CARRY_OVER_MAX_GC: 5,
} as const

// GC milestones lookup table (step function, not linear).
// Source: Excel rows 4–12, column K (partite) and L (GC totali).
const GC_MILESTONES: { games: number; gc: number }[] = [
  { games: 82, gc: 25 },
  { games: 70, gc: 20 },
  { games: 60, gc: 16 },
  { games: 50, gc: 12 },
  { games: 40, gc: 9 },
  { games: 30, gc: 6 },
  { games: 20, gc: 4 },
  { games: 10, gc: 2 },
  { games: 5,  gc: 1 },
]

/**
 * Given games played, returns the cumulative GC earned for the season.
 * Returns the highest milestone reached (step function, not interpolated).
 */
export function calculateGcEarned(gamesPlayed: number): number {
  const milestone = GC_MILESTONES.find(m => gamesPlayed >= m.games)
  return milestone?.gc ?? 0
}

// Progressive surcharge tiers.
// Source: Excel rows 44–49 (COSTO A FASCE, valore PRIMA dell'upgrade).
const SURCHARGE_TIERS: { min: number; max: number | null; extra: number }[] = [
  { min: 94, max: null, extra: 8 },
  { min: 91, max: 93,   extra: 6 },
  { min: 88, max: 90,   extra: 4 },
  { min: 85, max: 87,   extra: 2 },
  { min: 0,  max: 84,   extra: 0 },
]

function getSurchargeExtra(currentValue: number): number {
  const tier = SURCHARGE_TIERS.find(
    t => currentValue >= t.min && (t.max === null || currentValue <= t.max)
  )
  return tier?.extra ?? 0
}

/**
 * Calculate the GC cost for upgrading an attribute.
 * - Badge upgrades: flat cost (no surcharge).
 * - Attribute upgrades: base cost + surcharge based on current value.
 */
export function calculateUpgradeCost(
  baseCost: number,
  currentValue: number | null,
  isBadgeUpgrade: boolean
): number {
  if (isBadgeUpgrade) return baseCost
  if (currentValue === null) return baseCost
  return baseCost + getSurchargeExtra(currentValue)
}

export type UpgradeBlockReason =
  | 'insufficient_gc'
  | 'already_upgraded_this_season'
  | 'upgrade_limit_reached'
  | 'player_not_in_roster'
  | 'attribute_not_upgradable'
  | 'no_active_season'

export interface UpgradeEligibility {
  canUpgrade: boolean
  cost: number
  blockReason?: UpgradeBlockReason
  blockMessage?: string
}

/**
 * Check if an upgrade is eligible before sending it to the server.
 * This is a preview check ONLY — the server enforces all rules authoritatively.
 */
export function checkUpgradeEligibility(params: {
  baseCost: number
  currentValue: number | null
  isBadgeUpgrade: boolean
  gcBalance: number
  upgradeCountForPlayer: number
  alreadyUpgradedThisSeason: boolean
  playerInRoster: boolean
}): UpgradeEligibility {
  const {
    baseCost, currentValue, isBadgeUpgrade,
    gcBalance, upgradeCountForPlayer,
    alreadyUpgradedThisSeason, playerInRoster,
  } = params

  if (!playerInRoster) {
    return { canUpgrade: false, cost: 0, blockReason: 'player_not_in_roster',
      blockMessage: 'Giocatore non nel tuo roster' }
  }

  if (upgradeCountForPlayer >= GM_SHOP_RULES.MAX_UPGRADES_PER_PLAYER_PER_SEASON) {
    return { canUpgrade: false, cost: 0, blockReason: 'upgrade_limit_reached',
      blockMessage: `Limite raggiunto: ${GM_SHOP_RULES.MAX_UPGRADES_PER_PLAYER_PER_SEASON}/${GM_SHOP_RULES.MAX_UPGRADES_PER_PLAYER_PER_SEASON} upgrade usati` }
  }

  if (alreadyUpgradedThisSeason) {
    return { canUpgrade: false, cost: 0, blockReason: 'already_upgraded_this_season',
      blockMessage: 'Attributo già potenziato questa stagione' }
  }

  const cost = calculateUpgradeCost(baseCost, currentValue, isBadgeUpgrade)

  if (gcBalance < cost) {
    return { canUpgrade: false, cost, blockReason: 'insufficient_gc',
      blockMessage: `GC insufficienti: hai ${gcBalance} GC, servono ${cost} GC` }
  }

  return { canUpgrade: true, cost }
}
