/**
 * resync-players.mjs — aggiorna players su Supabase dall'API nba2kapi
 *
 * Uso:
 *   node scripts/resync-players.mjs              # dry-run (solo report)
 *   node scripts/resync-players.mjs --apply       # applica le modifiche
 *   node scripts/resync-players.mjs --slug=cade-cunningham   # un solo giocatore
 *   node scripts/resync-players.mjs --slug=cade-cunningham --apply
 *
 * Controlla: badges, attributes, overall, team, positions, ratingHistory
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Env ───────────────────────────────────────────────────────────────────────

const envPath = resolve(process.cwd(), '.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const idx = l.indexOf('='); return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()] })
)

const SUPABASE_URL         = env['NEXT_PUBLIC_SUPABASE_URL']
const SUPABASE_SERVICE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']
const API_KEY              = env['NBA2K_API_KEY']
const API_BASE             = 'https://api.nba2kapi.com'
const CONCURRENCY          = 10

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !API_KEY) {
  console.error('❌  Mancano variabili in .env.local: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NBA2K_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const APPLY   = process.argv.includes('--apply')
const TARGET  = process.argv.find(a => a.startsWith('--slug='))?.split('=')[1] ?? null

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg)      { process.stdout.write(msg + '\n') }
function progress(msg) { process.stdout.write('\r' + msg.padEnd(70)) }

async function chunk(arr, size, fn) {
  for (let i = 0; i < arr.length; i += size) await fn(arr.slice(i, i + size), i)
}

function badgeCount(player) {
  return player?.badges?.list?.length ?? 0
}

function attrHash(player) {
  const a = player?.attributes ?? {}
  return Object.values(a).join(',')
}

// Confronta due player e restituisce le differenze rilevanti
function diff(oldP, newP) {
  const changes = []

  // Overall
  if (oldP.overall !== newP.overall) {
    changes.push({ field: 'overall', old: oldP.overall, new: newP.overall })
  }

  // Team
  if (oldP.team !== newP.team) {
    changes.push({ field: 'team', old: oldP.team, new: newP.team })
  }

  // Badges
  const oldBadges = (oldP.badges?.list ?? []).filter(b => !b.manual)   // i cartellini manuali non vengono dall'API
  const newBadges = newP.badges?.list ?? []
  if (oldBadges.length !== newBadges.length) {
    changes.push({ field: 'badges', old: oldBadges.length, new: newBadges.length })
  } else {
    // Stessa lunghezza ma contenuto diverso?
    const oldSet = new Set(oldBadges.map(b => `${b.name}:${b.tier}`))
    const newSet = new Set(newBadges.map(b => `${b.name}:${b.tier}`))
    const added   = [...newSet].filter(x => !oldSet.has(x))
    const removed = [...oldSet].filter(x => !newSet.has(x))
    if (added.length > 0 || removed.length > 0) {
      changes.push({ field: 'badges_content', added, removed })
    }
  }

  // Attributi (cambia uno qualsiasi)
  const oldAttrs = oldP.attributes ?? {}
  const newAttrs = newP.attributes ?? {}
  const attrDiffs = []
  const allKeys = new Set([...Object.keys(oldAttrs), ...Object.keys(newAttrs)])
  for (const k of allKeys) {
    if (oldAttrs[k] !== newAttrs[k]) attrDiffs.push({ key: k, old: oldAttrs[k], new: newAttrs[k] })
  }
  if (attrDiffs.length > 0) {
    changes.push({ field: 'attributes', count: attrDiffs.length, diffs: attrDiffs })
  }

  // Rating history
  const oldHist = JSON.stringify(oldP.ratingHistory ?? [])
  const newHist = JSON.stringify(newP.ratingHistory ?? [])
  if (oldHist !== newHist) {
    changes.push({ field: 'ratingHistory', old: oldP.ratingHistory?.length ?? 0, new: newP.ratingHistory?.length ?? 0 })
  }

  return changes
}

// ── Step 1: fetch da API ───────────────────────────────────────────────────────

async function fetchFromApi() {
  log('▶  Fetching da nba2kapi.com...')
  let res
  try {
    res = await fetch(`${API_BASE}/api/players/bulk?teamType=curr`, {
      headers: { 'X-API-Key': API_KEY },
    })
  } catch (e) {
    throw new Error(`Fetch error: ${e.message}`)
  }
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API error ${res.status}: ${body}`)
  }
  const data = await res.json()
  if (!data.success) throw new Error(`API: ${JSON.stringify(data.error)}`)
  log(`   ✓ ${data.data.length} giocatori dall'API`)
  return data.data
}

// ── Step 2: fetch da Supabase ─────────────────────────────────────────────────

async function fetchFromSupabase() {
  log('▶  Lettura Supabase...')
  const all = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('players')
      .select('slug, data')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`Supabase read: ${error.message}`)
    all.push(...(data ?? []))
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  log(`   ✓ ${all.length} giocatori su Supabase`)
  return all
}

// ── Step 3: confronto + report ────────────────────────────────────────────────

function buildReport(apiPlayers, dbRows) {
  const dbMap = new Map(dbRows.map(r => [r.slug, r.data]))

  const report = {
    unchanged: [],
    changed: [],
    newInApi: [],      // presenti in API ma non in Supabase
    onlyInDb: [],      // presenti in Supabase ma non in API
  }

  const apiSlugs = new Set()
  for (const p of apiPlayers) {
    apiSlugs.add(p.slug)
    const old = dbMap.get(p.slug)
    if (!old) {
      report.newInApi.push(p.slug)
    } else {
      const changes = diff(old, p)
      if (changes.length > 0) {
        report.changed.push({ slug: p.slug, name: p.name, changes })
      } else {
        report.unchanged.push(p.slug)
      }
    }
  }

  for (const r of dbRows) {
    if (!apiSlugs.has(r.slug)) report.onlyInDb.push(r.slug)
  }

  return report
}

function printReport(report) {
  log('\n═══════════════════════════════════════════════════════════════════')
  log('📊  REPORT DIFFERENZE')
  log('═══════════════════════════════════════════════════════════════════')
  log(`   Invariati   : ${report.unchanged.length}`)
  log(`   Modificati  : ${report.changed.length}`)
  log(`   Nuovi in API: ${report.newInApi.length}`)
  log(`   Solo in DB  : ${report.onlyInDb.length}`)
  log('')

  if (report.newInApi.length > 0) {
    log('🆕  Nuovi giocatori (non ancora in Supabase):')
    report.newInApi.forEach(s => log(`     + ${s}`))
    log('')
  }

  if (report.onlyInDb.length > 0) {
    log('⚠️   Solo in DB (non più in API — potrebbero essere retired):')
    report.onlyInDb.forEach(s => log(`     ? ${s}`))
    log('')
  }

  if (report.changed.length > 0) {
    log('✏️   Giocatori con differenze:')
    log('')
    for (const { slug, name, changes } of report.changed) {
      log(`  ┌─ ${name} (${slug})`)
      for (const c of changes) {
        if (c.field === 'badges') {
          const delta = c.new - c.old
          const sign = delta > 0 ? '+' : ''
          log(`  │  badges     : ${c.old} → ${c.new}  (${sign}${delta})`)
        } else if (c.field === 'badges_content') {
          if (c.added.length)   log(`  │  badges +   : ${c.added.join(', ')}`)
          if (c.removed.length) log(`  │  badges -   : ${c.removed.join(', ')}`)
        } else if (c.field === 'attributes') {
          log(`  │  attributes : ${c.count} cambiati`)
          c.diffs.slice(0, 5).forEach(d => log(`  │    ${d.key.padEnd(25)} ${d.old ?? '—'} → ${d.new ?? '—'}`))
          if (c.diffs.length > 5) log(`  │    ... e altri ${c.diffs.length - 5}`)
        } else if (c.field === 'overall') {
          const delta = c.new - c.old
          const sign = delta > 0 ? '+' : ''
          log(`  │  overall    : ${c.old} → ${c.new}  (${sign}${delta})`)
        } else if (c.field === 'team') {
          log(`  │  team       : "${c.old}" → "${c.new}"`)
        } else if (c.field === 'ratingHistory') {
          log(`  │  ratingHist : ${c.old} voci → ${c.new} voci`)
        }
      }
      log('  └─')
    }
    log('')
  }
}

// ── Step 4: applica aggiornamenti ─────────────────────────────────────────────

async function applyUpdates(report, apiPlayers, dbRows) {
  const apiMap = new Map(apiPlayers.map(p => [p.slug, p]))
  const dbMap  = new Map(dbRows.map(r => [r.slug, r.data]))

  const toUpsert = [
    ...report.changed.map(c => c.slug),
    ...report.newInApi,
  ].map(slug => {
    const p = apiMap.get(slug)
    // Cartellini aggiunti a mano dall'admin: restano, tranne se l'API ora li ha già
    const apiList = p.badges?.list ?? []
    const apiNames = new Set(apiList.map(b => b.name.toLowerCase()))
    const manual = (dbMap.get(slug)?.badges?.list ?? [])
      .filter(b => b.manual && !apiNames.has(b.name.toLowerCase()))
    const data = manual.length > 0
      ? { ...p, badges: { ...(p.badges ?? {}), list: [...apiList, ...manual] } }
      : p
    return { slug, data, updated_at: new Date().toISOString() }
  })

  if (toUpsert.length === 0) {
    log('✅  Nessun aggiornamento da applicare.')
    return
  }

  log(`▶  Aggiornamento di ${toUpsert.length} giocatori su Supabase...`)
  let done = 0
  await chunk(toUpsert, 50, async (batch) => {
    const { error } = await supabase.from('players').upsert(batch)
    if (error) throw new Error(`Supabase upsert: ${error.message}`)
    done += batch.length
    progress(`   ${done} / ${toUpsert.length}`)
  })
  log(`\n✅  ${toUpsert.length} giocatori aggiornati.`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log('\n🏀  RESYNC PLAYERS — nba2kapi → Supabase')
  log(APPLY ? '   Modalità: APPLY (scrive su Supabase)' : '   Modalità: DRY-RUN (solo report, usa --apply per scrivere)')
  if (TARGET) log(`   Target: ${TARGET}`)
  log('')

  let [apiPlayers, dbRows] = await Promise.all([fetchFromApi(), fetchFromSupabase()])

  if (TARGET) {
    apiPlayers = apiPlayers.filter(p => p.slug === TARGET)
    dbRows     = dbRows.filter(r => r.slug === TARGET)
    if (apiPlayers.length === 0) { log(`❌  Giocatore "${TARGET}" non trovato in API`); process.exit(1) }
  }

  const report = buildReport(apiPlayers, dbRows)
  printReport(report)

  if (APPLY) {
    await applyUpdates(report, apiPlayers, dbRows)
  } else {
    const total = report.changed.length + report.newInApi.length
    if (total > 0) {
      log(`ℹ️   ${total} giocatori da aggiornare. Ri-lancia con --apply per scrivere su Supabase.`)
    } else {
      log('✅  DB già allineato con l\'API.')
    }
  }
}

main().catch(e => { console.error('\n❌ ', e.message); process.exit(1) })
