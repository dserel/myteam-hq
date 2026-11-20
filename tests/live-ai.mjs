import { chromium } from 'playwright'
const BASE = 'https://federations-mvp.netlify.app'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const p = await (await b.newContext({ viewport: { width: 1360, height: 900 }, locale: 'el-GR' })).newPage()
await p.goto(BASE + '/login'); await p.waitForSelector('text=secretary@esna-demo.gr'); await p.click('text=secretary@esna-demo.gr')
await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 })
await p.goto(BASE + '/licenses?status=submitted'); await p.waitForSelector('table', { timeout: 20000 }); await p.waitForTimeout(1500)
const row = p.locator('tbody tr').filter({ hasText: 'Δεύτερη' }); console.log('rows:', await row.count())
await row.first().locator('a').first().click(); await p.waitForSelector('[data-action=ai]', { timeout: 20000 })
const t0 = Date.now(); await p.waitForSelector('[data-ai-check]', { timeout: 30000 })
await p.waitForTimeout(1000)
console.log('ai badges:', await p.locator('[data-ai-check]').evaluateAll(els => els.map(e => e.getAttribute('data-ai-check') + ': ' + e.getAttribute('title'))))
await p.screenshot({ path: '../reports/screens/live-ai-check.png', fullPage: true })
await b.close()
