import type { Player } from '@/types/nba'
import type { ContractEntry } from '@/app/api/contracts/route'
import type { PlayerExtra } from '@/hooks/usePotentials'

// ── Weights (user-controlled via sliders 0–10) ────────────────────────────────
export interface BuildWeights {
  rebuild:       number  // young + potential
  winNow:        number  // overall + prime age
  valueHunt:     number  // elite attributes vs overall
  teamFriendly:  number  // short/cheap contract
  physicalFreak: number  // height/wingspan/athleticism vs position norm
  capRelief:     number  // high salary expiring soon → cap space freed
}

export const DEFAULT_WEIGHTS: BuildWeights = { rebuild: 0, winNow: 0, valueHunt: 0, teamFriendly: 0, physicalFreak: 0, capRelief: 0 }

// ── Sub-scores (0–100 each) ───────────────────────────────────────────────────

const POT_SCORE: Record<string, number> = {
  'A+': 100, 'A': 90, 'A-': 80,
  'B+': 65,  'B': 50, 'B-': 35,
  'C+': 20,  'C': 10, 'D': 0,
}

function ageScore(age: number | null | undefined): number {
  if (age == null) return 5   // età sconosciuta = penalizzata nel rebuild
  if (age <= 21) return 100
  if (age <= 25) return 100 - (age - 21) * 10
  if (age <= 29) return 60  - (age - 25) * 12
  if (age <= 32) return 12  - (age - 29) * 4
  return 0
}

function ovrScore(overall: number): number {
  if (overall >= 95) return 100
  if (overall >= 90) return 75 + (overall - 90) * 5
  if (overall >= 85) return 50 + (overall - 85) * 5
  if (overall >= 80) return 30 + (overall - 80) * 4
  if (overall >= 75) return 15 + (overall - 75) * 3
  return Math.max(0, overall - 65)
}

// Attributes that reveal multi-dimensional players (hidden gems)
const VALUE_ATTRS: (keyof Player['attributes'])[] = [
  'threePointShot', 'drivingDunk', 'closeShot', 'drivingLayup',
  'speed', 'agility', 'vertical', 'strength',
  'steal', 'block', 'perimeterDefense',
  'ballHandle', 'passIQ', 'speedWithBall',
]

function valueHuntScore(player: Player): number {
  const ovr = player.overall
  const attrs = player.attributes
  let bonus = 0
  let count = 0
  for (const key of VALUE_ATTRS) {
    const val = attrs[key]
    if (val == null) continue
    // Reward attributes that meaningfully exceed the player's overall
    const diff = val - (ovr - 3)
    if (diff > 0 && val >= 75) {
      bonus += diff
      count++
    }
  }
  // Normalize: a player with 6 attributes 15 pts above OVR scores ~100
  const raw = count > 0 ? bonus / Math.max(1, count) * (Math.min(count, 8) / 8) * 10 : 0
  return Math.min(100, raw)
}

// ── Physical freak score ──────────────────────────────────────────────────────
// Rewards players who are physically exceptional FOR THEIR SMALLEST POSITION.
// A 7'0" PF is normal; a 7'0" PG (Cooper Flagg, Scottie Barnes) is a freak.

const POS_ORDER = ['PG', 'SG', 'SF', 'PF', 'C']

// Average height in inches per position (NBA league averages)
const POS_AVG_HEIGHT: Record<string, number> = { PG: 74, SG: 77, SF: 79, PF: 81, C: 83 }
// Average wingspan in inches per position
const POS_AVG_WINGSPAN: Record<string, number> = { PG: 77, SG: 80, SF: 83, PF: 85, C: 88 }

