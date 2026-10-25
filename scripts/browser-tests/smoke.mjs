// Smoke test nel browser: pagine pubbliche accessibili, pagine private rimandano al login.
// Uso: node scripts/browser-tests/smoke.mjs <baseUrl>
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:3000'
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))

async function visit(path) {
  const res = await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 })
  return { status: res?.status() ?? 0, url: page.url() }
}

// Pagine pubbliche
for (const [path, expect] of [
  ['/', 'GOAT LEAGUE'],
  ['/regolamento', 'REGOLAMENTO'],
  ['/roster-attuali', 'ROSTER ATTUALI'],
]) {
  const r = await visit(path)
  const text = await page.textContent('body')
  check(`pubblica ${path}`, r.status === 200 && text.includes(expect), `status ${r.status}`)
}

// Logo visibile
await visit('/')
const logo = await page.waitForFunction(() => {
  const img = document.querySelector('img[alt="GOAT League logo"]')
  return img && img.complete && img.naturalWidth > 0
}, null, { timeout: 15000 }).then(() => true).catch(() => false)
check('logo home caricato', logo)

// Pagine private: senza login devono andare al login
for (const path of ['/dashboard', '/roster', '/gm-shop', '/gm-credits']) {
  const r = await visit(path)
  check(`privata ${path} → login`, r.url.includes('/login'), `finale: ${r.url}`)
}

await browser.close()

for (const r of results) console.log(`${r.ok ? 'OK ' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`)
if (errors.length) console.log('Errori JS:', errors)
const failed = results.filter(r => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passati`)
process.exit(failed ? 1 : 0)
