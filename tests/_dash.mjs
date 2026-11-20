import { chromium } from 'playwright'
const BASE = 'https://federations-mvp.netlify.app'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const p = await (await b.newContext({ viewport: { width: 1400, height: 900 }, locale: 'el-GR' })).newPage()
const bad = []
p.on('response', async r => { if (r.url().includes('supabase.co') && r.status() >= 400) bad.push(`${r.status()} ${r.url().slice(0, 150)}`) })
p.on('pageerror', e => bad.push('JS: ' + e.message))
await p.goto(BASE + '/login'); await p.getByText('admin@eozz-demo.gr').click()
await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30000 })
for (const s of [3, 6, 10]) {
  await p.waitForTimeout(s === 3 ? 3000 : 3000)
  const txt = await p.locator('body').innerText()
  console.log(`@${s}s spinner=${txt.includes('Φόρτωση')} stats=${/\d+\s*\n?\s*(Σωματεία|ΣΩΜΑΤΕΙΑ)/i.test(txt)}`)
}
console.log('errors:', bad.length ? bad : 'none')
await p.screenshot({ path: '/tmp/dash.png', fullPage: true })
await b.close()
