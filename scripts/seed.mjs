/**
 * Seed script: popola Supabase con players + potentials
 * Uso: node scripts/seed.mjs
 * Richiede .env.local con NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NBA2K_API_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Carica .env.local manualmente
const envPath = resolve(process.cwd(), '.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
    .map(([k, ...v]) => [k, v.join('=')])
)

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
const SUPABASE_KEY = env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
const API_KEY = env['NBA2K_API_KEY']
const API_BASE = 'https://api.nba2kapi.com'
const RATINGS_BASE = 'https://www.2kratings.com'
const CONCURRENCY = 5

const SUPABASE_SERVICE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) { process.stdout.write(msg + '\n') }
function progress(msg) { process.stdout.write('\r' + msg.padEnd(60)) }

function extractFromHtml(html) {
  const ldMatches = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
  let potential = null
  let birthdate = null

  for (const match of ldMatches) {
    try {
      const json = JSON.parse(match[1])
      const top = Array.isArray(json) ? json : (json['@graph'] ? json['@graph'] : [json])
      for (const item of top) {
        const props = item.additionalProperty ?? []
        for (const prop of props) {
          if (prop.name === 'Potential Attribute') potential = prop.value ?? null
          if (prop.name === 'Birthday' || prop.propertyID === 'birthDate') birthdate = prop.value ?? null
        }
        if (item['@type'] === 'Person' && item.birthDate) birthdate = item.birthDate
      }
    } catch {}
  }

  // Fallback 1: "birthDate":"YYYY-MM-DD" anywhere in page source
  if (!birthdate) {
    const m = html.match(/"birthDate"\s*:\s*"(\d{4}-\d{2}-\d{2})"/)
    if (m) birthdate = m[1]
  }

  // Fallback 2: 2kratings format "Birthdate: September 15, 1999"
  if (!birthdate) {
    const m = html.match(/Birthdate[:\s]+([A-Za-z]+ \d{1,2},?\s*\d{4})/)
    if (m) birthdate = m[1].trim()
  }

  // Fallback 3: "Birthday" property value
  if (!birthdate) {
    const m = html.match(/Birthday[^<]*<[^>]+>([^<]+)/)
    if (m) birthdate = m[1].trim()
  }

  // Fallback 4: "born" near a 4-digit year in plain text
  if (!birthdate) {
    const m = html.match(/(?:born|Born)[^0-9]{0,30}(\w+ \d{1,2},?\s*\d{4})/)
    if (m) birthdate = m[1]
  }

  let age = null
  if (birthdate) {
    const birth = new Date(birthdate)
    if (!isNaN(birth.getTime())) {
      const now = new Date()
      age = now.getFullYear() - birth.getFullYear()
      if (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate())) age--
    }
  }

  return { potential, age }
}

async function chunk(arr, size, fn) {
  for (let i = 0; i < arr.length; i += size) {
    await fn(arr.slice(i, i + size), i)
  }
}

// ── Step 1: fetch players da nba2kapi ─────────────────────────────────────────

async function fetchAllPlayers() {
  log('▶ Fetching players from nba2kapi...')
  log(`  API_KEY: ${API_KEY ? API_KEY.substring(0, 10) + '...' : 'MISSING'}`)
  let res
  try {
    res = await fetch(`${API_BASE}/api/players/bulk?teamType=curr`, {
      headers: { 'X-API-Key': API_KEY },
    })
  } catch (e) {
    throw new Error(`fetch error: ${e.message} — cause: ${e.cause?.message ?? ''}`)
  }
  if (!res.ok) throw new Error(`nba2kapi error: ${res.status} ${await res.text()}`)
  const data = await res.json()
  if (!data.success) throw new Error(`nba2kapi: ${JSON.stringify(data.error)}`)
  log(`  ✓ ${data.data.length} giocatori ricevuti`)
  return data.data
}

async function upsertPlayers(players) {
  log('▶ Inserendo players in Supabase...')
  const rows = players.map(p => ({ slug: p.slug, data: p, updated_at: new Date().toISOString() }))

  await chunk(rows, 200, async (batch, i) => {
    const { error } = await supabase.from('players').upsert(batch)
    if (error) throw new Error(`Supabase players upsert error: ${error.message}`)
    progress(`  Inseriti ${Math.min(i + 200, rows.length)} / ${rows.length}`)
  })
  log(`\n  ✓ ${rows.length} giocatori salvati`)
}

// ── Step 2: scrape potentials da 2kratings ────────────────────────────────────

async function scrapeAndUpsertPotentials(players) {
  log('▶ Scraping potentials da 2kratings.com...')
  log(`  ${players.length} giocatori, concurrency ${CONCURRENCY}`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  let done = 0
  const results = []

  await chunk(players, CONCURRENCY, async (batch) => {
    const batchResults = await Promise.all(batch.map(async (player) => {
      const page = await context.newPage()
      try {
        await page.goto(`${RATINGS_BASE}/${player.slug}`, {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        })
        const html = await page.content()
        const { potential, age } = extractFromHtml(html)
        return { slug: player.slug, potential, age, updated_at: new Date().toISOString() }
      } catch {
        return { slug: player.slug, potential: null, age: null, updated_at: new Date().toISOString() }
      } finally {
        await page.close()
        done++
        progress(`  ${done} / ${players.length} (${Math.round(done / players.length * 100)}%)`)
      }
    }))
    results.push(...batchResults)

    // Upsert batch su Supabase mentre scrapiamo
    const { error } = await supabase.from('player_potentials').upsert(batchResults)
    if (error) log(`\n  ⚠ Supabase potentials error: ${error.message}`)
  })

  await browser.close()
  const withPotential = results.filter(r => r.potential).length
  log(`\n  ✓ ${results.length} potentials salvati (${withPotential} con valore)`)
}

// ── Step 3: scrape contracts da basketball-reference ─────────────────────────

async function scrapeAndUpsertContracts() {
  log('▶ Scraping contratti da basketball-reference.com...')

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()

  await page.goto('https://www.basketball-reference.com/contracts/players.html', {
    waitUntil: 'load',
    timeout: 30000,
  })
  await page.waitForSelector('#player-contracts', { timeout: 15000 })

  // Debug: stampa le prime colonne per verificare struttura
  const headerSample = await page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll('#player-contracts thead tr:last-child th'))
    return ths.slice(0, 8).map(th => th.textContent?.trim())
  })
  log(`  Colonne bbref: ${JSON.stringify(headerSample)}`)

  const contracts = await page.evaluate(() => {
    const table = document.querySelector('#player-contracts')
    if (!table) return []
    const headerCells = Array.from(table.querySelectorAll('thead tr:last-child th'))
    const headers = headerCells.map(th => th.textContent?.trim() ?? '')
    const ageColIdx = headers.findIndex(h => h === 'Age')
    const yearHeaders = headers.slice(ageColIdx + 1 > 0 ? ageColIdx + 1 : 3).filter(h => h.includes('-'))
    const salaryStartIdx = ageColIdx + 1 > 0 ? ageColIdx + 1 : 3
    const rows = Array.from(table.querySelectorAll('tbody tr')).filter(r => !r.classList.contains('thead'))
    return rows.map(row => {
      const cells = Array.from(row.querySelectorAll('td, th'))
      if (cells.length < 4) return null
      const name = cells[1]?.textContent?.trim() ?? ''
      const team = cells[2]?.textContent?.trim() ?? ''
      if (!name) return null
      const ageText = ageColIdx >= 0 ? cells[ageColIdx]?.textContent?.trim() : null
      const age = ageText ? parseInt(ageText, 10) : null
      const salaries = yearHeaders.map((year, i) => {
        const cell = cells[salaryStartIdx + i]
        const text = cell?.textContent?.trim() ?? ''
        const match = text.match(/\$([\d,]+)/)
        if (!match) return null
        const cls = cell?.className ?? ''
        const note = cls.includes('salary-pl') ? 'PO' : cls.includes('salary-tm') ? 'TO' : cls.includes('salary-qo') ? 'QO' : ''
        return { year, amount: parseInt(match[1].replace(/,/g, ''), 10), note }
      }).filter(s => s !== null)
      if (salaries.length === 0) return null
      return { name, team, age, salaries, years_remaining: salaries.length }
    }).filter(e => e !== null)
  })

  await browser.close()
  log(`  ✓ ${contracts.length} contratti trovati (pre-dedup)`)

  // Dedup per nome (tieni il primo)
  const seen = new Set()
  const unique = contracts.filter(c => {
    if (seen.has(c.name)) return false
    seen.add(c.name)
    return true
  })
  log(`  ✓ ${unique.length} contratti unici`)

  // Upsert su Supabase
  const rows = unique.map(c => ({ ...c, updated_at: new Date().toISOString() }))
  await chunk(rows, 200, async (batch) => {
    const { error } = await supabase.from('contracts').upsert(batch, { onConflict: 'name' })
    if (error) throw new Error(`Supabase contracts error: ${error.message}`)
  })
  log(`  ✓ ${rows.length} contratti salvati su Supabase`)

  // Aggiorna età in player_potentials dalla cross-reference nome → slug
  log('▶ Aggiornamento età in player_potentials...')
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

  const { data: allPlayers } = await supabase.from('players').select('slug, data')
  const slugByName = new Map()
  for (const row of (allPlayers ?? [])) {
    const name = row.data?.name ?? ''
    if (name) slugByName.set(norm(name), row.slug)
  }

  const ageRows = []
  for (const c of unique) {
    if (!c.age) continue
    const slug = slugByName.get(norm(c.name)) ??
      [...slugByName.entries()].find(([k]) => k.includes(norm(c.name)) || norm(c.name).includes(k))?.[1]
    if (slug) ageRows.push({ slug, age: c.age, updated_at: new Date().toISOString() })
  }

  await chunk(ageRows, 200, async (batch) => {
    const { error } = await supabase.from('player_potentials').upsert(batch, { onConflict: 'slug', ignoreDuplicates: false })
    if (error) log(`\n  ⚠ age upsert error: ${error.message}`)
  })
  log(`  ✓ ${ageRows.length} età aggiornate`)
}

// ── Step 4: scrape età da bbref stats ────────────────────────────────────────

async function scrapeAndUpsertAges() {
  log('▶ Scraping età da basketball-reference.com (per_game 2026-27)...')

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  })).newPage()

  await page.goto('https://www.basketball-reference.com/leagues/NBA_2026_per_game.html', {
    waitUntil: 'networkidle', timeout: 30000,
  })

const playerAges = await page.evaluate(() => {
    // Cerca la prima tabella con colonna Age
    const tables = Array.from(document.querySelectorAll('table[id]'))
    let table = tables.find(t => {
      const headers = Array.from(t.querySelectorAll('thead th')).map(th => th.textContent?.trim())
      return headers.includes('Age') && headers.includes('Player')
    })
    if (!table) table = tables[0]
    if (!table) return []
    if (!table) return []
    const headers = Array.from(table.querySelectorAll('thead tr th')).map(th => th.textContent?.trim())
    const ageIdx = headers.indexOf('Age')
    const rows = Array.from(table.querySelectorAll('tbody tr')).filter(r => !r.classList.contains('thead') && !r.classList.contains('partial_table'))
    const seen = new Set()
    const result = []
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('td, th'))
      const name = cells[1]?.textContent?.trim()
      const ageText = ageIdx >= 0 ? cells[ageIdx]?.textContent?.trim() : null
      if (!name || seen.has(name)) continue
      seen.add(name)
      const age = ageText ? parseInt(ageText, 10) : null
      if (age) result.push({ name, age })
    }
    return result
  })

  await browser.close()
  log(`  ✓ ${playerAges.length} giocatori con età trovati`)

  // Cross-reference nome → slug
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const { data: allPlayers } = await supabase.from('players').select('slug, data')
  const slugByName = new Map()
  for (const row of (allPlayers ?? [])) {
    const name = row.data?.name ?? ''
    if (name) slugByName.set(norm(name), row.slug)
  }

  const ageRows = []
  for (const { name, age } of playerAges) {
    const n = norm(name)
    const slug = slugByName.get(n) ??
      [...slugByName.entries()].find(([k]) => k.includes(n) || n.includes(k))?.[1]
    if (slug) ageRows.push({ slug, age, updated_at: new Date().toISOString() })
  }

  await chunk(ageRows, 200, async (batch) => {
    const { error } = await supabase.from('player_potentials').upsert(batch, { onConflict: 'slug', ignoreDuplicates: false })
    if (error) log(`\n  ⚠ age upsert error: ${error.message}`)
  })
  log(`  ✓ ${ageRows.length} età salvate in player_potentials`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log('\n🏀 GOAT LEAGUE COMPANION — Seed DB\n')

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !API_KEY) {
    log('❌ Mancano variabili in .env.local (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NBA2K_API_KEY)')
    process.exit(1)
  }

  const contractsOnly = process.argv.includes('--contracts-only')
  const agesOnly      = process.argv.includes('--ages-only')
  const diagSlug      = process.argv.find(a => a.startsWith('--diag='))?.split('=')[1]

  // Diagnostica: stampa HTML grezzo di un giocatore per debug estrazione età
  if (diagSlug) {
    log(`▶ Diagnostica HTML per: ${diagSlug}`)
    const browser = await (await import('playwright')).chromium.launch({ headless: true })
    const page = await (await browser.newContext()).newPage()
    await page.goto(`${RATINGS_BASE}/${diagSlug}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    const html = await page.content()
    await browser.close()
    const { potential, age } = extractFromHtml(html)
    log(`  potential: ${potential}`)
    log(`  age: ${age}`)
    // Stampa porzioni HTML rilevanti
    const bdMatches = [...html.matchAll(/birth|born|Born|Birthday|age.*?\d{2}/gi)].slice(0, 10)
    log(`  Occorrenze rilevanti nel HTML:`)
    for (const m of bdMatches) {
      log(`    [${m.index}] ...${html.slice(Math.max(0, m.index - 30), m.index + 80).replace(/\n/g, ' ')}...`)
    }
    return
  }

  if (agesOnly) {
    // Prima prova 2kratings (più preciso), poi bbref come fallback
    const players = await fetchAllPlayers()
    await scrapeAndUpsertPotentials(players)
    // Aggiorna con bbref chi non ha ancora l'età da 2kratings
    await scrapeAndUpsertAges()
    log('\n✅ Età aggiornate!\n')
    return
  }

  if (!contractsOnly) {
    const players = await fetchAllPlayers()
    await upsertPlayers(players)
    await scrapeAndUpsertPotentials(players)
  }

  await scrapeAndUpsertContracts()

  log('\n✅ Seed completato!\n')
}

main().catch(e => { log(`\n❌ ${e.message}`); process.exit(1) })
