import { chromium } from 'playwright'
const BASE = 'https://federations-mvp.netlify.app'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
for (const [email, expect] of [['admin@eozz-demo.gr', false], ['admin@esna-demo.gr', true], ['admin@okd-demo.gr', null]]) {
  const p = await (await b.newContext({ viewport: { width: 1400, height: 900 }, locale: 'el-GR' })).newPage()
  await p.goto(BASE + '/login'); await p.getByText(email).click()
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30000 }); await p.waitForTimeout(3500)
  const t = await p.locator('body').innerText()
  const has = /Βαθμολογία →/.test(t)
  console.log(`${expect === null ? '·' : has === expect ? '✅' : '❌'} ${email}: βαθμολογία=${has}${expect === null ? '' : ` (αναμενόμενο ${expect})`}`)
  await p.context().close()
}
await b.close()
