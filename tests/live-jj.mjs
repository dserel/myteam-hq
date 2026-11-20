// Πέρασμα του σεναρίου παρουσίασης Jiu Jitsu στο LIVE περιβάλλον.
import { chromium } from 'playwright'
import fs from 'fs'
const BASE = process.env.BASE ?? 'https://federations-mvp.netlify.app'
const DOCS = '/tmp/claude-0/-home-claude/0fa18267-fabd-5dc0-a28f-5592b2b3b180/scratchpad/docs'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const errs = []; const res = []
const ok = (n, c, x = '') => { res.push(c); console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`) }
const S = n => `../reports/screens/live-jj-${n}.png`

async function login(email) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, locale: 'el-GR' })
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message))
  await p.goto(BASE + '/login'); await p.getByText(email).click()
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30000 })
  await p.waitForTimeout(1500)
  return { ctx, p }
}

// ── 1. Η ομοσπονδία βλέπει το μητρώο της
const { ctx: c1, p } = await login('admin@eozz-demo.gr')
const dash = await p.locator('body').innerText()
ok('1. Επισκόπηση ΕΟΖΖ', dash.includes('ΕΟΖΖ') || dash.includes('Ζίου'))
await p.screenshot({ path: S('1-dashboard') })

await p.goto(BASE + '/clubs', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
const nclubs = await p.locator('tbody tr').count()
ok('2. Σωματεία', nclubs === 8, `${nclubs} σωματεία`)

await p.goto(BASE + '/persons', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
const npers = (await p.locator('h1 + p').innerText()).match(/\d+/g)?.pop()
ok('3. Μητρώο αθλητών', Number(npers) > 80, `${npers} πρόσωπα`)
await p.screenshot({ path: S('2-persons') })

// ── 2. Δελτίο με ζώνη
await p.locator('tbody tr a').first().click(); await p.waitForTimeout(1800)
ok('4. Καρτέλα αθλητή ανοίγει', (await p.locator('body').innerText()).includes('Δελτί'))
await p.screenshot({ path: S('3-athlete') })

// ── 3. Ουρά δελτίων
await p.goto(BASE + '/licenses?status=queue', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
const queue = await p.locator('tbody tr').count()
ok('5. Ουρά δελτίων προς έλεγχο', queue > 0, `${queue} αιτήσεις`)
await p.screenshot({ path: S('4-queue') })

// ── 4. Διοργάνωση: κατηγορίες βάρους, ζύγιση, ταμπλό, μετάλλια
await p.goto(BASE + '/competitions', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
await p.getByText('Πανελλήνιο Πρωτάθλημα Ne-Waza').first().click()
await p.waitForSelector('[data-combat-cats]', { timeout: 25000 }); await p.waitForTimeout(1200)
ok('6. Κατηγορίες βάρους', (await p.locator('[data-combat-cat]').count()) === 6)

await p.getByRole('button', { name: /Ανδρών -77kg/ }).click(); await p.waitForTimeout(1200)
const w = await p.locator('body').innerText()
ok('7. Ζύγιση + απόρριψη εκτός βάρους', w.includes('Εκτός ορίων βάρους'), w.match(/Εκτός ορίων βάρους[^\n]*/)?.[0])
ok('8. Ζώνη από το δελτίο', /Μαύρη|Καφέ|Μωβ|Μπλε/.test(w))
await p.screenshot({ path: S('5-weighin'), fullPage: true })

await p.getByRole('button', { name: /Ανδρών -69kg/ }).click(); await p.waitForTimeout(900)
await p.getByRole('button', { name: 'Ταμπλό' }).click(); await p.waitForSelector('[data-bracket]', { timeout: 15000 })
ok('9. Ταμπλό κατηγορίας', true)
await p.screenshot({ path: S('6-bracket'), fullPage: true })
await p.getByRole('button', { name: 'Μετάλλια' }).click(); await p.waitForTimeout(900)
ok('10. Μετάλλια 1-2-3-3', (await p.locator('[data-place]').count()) === 4)

// ζωντανή κλήρωση
await p.getByRole('button', { name: /Νεανίδων -52kg/ }).click(); await p.waitForTimeout(1000)
const drawVisible = await p.locator('[data-action=draw]').isVisible().catch(() => false)
ok('11. Ζωντανή κλήρωση διαθέσιμη', drawVisible)
await p.screenshot({ path: S('7-ready-to-draw'), fullPage: true })

// ── 5. Οικονομικά
await p.goto(BASE + '/finance', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
ok('12. Οικονομικά φορέα', (await p.locator('table').count()) > 0)
await p.screenshot({ path: S('8-finance') })
await c1.close()

// ── 6. Η διαδρομή του γονέα (έφορος → σύνδεσμος → wizard → παρακολούθηση)
const { ctx: c2, p: cp } = await login('club@jj-athens-demo.gr')
await cp.goto(BASE + '/sections', { waitUntil: 'networkidle' }); await cp.waitForTimeout(1200)
await cp.getByRole('link', { name: 'Αγωνιστικό Τμήμα', exact: true }).first().click()
await cp.waitForSelector('[data-member]', { timeout: 20000 }); await cp.waitForTimeout(800)
ok('13. Τμήμα με «τι λείπει»', (await cp.getByText(/Σε ισχύ|Χωρίς δελτίο|Κάρτα λήγει|Πρόχειρο/).count()) > 0)
await cp.screenshot({ path: S('9-section'), fullPage: true })

await cp.getByRole('button', { name: 'Πρόσκληση για δελτίο' }).click()
await cp.locator('[role=dialog]').getByRole('button', { name: 'Ανοιχτός σύνδεσμος τμήματος' }).click()
await cp.waitForSelector('[data-new-link]', { timeout: 20000 })
const applyUrl = await cp.locator('[data-new-link] a').first().getAttribute('href')
ok('14. Σύνδεσμος πρόσκλησης', !!applyUrl && applyUrl.includes('/apply/'))
await cp.screenshot({ path: S('10-invite') })

const m = await (await b.newContext({ viewport: { width: 400, height: 830 }, locale: 'el-GR' })).newPage()
m.on('pageerror', e => errs.push(e.message))
await m.goto(applyUrl); await m.waitForSelector('[data-apply-step="1"]', { timeout: 25000 })
await m.locator('input[name=who]').nth(0).check()
await m.getByRole('button', { name: 'Συνέχεια' }).click(); await m.waitForSelector('[data-apply-step="2"]')
const i2 = m.locator('[data-apply-step="2"] input')
await i2.nth(0).fill('Παρουσιάδης'); await i2.nth(1).fill('Νίκος'); await i2.nth(2).fill('Κ.'); await i2.nth(3).fill('2013-05-14')
await m.locator('[data-apply-step="2"] select').nth(0).selectOption('M'); await i2.nth(4).fill('ΑΚ123456')
const n2 = await i2.count()
await i2.nth(n2 - 4).fill('Παρουσιάδης'); await i2.nth(n2 - 3).fill('Κώστας'); await i2.nth(n2 - 2).fill('dimitris@webflow.gr')
await m.getByRole('button', { name: 'Συνέχεια' }).click(); await m.waitForSelector('[data-apply-step="3"]')
const reqs = await m.locator('[data-doc]').count()
ok('15. Wizard γονέα: απαιτούμενα έγγραφα', reqs >= 3, `${reqs} έγγραφα`)
for (const d of ['photo', 'birth_cert', 'guardian_consent']) {
  const f = m.locator(`[data-doc="${d}"] input[type=file]`)
  if (await f.count()) { await f.setInputFiles({ name: `${d}.jpg`, mimeType: 'image/jpeg', buffer: fs.readFileSync(`${DOCS}/${d === 'birth_cert' ? 'id_card' : d}.jpg`) }); await m.waitForSelector(`[data-doc="${d}"] >> text=Ανέβηκε`, { timeout: 40000 }) }
}
await m.waitForFunction(() => !document.body.innerText.includes('Ο AI ελέγχει'), null, { timeout: 90000 }).catch(() => {})
await m.waitForTimeout(800)
const aiTxt = await m.locator('[data-apply-step="3"]').innerText()
ok('16. AI έλεγχος εγγράφων στον γονέα', /Ο AI εντόπισε|Φαίνεται εντάξει/.test(aiTxt), (aiTxt.match(/Ο AI εντόπισε:[^\n]{0,80}/) ?? ['(καθαρά)'])[0])
await m.screenshot({ path: S('11-wizard-ai'), fullPage: true })
await m.getByRole('button', { name: 'Συνέχεια' }).click(); await m.waitForSelector('[data-apply-step="4"]')
const h = m.locator('[data-apply-step="4"] input')
await h.nth(0).fill('2026-09-01'); await h.nth(1).fill('2027-09-01'); await h.nth(2).fill('Δρ. Αθλητίατρος')
await m.getByRole('button', { name: 'Συνέχεια' }).click(); await m.waitForSelector('[data-apply-step="5"]')
await m.locator('[data-apply-step="5"] input[type=checkbox]').first().check()
await m.getByRole('button', { name: 'Αποστολή αίτησης' }).click()
await m.waitForSelector('[data-apply-done]', { timeout: 40000 })
const track = await m.locator('[data-apply-done] a').first().getAttribute('href')
ok('17. Υποβολή + σύνδεσμος παρακολούθησης', !!track && track.includes('/my/'))
await m.goto(track); await m.waitForSelector('[data-track-status]', { timeout: 20000 })
ok('18. «Το δελτίο σου»', (await m.locator('[data-track-status]').getAttribute('data-track-status')) === 'draft')
await m.screenshot({ path: S('12-track'), fullPage: true })

// ο έφορος βλέπει και επιβεβαιώνει
await cp.goto(BASE + '/licenses?status=athlete', { waitUntil: 'networkidle' }); await cp.waitForTimeout(1800)
const row = cp.locator('tbody tr').filter({ hasText: 'Παρουσιάδης' })
ok('19. Ο έφορος βλέπει «Από αθλητή»', (await row.count()) === 1)
await cp.screenshot({ path: S('13-club-queue'), fullPage: true })
await c2.close()

// ── 7. Δημόσια σελίδα
const pub = await (await b.newContext({ viewport: { width: 1400, height: 900 }, locale: 'el-GR' })).newPage()
await pub.goto(BASE + '/f/eozz/c/panellinio-newaza-2026-27', { waitUntil: 'networkidle' }); await pub.waitForTimeout(1800)
const pubTxt = await pub.locator('body').innerText()
ok('20. Δημόσιο ταμπλό', (await pub.locator('[data-bracket]').count()) >= 5)
ok('21. Καθαρή δημόσια σελίδα (χωρίς άσχετη βαθμολογία)', !/ΒΑΘΜΟΣ/i.test(pubTxt))
await pub.screenshot({ path: S('14-public'), fullPage: true })

console.log(`\n${res.filter(Boolean).length}/${res.length} βήματα OK`)
console.log('page errors:', errs.length ? errs : 'καθόλου')
await b.close()
process.exit(res.every(Boolean) ? 0 : 1)
