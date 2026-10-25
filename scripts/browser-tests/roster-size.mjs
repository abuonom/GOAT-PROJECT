// Misura peso e tempo di /api/roster/full per l'account di test (login reale, cookie di sessione).
import { chromium } from 'playwright'
const [base, email, password] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(base + '/login', { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', password)
await page.getByRole('button', { name: /accedi/i }).last().click()
await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 })
const res = await page.evaluate(async () => {
  const t0 = performance.now()
  const r = await fetch('/api/roster/full')
  const text = await r.text()
  return { status: r.status, bytes: text.length, ms: Math.round(performance.now() - t0) }
})
console.log(JSON.stringify(res))
await browser.close()
