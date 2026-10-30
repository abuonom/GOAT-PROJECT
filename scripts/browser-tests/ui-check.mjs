// Controllo visivo rapido: dashboard, roster e GM Shop caricano senza errori per il GM di test.
import { chromium } from 'playwright'
const [base, email, password] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.goto(base + '/login', { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', password)
await page.getByRole('button', { name: /accedi/i }).last().click()
await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 })
const out = {}
for (const path of ['/dashboard', '/roster', '/gm-shop']) {
  await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(800)
  const txt = await page.textContent('body')
  out[path] = { hasGc: /GC/.test(txt), errorsSoFar: errors.length }
}
console.log(JSON.stringify({ out, pageErrors: errors }, null, 2))
await browser.close()
