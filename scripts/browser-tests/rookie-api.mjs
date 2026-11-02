// Chiama la route del rookie come il form e stampa la risposta esatta del server.
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
  const res = await fetch('/api/roster/rookie', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test Rookie', overall: 70, draftYear: 2027, positions: ['SF'] }) })
  return { status: res.status, body: await res.text() }
})
console.log(JSON.stringify(r))
await browser.close()
