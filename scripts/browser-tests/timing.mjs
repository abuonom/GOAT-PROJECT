// Misura il tempo di caricamento delle pagine pubbliche e dei dati pesanti, nel browser.
import { chromium } from 'playwright'
const base = process.argv[2]
const browser = await chromium.launch()
const page = await browser.newPage()
const out = []
for (const path of ['/', '/regolamento', '/roster-attuali', '/roster-attuali/' + 'x']) {
  const t0 = Date.now()
  const res = await page.goto(base + path, { waitUntil: 'load', timeout: 60000 })
  out.push({ path, status: res?.status(), ms: Date.now() - t0 })
}
// Richieste più pesanti della home
const sizes = []
page.on('response', async r => {
  try { const b = await r.body(); sizes.push({ url: r.url().replace(base, ''), kb: Math.round(b.length / 1024) }) } catch {}
})
await page.goto(base + '/roster-attuali', { waitUntil: 'networkidle', timeout: 60000 })
sizes.sort((a, b) => b.kb - a.kb)
console.log(JSON.stringify({ pages: out, heaviest: sizes.slice(0, 6) }, null, 2))
await browser.close()
