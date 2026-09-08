/**
 * Scrapo le draft class mancanti (2021, 2022) da 2kratings.com
 * e le salvo nella cache locale (.cache/draft_YEAR.json).
 * Uso: node scripts/scrape-missing-drafts.mjs
 */

import { chromium } from 'playwright'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const CACHE_DIR = resolve(process.cwd(), '.cache')
const YEARS = [2026]

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
})
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  viewport: { width: 1920, height: 1080 },
  locale: 'en-US',
})
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
})

for (const year of YEARS) {
  const cacheFile = resolve(CACHE_DIR, `draft_${year}.json`)
  if (existsSync(cacheFile)) { console.log(`⏭  ${year}: cache già esistente`); continue }

  console.log(`⏳ Scraping ${year}...`)
  const page = await context.newPage()
  try {
    await page.goto(`https://www.2kratings.com/lists/${year}-nba-draft-class`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    })
    await page.waitForTimeout(1500)

    const players = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('table tbody tr')).map(row => {
        const cells = Array.from(row.querySelectorAll('td'))
        if (cells.length < 5) return null

        const rank    = parseInt(cells[0].getAttribute('data-sort') ?? '0', 10)
        const nameEl  = cells[1].querySelector('.player-name')
        const name    = nameEl?.textContent?.trim() ?? ''
        const href    = cells[1].querySelector('a[href*="2kratings.com/"]')?.getAttribute('href') ?? ''
        const slug    = href.split('/').filter(Boolean).pop() ?? ''
        const subtext = cells[1].querySelector('.entry-subtext-font')?.textContent?.trim() ?? ''
        const parts   = subtext.split('|').map(s => s.trim())
        const positions = parts[0]?.split('/').map(s => s.trim().toUpperCase()).filter(Boolean) ?? []
        const height  = parts[1] ?? ''
        const pick    = cells[2]?.textContent?.trim() ?? ''
        const overall = parseInt(cells[4]?.getAttribute('data-sort') ?? '0', 10)
        const teamAbbr = cells[3]?.textContent?.trim() ?? ''

        return { rank, pick, name, slug, positions, height, teamAbbr, overall }
      }).filter(p => p !== null && p.name !== '' && p.overall > 0)
    })

    writeFileSync(cacheFile, JSON.stringify({ data: players, ts: Date.now() }))
    console.log(`✅ ${year}: ${players.length} giocatori salvati`)
  } catch (e) {
    console.error(`❌ ${year}:`, e.message)
  } finally {
    await page.close()
  }
}

await browser.close()
console.log('Done.')
