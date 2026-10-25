// Login con account di test e stampa la risposta di /api/roster/full e lo stato della pagina dopo il caricamento.
import { chromium } from 'playwright'
const [base, email, password] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage()
let apiBody = null
page.on('response', async r => { if (r.url().includes('/api/roster/full')) { apiBody = { status: r.status(), body: (await r.text()).slice(0, 300) } } })
await page.goto(base + '/login', { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', password)
await page.getByRole('button', { name: /accedi/i }).last().click()
await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 })
await page.goto(base + '/roster', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2000)
console.log(JSON.stringify({ apiBody, pageText: (await page.textContent('body')).slice(0, 300) }, null, 2))
await browser.close()
