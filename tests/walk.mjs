// Smoke walk-through: log in as several demo roles, open every page, capture console errors + screenshots.
import { chromium } from 'playwright'
const BASE = 'http://localhost:5173'
const OUT = '../reports/screens'
const users = {
  'admin@esna-demo.gr': ['/', '/clubs', '/sections', '/persons', '/licenses', '/licenses?status=all', '/health-cards', '/finance', '/finance/price-list', '/competitions', '/import', '/members', '/settings'],
  'admin@okd-demo.gr': ['/', '/licenses', '/finance', '/settings'],
  'treasurer@esna-demo.gr': ['/', '/finance'],
  'club@glyfada-demo.gr': ['/', '/clubs', '/persons', '/licenses', '/finance'],
  'viewer@esba-demo.gr': ['/', '/licenses'],
}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const errors = []
for (const [email, paths] of Object.entries(users)) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'el-GR' })
  const page = await ctx.newPage()
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${email}] ${page.url()} :: ${m.text().slice(0, 200)}`) })
  page.on('pageerror', e => errors.push(`[${email}] ${page.url()} :: PAGEERROR ${e.message.slice(0, 200)}`))
  await page.goto(BASE + '/login')
  await page.getByText(email).click()
  await page.waitForURL(BASE + '/')
  for (const p of paths) {
    await page.goto(BASE + p, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)
    const name = `${email.split('@')[0]}-${email.split('@')[1].split('-')[0]}${p.replace(/[\/?=]/g, '_') || '_home'}`
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
    const bodyText = await page.locator('body').innerText()
    if (/Κάτι πήγε στραβά|Something went wrong|permission denied/i.test(bodyText)) errors.push(`[${email}] ${p} :: error text on page`)
  }
  await ctx.close()
}
// public pages (anon)
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
page.on('pageerror', e => errors.push(`[anon] ${page.url()} :: PAGEERROR ${e.message.slice(0, 200)}`))
for (const p of ['/f/esna', '/f/esna/c/paidon-2026-27', '/v/nope']) { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await page.screenshot({ path: `${OUT}/anon${p.replace(/[\/?=]/g, '_')}.png`, fullPage: true }) }
await browser.close()
console.log(errors.length ? errors.join('\n') : 'NO ERRORS')
