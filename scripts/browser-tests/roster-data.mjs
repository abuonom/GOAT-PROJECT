// Risposta reale di /api/roster/full per il GM di test (quella che usa la pagina roster).
import { chromium } from 'playwright'
const [base, email, password] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(base + '/login', { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', password)
await page.getByRole('button', { name: /accedi/i }).last().click()
await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 })
const r = await page.evaluate(async () => { const x = await fetch('/api/roster/full'); const j = await x.json(); return { status: x.status, count: (j.memberships ?? []).length, slugs: (j.memberships ?? []).map(m => m.player_slug) } })
console.log(JSON.stringify(r))
await browser.close()
