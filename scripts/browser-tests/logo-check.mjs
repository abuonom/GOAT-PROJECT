import { chromium } from 'playwright'
const base = process.argv[2]
const browser = await chromium.launch()
const page = await browser.newPage()
const res = await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 60000 })
const info = await page.evaluate(() => {
  const img = document.querySelector('img[alt="GOAT League logo"]')
  if (!img) return { found: false }
  return { found: true, complete: img.complete, naturalWidth: img.naturalWidth, src: img.currentSrc }
})
console.log(JSON.stringify({ status: res?.status(), url: page.url(), info }, null, 2))
await browser.close()
