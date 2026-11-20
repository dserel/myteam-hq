import { chromium } from 'playwright'
const BASE = 'http://localhost:5173'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width: 1360, height: 950 }, locale: 'el-GR' })
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(e.message))
const ok = (n, c, x = '') => console.log(`${c ? '✅' : '❌'} ${n} ${x}`)

await p.goto(BASE + '/login'); await p.getByText('secretary@eozz-demo.gr').click()
await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 })
await p.waitForTimeout(1200)
ok('login ως γραμματεία ΕΟΖΖ', true)

await p.goto(BASE + '/competitions', { waitUntil: 'networkidle' })
await p.getByText('Πανελλήνιο Πρωτάθλημα Ne-Waza 2026-27').first().click()
await p.waitForSelector('[data-combat-cats]', { timeout: 20000 }); await p.waitForTimeout(900)
const cats = await p.locator('[data-combat-cat]').count()
ok('οθόνη μαχητικών: κατηγορίες βάρους', cats === 6, `${cats} κατηγορίες`)
await p.screenshot({ path: '../reports/screens/jj-1-categories.png', fullPage: true })

// Κατηγορία με τον εκτός βάρους
await p.getByRole('button', { name: /Ανδρών -77kg/ }).click(); await p.waitForTimeout(900)
const body = await p.locator('body').innerText()
ok('ζύγιση + έλεγχος βάρους', body.includes('Εκτός ορίων βάρους'), body.match(/Εκτός ορίων βάρους[^\n]*/)?.[0] ?? '')
ok('ζώνη από το δελτίο', /Μπλε|Μωβ|Καφέ|Μαύρη/.test(body))
await p.screenshot({ path: '../reports/screens/jj-2-weighin.png', fullPage: true })

// Ταμπλό ολοκληρωμένης κατηγορίας + μετάλλια
await p.getByRole('button', { name: /Ανδρών -69kg/ }).click(); await p.waitForTimeout(700)
await p.getByRole('button', { name: 'Ταμπλό' }).click(); await p.waitForSelector('[data-bracket]', { timeout: 10000 })
ok('ταμπλό εμφανίζεται', (await p.locator('[data-bracket]').count()) === 1)
await p.screenshot({ path: '../reports/screens/jj-3-bracket.png', fullPage: true })
await p.getByRole('button', { name: 'Μετάλλια' }).click(); await p.waitForTimeout(600)
const places = await p.locator('[data-place]').count()
ok('μετάλλια 1-2-3-3', places === 4, `${places} θέσεις`)

// Ζωντανή κλήρωση στην άκληρη κατηγορία
await p.getByRole('button', { name: /Νεανίδων -52kg/ }).click(); await p.waitForTimeout(800)
const drawBtn = p.locator('[data-action=draw]')
ok('κουμπί κλήρωσης διαθέσιμο', await drawBtn.isVisible())
await drawBtn.click(); await p.waitForSelector('[data-bracket]', { timeout: 15000 })
ok('ζωντανή κλήρωση παράγει ταμπλό', (await p.locator('[data-bracket] [data-match], [data-bracket]').count()) > 0)
await p.screenshot({ path: '../reports/screens/jj-4-live-draw.png', fullPage: true })

console.log('page errors:', errs)
await b.close()
