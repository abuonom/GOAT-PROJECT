/**
 * resync-badges.mjs — aggiorna i badge scrappando 2kratings.com
 *
 * Uso:
 *   node scripts/resync-badges.mjs --diag=jayson-tatum   # dump HTML badge per debug
 *   node scripts/resync-badges.mjs --slug=jayson-tatum   # dry-run su un giocatore
 *   node scripts/resync-badges.mjs                        # dry-run su tutti
 *   node scripts/resync-badges.mjs --apply                # aggiorna Supabase
 *   node scripts/resync-badges.mjs --slug=jayson-tatum --apply
 */

import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Env ───────────────────────────────────────────────────────────────────────

const envPath = resolve(process.cwd(), '.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const SUPABASE_URL         = env['NEXT_PUBLIC_SUPABASE_URL']
const SUPABASE_SERVICE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']
const RATINGS_BASE         = 'https://www.2kratings.com'
const CONCURRENCY          = 5

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  Mancano variabili in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const APPLY  = process.argv.includes('--apply')
const TARGET = process.argv.find(a => a.startsWith('--slug='))?.split('=')[1] ?? null
const DIAG   = process.argv.find(a => a.startsWith('--diag='))?.split('=')[1] ?? null

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg)      { process.stdout.write(msg + '\n') }
function progress(msg) { process.stdout.write('\r' + msg.padEnd(70)) }

async function chunk(arr, size, fn) {
  for (let i = 0; i < arr.length; i += size) await fn(arr.slice(i, i + size), i)
}

async function makeBrowser() {
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
  return { browser, context }
}

// ── Scraping badge da 2kratings ───────────────────────────────────────────────

// Mappa dei tier label presenti su 2kratings → nome normalizzato
const TIER_LABELS = {
  'legend':       'Legend',
  'legendary':    'Legend',
  'hall of fame': 'Hall of Fame',
  'hof':          'Hall of Fame',
  'gold':         'Gold',
  'silver':       'Silver',
  'bronze':       'Bronze',
}

function normalizeTier(raw) {
  return TIER_LABELS[raw.toLowerCase().trim()] ?? raw
}

// Mappa tier dall'URL immagine 2kratings → nome normalizzato
const IMG_TIER_MAP = {
  'legendary': 'Legend',
  'hof':       'Hall of Fame',
  'gold':      'Gold',
  'silver':    'Silver',
  'bronze':    'Bronze',
}

