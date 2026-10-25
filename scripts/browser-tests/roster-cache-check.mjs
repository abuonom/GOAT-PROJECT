// Verifica che la cache del roster si invalidi: legge il roster, rimuove un giocatore
// con la route reale (come farebbe il GM), rilegge e confronta il numero di giocatori.
import { chromium } from 'playwright'
const [base, email, password] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(base + '/login', { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', password)
await page.getByRole('button', { name: /accedi/i }).last().click()
await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 })
const read = () => page.evaluate(async () => (await (await fetch('/api/roster/full')).json()).memberships.length)
const before = await read()
const slug = await page.evaluate(async () => (await (await fetch('/api/roster/full')).json()).memberships[0].player_slug)
const rm = await page.evaluate(async s => (await fetch('/api/roster', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerSlug: s }) })).status, slug)
const after = await read()
console.log(JSON.stringify({ before, removed: slug, deleteStatus: rm, afterRead: after, invalidated: after === before - 1 }))
await browser.close()
