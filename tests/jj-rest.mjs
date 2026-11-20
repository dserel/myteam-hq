import { chromium } from 'playwright'
const BASE = 'http://localhost:5173'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const p = await (await b.newContext({ viewport: { width: 1360, height: 950 }, locale: 'el-GR' })).newPage()
const errs = []; p.on('pageerror', e => errs.push(e.message))
const ok = (n, c, x = '') => console.log(`${c ? '✅' : '❌'} ${n} ${x}`)

// 1. Δημόσια σελίδα φορέα + δημόσιο ταμπλό (χωρίς login)
await p.goto(BASE + '/f/eozz', { waitUntil: 'networkidle' }); await p.waitForTimeout(800)
ok('δημόσια σελίδα ομοσπονδίας', (await p.locator('body').innerText()).includes('Ne-Waza'))
await p.goto(BASE + '/f/eozz/c/panellinio-newaza-2026-27', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
const pub = await p.locator('body').innerText()
ok('δημόσιο ταμπλό', /τελικ/i.test(pub) && (await p.locator('[data-bracket]').count()) >= 6, `${await p.locator('[data-bracket]').count()} ταμπλό`)
ok('χωρίς άσχετη βαθμολογία σε νοκ-άουτ', !/ΒΑΘΜΟΣ|Βαθμός/i.test(pub))
await p.screenshot({ path: '../reports/screens/jj-5-public.png', fullPage: true })

// 2. Καρτέλα συλλόγου: μετάλλια
await p.goto(BASE + '/login'); await p.getByText('secretary@eozz-demo.gr').click()
await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 })
await p.goto(BASE + '/clubs', { waitUntil: 'networkidle' }); await p.waitForTimeout(800)
await p.getByRole('link', { name: /Δράμας/ }).first().click(); await p.waitForTimeout(1200)
const tabs = await p.locator('body').innerText()
ok('καρτέλα συλλόγου φορτώνει', tabs.includes('Δράμας'))
if (await p.getByRole('button', { name: 'Διοργανώσεις' }).count()) {
  await p.getByRole('button', { name: 'Διοργανώσεις' }).click(); await p.waitForTimeout(1000)
  const m = await p.locator('body').innerText()
  ok('μετάλλια συλλόγου από ταμπλό', m.includes('Ne-Waza'), m.match(/Ne-Waza[^\n]*/)?.[0] ?? '')
  await p.screenshot({ path: '../reports/screens/jj-6-club-medals.png', fullPage: true })
} else ok('tab διοργανώσεων', false, 'δεν βρέθηκε')

console.log('page errors:', errs)
await b.close()