async function scrapeBadges(page, slug) {
  try {
    await page.goto(`${RATINGS_BASE}/${slug}`, {
      waitUntil: 'domcontentloaded',
      timeout: 25000,
    })

    // Aspetta il tab badge o i badge-card
    await page.waitForSelector('.badge-card, #nav-badges', { timeout: 8000 }).catch(() => {})

    // Lazy images: forza il caricamento scorrendola pagina per popolare data-src
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {})
    await page.waitForTimeout(500)

    const badges = await page.evaluate((IMG_TIER_MAP) => {
      const result = []

      // Seleziona tutte le card badge dentro il tab "All Badges"
      // Struttura: .row.no-gutters.badge-card
      //   img[data-src=".../{name}-{tier}-badge.png"]
      //   h4.text-white → nome badge
      const cards = document.querySelectorAll('.row.no-gutters.badge-card, .badge-card')

      for (const card of cards) {
        const img  = card.querySelector('img[data-src], img[src]')
        const h4   = card.querySelector('h4')
        if (!img || !h4) continue

        const name = h4.textContent?.trim()
        if (!name || name.length < 2 || name.length > 80) continue

        // Estrai tier dall'URL: "arc-cadence-gold-badge.png" → "gold"
        const src = img.getAttribute('data-src') ?? img.getAttribute('src') ?? ''
        const match = src.match(/-(legendary|hof|gold|silver|bronze)-badge\.png/i)
        if (!match) continue

        const tier = IMG_TIER_MAP[match[1].toLowerCase()]
        if (!tier) continue

        result.push({ tier, name })
      }

      // Dedup per sicurezza
      const seen = new Set()
      return result.filter(b => {
        const key = `${b.tier}|${b.name}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }, IMG_TIER_MAP)

    return badges
  } catch {
    return null
  }
}

// ── Diagnostica ───────────────────────────────────────────────────────────────

async function runDiag(slug) {
  log(`\n▶  Diagnostica HTML badge per: ${slug}`)
  const { browser, context } = await makeBrowser()
  const page = await context.newPage()

  await page.goto(`${RATINGS_BASE}/${slug}`, { waitUntil: 'domcontentloaded', timeout: 25000 })
  await page.waitForTimeout(2000)

  // Dump sezione badge
  const badgeHtml = await page.evaluate(() => {
    const keywords = ['badge', 'hof', 'gold', 'silver', 'bronze', 'legend']
    const candidates = []
    for (const el of document.querySelectorAll('*')) {
      const cls = (typeof el.className === 'string' ? el.className : '').toLowerCase()
      const id  = (el.id ?? '').toLowerCase()
      if (keywords.some(k => cls.includes(k) || id.includes(k))) {
        candidates.push({
          tag: el.tagName,
          cls: el.className,
          id: el.id,
          text: el.textContent?.slice(0, 200).trim(),
          html: el.outerHTML?.slice(0, 500),
        })
      }
    }
    return candidates.slice(0, 30)
  })

  log('\n── Elementi con classe/id "badge/hof/gold/silver/bronze/legend" ──')
  for (const el of badgeHtml) {
    log(`\n  <${el.tag} class="${el.cls}" id="${el.id}">`)
    log(`  TEXT: ${el.text}`)
    log(`  HTML: ${el.html}`)
  }

  // Prova anche il parser
  const badges = await scrapeBadges(page, slug)
  log(`\n── Parser badge trovati: ${badges?.length ?? 0} ──`)
  if (badges?.length) badges.forEach(b => log(`  ${b.tier.padEnd(14)} | ${b.name}`))

  await browser.close()
}

// ── Fetch Supabase ────────────────────────────────────────────────────────────

async function fetchFromSupabase(targetSlug) {
  log('▶  Lettura giocatori da Supabase...')
  let query = supabase.from('players').select('slug, data')
  if (targetSlug) query = query.eq('slug', targetSlug)

  const all = []
  let from = 0
  while (true) {
    const { data, error } = await query.range(from, from + 999)
    if (error) throw new Error(`Supabase: ${error.message}`)
    all.push(...(data ?? []))
    if (!data || data.length < 1000) break
    from += 1000
  }
  log(`   ✓ ${all.length} giocatori`)
  return all
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (DIAG) { await runDiag(DIAG); return }

  log('\n🏀  RESYNC BADGES — 2kratings.com → Supabase')
  log(APPLY ? '   Modalità: APPLY' : '   Modalità: DRY-RUN (aggiungi --apply per scrivere)')
  if (TARGET) log(`   Target: ${TARGET}`)
  log('')

  const dbRows = await fetchFromSupabase(TARGET)
  const { browser, context } = await makeBrowser()

  let done = 0
  const changed = []
  const failed  = []

  await chunk(dbRows, CONCURRENCY, async (batch) => {
    await Promise.all(batch.map(async (row) => {
      const page = await context.newPage()
      try {
        const scraped = await scrapeBadges(page, row.slug)
        done++
        progress(`   ${done}/${dbRows.length} — ${row.slug}`)

        if (!scraped || scraped.length === 0) {
          failed.push({ slug: row.slug, reason: 'nessun badge trovato' })
          return
        }

        const oldBadges = (row.data?.badges?.list ?? []).filter(b => !b.manual)   // i cartellini manuali non vengono da 2kratings
        const oldCount  = oldBadges.length
        const newCount  = scraped.length

        // Confronto per tier
        const oldByTier = {}
        for (const b of oldBadges) oldByTier[b.tier] = (oldByTier[b.tier] ?? 0) + 1
        const newByTier = {}
        for (const b of scraped) newByTier[b.tier] = (newByTier[b.tier] ?? 0) + 1

        const tierChanged = JSON.stringify(oldByTier) !== JSON.stringify(newByTier)

        if (newCount !== oldCount || tierChanged) {
          changed.push({ slug: row.slug, name: row.data?.name, oldCount, newCount, oldByTier, newByTier, scraped })
        }
      } finally {
        await page.close()
      }
    }))
  })

  await browser.close()
  log('')

  // Report
  log('\n═══════════════════════════════════════════════════════════════════')
  log('📊  REPORT BADGE')
  log('═══════════════════════════════════════════════════════════════════')
  log(`   Invariati  : ${dbRows.length - changed.length - failed.length}`)
  log(`   Modificati : ${changed.length}`)
  log(`   Falliti    : ${failed.length}`)
  log('')

  if (changed.length > 0) {
    log('✏️   Giocatori con badge diversi:')
    for (const c of changed) {
      const delta = c.newCount - c.oldCount
      const sign  = delta >= 0 ? '+' : ''
      log(`  ${c.name ?? c.slug} — ${c.oldCount} → ${c.newCount} (${sign}${delta})`)
      log(`    OLD: ${JSON.stringify(c.oldByTier)}`)
      log(`    NEW: ${JSON.stringify(c.newByTier)}`)
    }
    log('')
  }

  if (failed.length > 0) {
    log('⚠️   Falliti (badge non trovati — potrebbero avere slug diverso su 2kratings):')
    failed.slice(0, 20).forEach(f => log(`   ${f.slug}: ${f.reason}`))
    if (failed.length > 20) log(`   ... e altri ${failed.length - 20}`)
    log('')
  }

  if (APPLY && changed.length > 0) {
    log(`▶  Aggiornamento di ${changed.length} giocatori su Supabase...`)
    let saved = 0
    await chunk(changed, 50, async (batch) => {
      const rows = batch.map(c => {
        const existing = dbRows.find(r => r.slug === c.slug)
        // Cartellini aggiunti a mano dall'admin: restano, tranne se 2kratings ora li ha già
        const scrapedNames = new Set(c.scraped.map(b => b.name.toLowerCase()))
        const manual = (existing.data?.badges?.list ?? [])
          .filter(b => b.manual && !scrapedNames.has(b.name.toLowerCase()))
        const list = [...c.scraped, ...manual]
        const newData = {
          ...existing.data,
          badges: {
            total: list.length,
            list,
          },
        }
        return { slug: c.slug, data: newData, updated_at: new Date().toISOString() }
      })
      const { error } = await supabase.from('players').upsert(rows)
      if (error) throw new Error(`Supabase upsert: ${error.message}`)
      saved += rows.length
      progress(`   ${saved}/${changed.length}`)
    })
    log(`\n✅  ${changed.length} giocatori aggiornati.`)
  } else if (!APPLY && changed.length > 0) {
    log(`ℹ️   Ri-lancia con --apply per aggiornare ${changed.length} giocatori su Supabase.`)
  } else if (changed.length === 0) {
    log('✅  Badge già allineati.')
  }
}

main().catch(e => { console.error('\n❌ ', e.message); process.exit(1) })
