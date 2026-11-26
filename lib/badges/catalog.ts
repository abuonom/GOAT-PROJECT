// Catalogo dei cartellini NBA 2K (nome → categoria), ricavato dai giocatori in lista.
// Serve al form "Aggiungi cartellino" per evitare errori di battitura.
// Se esce un cartellino nuovo nel gioco, aggiungilo qui.

export const BADGE_TIERS = ['Bronze', 'Silver', 'Gold', 'Hall of Fame', 'Legend'] as const
export type BadgeTier = (typeof BADGE_TIERS)[number]

export const BADGE_CATALOG: { name: string; category: string }[] = [
  { name: "Ankle Braces", category: "Defense" },
  { name: "Challenger", category: "Defense" },
  { name: "Glove", category: "Defense" },
  { name: "High-Flying Denier", category: "Defense" },
  { name: "Immovable Enforcer", category: "Defense" },
  { name: "Interceptor", category: "Defense" },
  { name: "Off-Ball Pest", category: "Defense" },
  { name: "On-Ball Menace", category: "Defense" },
  { name: "Paint Patroller", category: "Defense" },
  { name: "Pick Dodger", category: "Defense" },
  { name: "Post Lockdown", category: "Defense" },
  { name: "Seatbelt", category: "Defense" },
  { name: "Wall Up", category: "Defense" },
  { name: "Aerial Wizard", category: "Finishing" },
  { name: "Float Game", category: "Finishing" },
  { name: "Ghost Stepper", category: "Finishing" },
  { name: "Hook Specialist", category: "Finishing" },
  { name: "Layup Mixmaster", category: "Finishing" },
  { name: "Paint Prodigy", category: "Finishing" },
  { name: "Physical Finisher", category: "Finishing" },
  { name: "Post Powerhouse", category: "Finishing" },
  { name: "Post Spin Catalyst", category: "Finishing" },
  { name: "Posterizer", category: "Finishing" },
  { name: "Rise Up", category: "Finishing" },
  { name: "Post-Up Poet", category: "Inside Scoring" },
  { name: "Set Shot Specialist", category: "Outside Scoring" },
  { name: "Shifty Shooter", category: "Outside Scoring" },
  { name: "Brick Wall", category: "Physical" },
  { name: "Bruiser", category: "Physical" },
  { name: "Flash", category: "Physical" },
  { name: "Pogo Stick", category: "Physical" },
  { name: "Slippery Off-Ball", category: "Physical" },
  { name: "Work Horse", category: "Physical" },
  { name: "Ankle Assassin", category: "Playmaking" },
  { name: "Bail Out", category: "Playmaking" },
  { name: "Break Starter", category: "Playmaking" },
  { name: "Dimer", category: "Playmaking" },
  { name: "Handles for Days", category: "Playmaking" },
  { name: "Lightning Launch", category: "Playmaking" },
  { name: "Pace", category: "Playmaking" },
  { name: "Strong Handle", category: "Playmaking" },
  { name: "Unpluckable", category: "Playmaking" },
  { name: "Versatile Visionary", category: "Playmaking" },
  { name: "Boxout Beast", category: "Rebounding" },
  { name: "Boxout Boss", category: "Rebounding" },
  { name: "Breaker", category: "Rebounding" },
  { name: "Crasher", category: "Rebounding" },
  { name: "Possession Closer", category: "Rebounding" },
  { name: "Rebound Chaser", category: "Rebounding" },
  { name: "Sync Snatcher", category: "Rebounding" },
  { name: "Arc Cadence", category: "Shooting" },
  { name: "Deadeye", category: "Shooting" },
  { name: "Limitless Range", category: "Shooting" },
  { name: "Mini Marksman", category: "Shooting" },
  { name: "Post Fade Phenom", category: "Shooting" },
  { name: "Quick Trigger", category: "Shooting" },
  { name: "Set and Fire", category: "Shooting" },
  { name: "Smooth Operator", category: "Shooting" },
  { name: "Static Middy", category: "Shooting" },
]

export function findCatalogBadge(name: string) {
  const n = name.trim().toLowerCase()
  return BADGE_CATALOG.find(b => b.name.toLowerCase() === n) ?? null
}
