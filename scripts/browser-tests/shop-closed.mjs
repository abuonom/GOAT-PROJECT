// Con lo shop chiuso: il server deve rifiutare l'acquisto, senza addebitare nulla.
import { chromium } from 'playwright'
const [base, email, password] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(base + '/login', { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', password)
await page.getByRole('button', { name: /accedi/i }).last().click()
await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 })
const r = await page.evaluate(async () => {
  const res = await fetch('/api/gm-roster', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'upgrade', playerSlug: 'shai-gilgeous-alexander', attributeKey: 'freeThrow', fromValue: 70, toValue: 71 }) })
  return { status: res.status, body: await res.text() }
})
const state = await page.evaluate(async () => (await (await fetch('/api/shop/state')).json()))
console.log(JSON.stringify({ purchase: r, shopState: state }))
await browser.close()
