// Flusso GM Shop con account di prova: vede il roster, sceglie giocatore e attributo, prova l'acquisto.
import { chromium } from 'playwright'
const [base, email, password] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage()
const apiLog = []
page.on('response', r => { if (r.url().includes('/api/gm-roster')) apiLog.push({ url: r.url().replace(base, ''), status: r.status() }) })

await page.goto(base + '/login', { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', password)
await page.getByRole('button', { name: /accedi/i }).last().click()
await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 })

await page.goto(base + '/gm-shop', { waitUntil: 'networkidle', timeout: 90000 })
const body = await page.textContent('body')
const players = ['Gilgeous', 'Jokić', 'Brunson', 'Dončić', 'Edwards']
const seen = players.filter(p => body.includes(p))
console.log(JSON.stringify({ url: page.url(), balanceShown: body.match(/(\d+)\s*GC/)?.[1] ?? null, playersSeen: seen, apiLog }, null, 2))

// Prova la scelta: primo giocatore → attributo (Tiro) → primo attributo disponibile
const firstPlayer = page.locator('button', { hasText: /Gilgeous|Jokić|Brunson|Dončić|Edwards/ }).first()
if (await firstPlayer.count()) {
  await firstPlayer.click()
  await page.waitForTimeout(500)
  const attr = page.locator('button:not([disabled])', { hasText: 'base' }).first()
  if (await attr.count()) { await attr.click(); await page.waitForTimeout(300) }
  const cont = page.getByRole('button', { name: 'Continua' })
  if (await cont.count()) { await cont.click(); await page.waitForTimeout(300) }
  const confirm = page.getByRole('button', { name: 'Conferma upgrade' })
  if (await confirm.count()) {
    await confirm.click()
    await page.waitForTimeout(1200)
  }
  const toast = await page.locator('div', { hasText: /GC|insufficienti|Errore|confermato/ }).last().textContent().catch(() => null)
  console.log(JSON.stringify({ afterConfirm: true, toast: toast?.slice(0, 160) ?? null, apiLog: apiLog.slice(-3) }, null, 2))
} else {
  console.log('Nessun giocatore selezionabile nel GM Shop')
}
await browser.close()
