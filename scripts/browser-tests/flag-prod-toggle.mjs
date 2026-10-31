// Superadmin: accende la Player List, verifica che un GM la veda, poi la rispegne.
import { chromium } from 'playwright'
const [base, saEmail, saPassword, gmEmail, gmPassword] = process.argv.slice(2)
const browser = await chromium.launch()
async function login(e, p) {
  const pg = await browser.newPage()
  await pg.goto(base + '/login', { waitUntil: 'networkidle', timeout: 90000 })
  await pg.fill('input[type="email"]', e)
  await pg.fill('input[type="password"]', p)
  await pg.getByRole('button', { name: /accedi/i }).last().click()
  await pg.waitForURL(u => !u.toString().includes('/login'), { timeout: 60000 })
  return pg
}
const sa = await login(saEmail, saPassword)
const set = enabled => sa.evaluate(async en => (await fetch('/api/features/player_list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: en }) })).status, enabled)
const on = await set(true)
const gm = await login(gmEmail, gmPassword)
const gmStatusOn = await gm.evaluate(async b => (await fetch(b + '/draft-builder', { redirect: 'manual' })).status, base)
const gmDashOn = await gm.goto(base + '/dashboard', { waitUntil: 'networkidle', timeout: 90000 }).then(() => gm.textContent('body')).then(t => t.includes('Player List'))
const off = await set(false)
const gmStatusOff = await gm.evaluate(async b => (await fetch(b + '/draft-builder', { redirect: 'manual' })).status, base)
console.log(JSON.stringify({ setOn: on, gmPageWhenOn: gmStatusOn, gmDashWhenOn: gmDashOn, setOff: off, gmPageWhenOff: gmStatusOff }))
await browser.close()
