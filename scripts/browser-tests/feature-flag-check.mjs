// Verifica l'interruttore Player List: spenta → 404 e voce nascosta; accesa → pagina e voce visibili.
import { chromium } from 'playwright'
const [base, email, password, sa_email, sa_password] = process.argv.slice(2)
async function login(page, e, p) {
  await page.goto(base + '/login', { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', e)
  await page.fill('input[type="password"]', p)
  await page.getByRole('button', { name: /accedi/i }).last().click()
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 })
}
const browser = await chromium.launch()
const gm = await browser.newPage()
await login(gm, email, password)
const gmPage = await gm.evaluate(async b => (await fetch(b + '/draft-builder')).status, base)
const gmFlag = await gm.evaluate(async () => (await (await fetch('/api/features/player_list')).json()).enabled)
const sa = await browser.newPage()
await login(sa, sa_email, sa_password)
const toggled = await sa.evaluate(async () => (await fetch('/api/features/player_list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }) })).status)
const gmAfter = await gm.evaluate(async b => (await fetch(b + '/draft-builder')).status, base)
await sa.evaluate(async () => fetch('/api/features/player_list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }) }))
const gmBack = await gm.evaluate(async b => (await fetch(b + '/draft-builder')).status, base)
console.log(JSON.stringify({ offFlag: gmFlag, pageWhenOff: gmPage, superToggle: toggled, pageWhenOn: gmAfter, pageOffAgain: gmBack }))
await browser.close()
