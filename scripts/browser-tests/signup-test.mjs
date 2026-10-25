// Registra un account di prova dalla pagina /login (flusso reale). Mail fittizia, nessun controllo.
import { chromium } from 'playwright'
const base = process.argv[2]
const email = process.argv[3]
const password = process.argv[4]
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(base + '/login', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Registrati' }).click()
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', password)
await page.getByRole('button', { name: /registrati/i }).last().click()
await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 }).catch(() => {})
console.log(JSON.stringify({ url: page.url() }))
await browser.close()
