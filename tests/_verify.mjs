import { chromium } from 'playwright'
const BASE = 'https://federations-mvp.netlify.app'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const go = async (email, file) => {
  const p = await (await b.newContext({ viewport: { width: 1400, height: 900 }, locale: 'el-GR' })).newPage()
  await p.goto(BASE + '/login'); await p.getByText(email).click()
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30000 }); await p.waitForTimeout(4000)
  const t = await p.locator('body').innerText()
  console.log(`${email}: βαθμολογία στο dashboard = ${/Βαθμολογία →/.test(t)}`)
  await p.screenshot({ path: `../reports/screens/${file}.png`, fullPage: true })
  await p.context().close()
}
await go('admin@eozz-demo.gr', 'final-dash-jj')       // νοκ-άουτ → ΔΕΝ πρέπει να δείχνει βαθμολογία
await go('admin@esna-demo.gr', 'final-dash-basket')   // πρωτάθλημα → ΠΡΕΠΕΙ να δείχνει βαθμολογία
await b.close()