function parseFeetInches(s: string | undefined): number | null {
  if (!s) return null
  const m = s.match(/(\d+)'(\d+)"/)
  return m ? parseInt(m[1]) * 12 + parseInt(m[2]) : null
}

function physicalFreakScore(player: Player): number {
  const positions = player.positions ?? []
  if (positions.length === 0) return 0

  // Use the most guard-like position they play (smallest in the hierarchy)
  const smallestPos = positions.reduce((best, p) => {
    const bi = POS_ORDER.indexOf(best), pi = POS_ORDER.indexOf(p)
    return (pi >= 0 && (bi < 0 || pi < bi)) ? p : best
  }, positions[0])

  const avgH = POS_AVG_HEIGHT[smallestPos] ?? 79
  const avgW = POS_AVG_WINGSPAN[smallestPos] ?? 83

  const heightIn  = parseFeetInches(player.height)
  const wingspanIn = parseFeetInches(player.wingspan)

  // Height bonus: 8+ inches above position avg = full 40 pts
  const heightScore = heightIn != null
    ? Math.min(1, Math.max(0, (heightIn - avgH) / 8)) * 40
    : 0

  // Wingspan bonus: 6+ inches above position avg = full 35 pts
  const wingspanScore = wingspanIn != null
    ? Math.min(1, Math.max(0, (wingspanIn - avgW) / 6)) * 35
    : 0

  // Physical athleticism: speed, agility, vertical, strength vs OVR
  const physKeys = ['speed', 'agility', 'vertical', 'strength'] as const
  const physVals = physKeys.map(k => player.attributes[k] ?? 0).filter(v => v > 0)
  const physAvg = physVals.length > 0 ? physVals.reduce((a, b) => a + b, 0) / physVals.length : 0
  const physScore = Math.min(1, Math.max(0, (physAvg - 65) / 25)) * 25

  // If no wingspan data, upweight the other two components
  if (wingspanIn == null) {
    return Math.min(100, Math.round((heightScore / 40) * 55 + physScore * 1.8))
  }

  return Math.min(100, Math.round(heightScore + wingspanScore + physScore))
}

// Rewards high-salary players expiring soon: the more cap you free by cutting them, the better.
function capReliefScore(contract: ContractEntry | null | undefined): number {
  if (!contract) return 0  // FA: nothing to free
  const years = contract.years_remaining
  const salary = contract.salaries[0]?.amount ?? 0
  const capPct = salary / 164_961_000

  // Only interesting if salary is meaningful (>8% cap) and contract is short (≤3yr)
  if (capPct < 0.08 || years > 3) return 0

  // More salary + fewer years = higher score
  const salScore  = capPct >= 0.30 ? 100 : capPct >= 0.22 ? 85 : capPct >= 0.16 ? 70 : capPct >= 0.12 ? 50 : 30
  const yearsBonus = years === 1 ? 1.0 : years === 2 ? 0.75 : 0.4  // 3yr gives partial credit
  return Math.min(100, Math.round(salScore * yearsBonus))
}

function contractScore(contract: ContractEntry | null | undefined): number {
  if (!contract) return 35  // FA: uncertain, mid score
  const years = contract.years_remaining
  const salary = contract.salaries[0]?.amount ?? 0
  const note = contract.salaries[0]?.note ?? ''

  const yearsScore = years <= 1 ? 100 : years === 2 ? 80 : years === 3 ? 55 : years === 4 ? 30 : 8
  const capPct = salary / 164_961_000
  const salScore = capPct < 0.03 ? 100 : capPct < 0.06 ? 85 : capPct < 0.09 ? 65 :
                   capPct < 0.12 ? 45 : capPct < 0.16 ? 25 : capPct < 0.22 ? 10 : 3

  const optBonus = note === 'PO' ? 5 : note === 'TO' ? -15 : note === 'QO' ? -5 : 0
  return Math.min(100, Math.max(0, yearsScore * 0.45 + salScore * 0.55 + optBonus))
}

// ── Main scorer ───────────────────────────────────────────────────────────────

export interface PlayerScore {
  rebuild:       number
  winNow:        number
  valueHunt:     number
  teamFriendly:  number
  physicalFreak: number
  capRelief:     number
  total:         number
}

export function scorePlayer(
  player: Player,
  extra: PlayerExtra | undefined,
  contract: ContractEntry | null | undefined,
  weights: BuildWeights,
): PlayerScore {
  const totalWeight = weights.rebuild + weights.winNow + weights.valueHunt + weights.teamFriendly + weights.physicalFreak + weights.capRelief || 1

  const potScore = extra?.potential ? (POT_SCORE[extra.potential] ?? 30) : 30
  const rebuild       = Math.round((ageScore(extra?.age) * 0.55 + potScore * 0.45))
  const winNow        = Math.round(ovrScore(player.overall))
  const valueHunt     = Math.round(valueHuntScore(player))
  const teamFriendly  = Math.round(contractScore(contract))
  const physicalFreak = Math.round(physicalFreakScore(player))
  const capRelief     = Math.round(capReliefScore(contract))

  const total = Math.round(
    (rebuild * weights.rebuild + winNow * weights.winNow +
     valueHunt * weights.valueHunt + teamFriendly * weights.teamFriendly +
     physicalFreak * weights.physicalFreak + capRelief * weights.capRelief) / totalWeight
  )

  return { rebuild, winNow, valueHunt, teamFriendly, physicalFreak, capRelief, total }
}
