// Login con account di test, poi misura il caricamento del roster nel browser:
// tempo fino alla lista visibile e richieste fatte.
import { chromium } from 'playwright'
const [base, email, password] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage()
const reqs = []
page.on('request', r => { if (r.url().includes('/api/')) reqs.push(r.url().replace(base, '')) })
await page.goto(base + '/login', { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', password)
await page.getByRole('button', { name: /accedi/i }).last().click()
await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 })
reqs.length = 0
const t0 = Date.now()
await page.goto(base + '/roster', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.body.innerText.includes('Shai Gilgeous') || document.body.innerText.includes('NESSUN GIOCATORE'), null, { timeout: 60000 })
const ms = Date.now() - t0
const names = await page.evaluate(() => [...document.querySelectorAll('a,span,div')].map(e => e.textContent?.trim()).filter(t => t && t.length < 40).slice(0, 0))
const hasPlayers = await page.evaluate(() => document.body.innerText.includes('Shai Gilgeous'))
console.log(JSON.stringify({ msUntilRosterShown: ms, apiRequests: reqs, showsRosterHeader: hasPlayers }, null, 2))
await page.screenshot({ path: '.roster-shot.png', fullPage: true })
await browser.close()
