// Accesso con account di prova, poi misura caricamento di dashboard, GM Shop, draft-builder e roster.
import { chromium } from 'playwright'
const [base, email, password] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage()
const heavy = []
page.on('response', async r => {
  const ct = r.headers()['content-type'] ?? ''
  if (!ct.includes('json') && !ct.includes('javascript')) return
  try { const b = await r.body(); heavy.push({ url: r.url().replace(base, ''), kb: Math.round(b.length / 1024) }) } catch {}
})
await page.goto(base + '/login', { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', password)
await page.getByRole('button', { name: /accedi/i }).last().click()
await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 })

const timings = {}
for (const path of ['/dashboard', '/roster', '/gm-shop', '/gm-credits', '/draft-builder']) {
  heavy.length = 0
  const t0 = Date.now()
  await page.goto(base + path, { waitUntil: 'networkidle', timeout: 90000 })
  const ms = Date.now() - t0
  const payload = heavy.reduce((s, r) => s + r.kb, 0)
  timings[path] = { ms, payloadKb: payload, heaviest: heavy.sort((a, b) => b.kb - a.kb).slice(0, 3) }
}
console.log(JSON.stringify(timings, null, 2))
await browser.close()
