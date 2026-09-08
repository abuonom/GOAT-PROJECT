/**
 * Popola la tabella draft_picks in Supabase dalla cache locale.
 * Uso: node scripts/seed-draft.mjs
 * Richiede .env.local con NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()] })
)

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY  // service role per insert senza RLS
)

const YEARS = [2026]
const CACHE_DIR = resolve(process.cwd(), '.cache')

for (const year of YEARS) {
  const cacheFile = resolve(CACHE_DIR, `draft_${year}.json`)
  if (!existsSync(cacheFile)) {
    console.log(`⚠️  Nessuna cache per ${year} — salto`)
    continue
  }

  const { data: players } = JSON.parse(readFileSync(cacheFile, 'utf-8'))
  if (!players?.length) { console.log(`⚠️  Cache vuota per ${year}`); continue }

  const rows = players.map(p => ({
    draft_year: year,
    slug:       p.slug,
    rank:       p.rank,
    pick:       p.pick,
    name:       p.name,
    positions:  p.positions ?? [],
    height:     p.height ?? '',
    team_abbr:  p.teamAbbr ?? '',
    overall:    p.overall ?? 0,
  }))

  const { error } = await supabase
    .from('draft_picks')
    .upsert(rows, { onConflict: 'draft_year,slug' })

  if (error) {
    console.error(`❌ Errore ${year}:`, error.message)
  } else {
    console.log(`✅ ${year}: ${rows.length} giocatori inseriti`)
  }
}
