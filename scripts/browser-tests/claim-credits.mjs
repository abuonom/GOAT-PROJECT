// Il GM prende una franchigia libera dalla route reale e subito dopo legge il saldo GC.
import { chromium } from 'playwright'
const [base, email, password, franchiseId] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(base + '/login', { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', password)
await page.getByRole('button', { name: /accedi/i }).last().click()
await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 })
const claim = await page.evaluate(async id => (await fetch('/api/franchise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ franchiseId: id }) })).status, franchiseId)
const gc = await page.evaluate(async () => (await (await fetch('/api/gm-credits')).json()).balance)
console.log(JSON.stringify({ claimStatus: claim, balanceAfterClaim: gc }))
await browser.close()
