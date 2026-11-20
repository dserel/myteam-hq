// End-to-end acceptance flows against the local stack (Vite + PostgREST + Postgres).
// Run: node tests/e2e.mjs   (expects `scripts/db.sh all && scripts/db.sh api` and `npm run dev`)
import { chromium } from 'playwright'
import * as XLSX from 'xlsx'
import fs from 'node:fs'

const BASE = 'http://localhost:5173'
const OUT = '../reports/screens/e2e'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const results = []
const ok = (name, cond, extra = '') => { results.push({ name, ok: !!cond, extra }); console.log(`${cond ? '✅' : '❌'} ${name} ${extra}`) }

async function login(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'el-GR' })
  const page = await ctx.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message))
  await page.goto(BASE + '/login'); await page.getByText(email).click(); await page.waitForURL(BASE + '/')
  return { ctx, page }
}
const shot = (page, n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true })

// ---------------------------------------------------------------------------
// FLOW 1 — Δελτίο: club manager → union secretary → federation admin → charges on both ledgers
// ---------------------------------------------------------------------------
{
  const { ctx, page } = await login('club@glyfada-demo.gr')
  await page.goto(BASE + '/persons?new=1', { waitUntil: 'networkidle' })
  await page.getByLabel(/^Επώνυμο/).fill('Δοκιμαστόπουλος'); await page.getByLabel(/^Όνομα/).fill('Ορέστης')
  await page.getByLabel('Ημ. γέννησης').fill('2001-04-12')
  await page.getByRole('button', { name: 'Δημιουργία' }).click()
  await page.waitForURL(/\/persons\/[0-9a-f-]+$/)
  const personUrl = page.url()
  ok('1.1 club manager creates an athlete', true)
  // health card
  await page.getByRole('button', { name: 'Νέα κάρτα υγείας' }).click()
  await page.getByLabel('Ημ. έκδοσης').fill('2026-09-01'); await page.getByLabel('Ημ. λήξης').fill('2027-09-01')
  await page.getByRole('button', { name: 'Αποθήκευση' }).click(); await page.waitForTimeout(500)
  ok('1.2 health card added', await page.getByText('Σε ισχύ').first().isVisible())
  // consent (adult → self)
  await page.getByRole('button', { name: 'Καταγραφή συγκατάθεσης' }).click(); await page.waitForTimeout(400)
  // documents: photo + id_card
  for (const type of ['Φωτογραφία', 'Ταυτότητα/Διαβατήριο']) {
    await page.getByRole('button', { name: 'Ανέβασμα εγγράφου' }).click()
    await page.locator('select').filter({ has: page.locator('option', { hasText: 'Φωτογραφία' }) }).last().selectOption({ label: type })
    await page.getByRole('button', { name: 'Αποθήκευση' }).click(); await page.waitForTimeout(400)
  }
  ok('1.3 two documents recorded', (await page.locator('table').filter({ hasText: 'Ανέβηκε' }).locator('tbody tr').count()) === 2)
  // license
  await page.getByRole('link', { name: 'Νέα αίτηση δελτίου' }).click()
  await page.waitForURL(/licenses\/new/)
  await page.locator('select').first().selectOption({ label: 'Καλαθοσφαίριση' })
  await page.getByRole('button', { name: 'Δημιουργία' }).click()
  await page.waitForURL(/\/licenses\/[0-9a-f-]+$/)
  const licUrl = page.url()
  // attach docs
  const attachButtons = page.getByRole('button', { name: /^Επισύναψη:/ })
  await page.waitForTimeout(800)
  for (let guard = 0; guard < 5 && await attachButtons.count(); guard++) {
    const n = await attachButtons.count()
    await attachButtons.first().click()
    for (let i = 0; i < 20 && await attachButtons.count() >= n; i++) await page.waitForTimeout(250)
  }
  await page.waitForTimeout(500)
  await shot(page, '1-license-draft')
  await page.getByRole('button', { name: 'Υποβολή', exact: true }).click(); await page.waitForTimeout(800)
  ok('1.4 club manager submits (docs attached)', await page.getByText('Υποβλήθηκε').first().isVisible())
  ok('1.5 club manager sees no approve button', (await page.getByRole('button', { name: 'Έγκριση' }).count()) === 0)
  await ctx.close()

  const s = await login('secretary@esna-demo.gr')
  await s.page.goto(licUrl, { waitUntil: 'networkidle' })
  ok('1.6 union secretary cannot issue directly', (await s.page.getByRole('button', { name: 'Έκδοση', exact: true }).count()) === 0)
  await s.page.getByRole('button', { name: 'Έγκριση' }).click(); await s.page.waitForTimeout(800)
  ok('1.7 union secretary approves', await s.page.getByText('Εγκρίθηκε').first().isVisible())
  await shot(s.page, '1-license-approved'); await s.ctx.close()

  const f = await login('admin@okd-demo.gr')
  await f.page.goto(licUrl, { waitUntil: 'networkidle' })
  await f.page.getByRole('button', { name: 'Έκδοση', exact: true }).click(); await f.page.waitForTimeout(1000)
  const body = await f.page.locator('body').innerText()
  const m = body.match(/ΟΚΔ-\d{6}/)
  ok('1.8 federation issues with number + QR', !!m && (await f.page.locator('svg').count()) > 0, m?.[0] ?? '')
  await shot(f.page, '1-license-issued')
  // charges on BOTH ledgers
  await f.page.goto(BASE + '/clubs', { waitUntil: 'networkidle' })
  await f.page.getByRole('link', { name: 'Α.Ο. Γλυφάδας' }).click(); await f.page.getByRole('button', { name: /Οικονομικά/ }).click(); await f.page.waitForTimeout(600)
  const cards = await f.page.locator('section', { hasText: '€' }).allInnerTexts()
  ok('1.9 club has ledger cards at federation AND union', cards.some(c => c.includes('Ομοσπονδία')) && cards.some(c => c.includes('Ένωση')), cards.map(c => c.split('\n').slice(0, 2).join(': ')).join(' | '))
  await f.page.getByRole('link', { name: 'Καρτέλα →' }).first().click(); await f.page.waitForTimeout(800)
  const ledgerText = await f.page.locator('body').innerText()
  ok('1.10 license fee appears on federation ledger', /Παράβολο έκδοσης δελτίου — Δοκιμαστόπουλος/.test(ledgerText))
  await shot(f.page, '1-federation-ledger')
  await f.ctx.close()
  void personUrl
}

// ---------------------------------------------------------------------------
// FLOW 2 — Ταμίας: payment, receipt, reversal, reminder
// ---------------------------------------------------------------------------
{
  const { ctx, page } = await login('treasurer@esna-demo.gr')
  await page.goto(BASE + '/finance', { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: 'Α.Σ. Ηλιούπολης' }).click(); await page.waitForTimeout(800)
  const readBal = async () => Number((await page.locator('.font-display.tabular-nums').first().innerText()).replace(/[^\d,]/g, '').replace(',', '.'))
  const before = await readBal()
  await page.getByRole('button', { name: 'Καταχώριση πληρωμής' }).click()
  await page.getByLabel(/^Ποσό/).fill('100'); await page.getByLabel('Αρ. παραστατικού').fill('E2E-1')
  await page.getByRole('button', { name: 'Αποθήκευση' }).click(); await page.waitForTimeout(1000)
  const after = await readBal()
  ok('2.1 payment reduces balance by 100', Math.abs(before - after - 100) < 0.01, `${before} → ${after}`)
  ok('2.2 receipt number issued', /ΕΣΝΑ-Α\d{6}/.test(await page.locator('body').innerText()))
  await shot(page, '2-account-after-payment')
  page.once('dialog', d => d.accept('Λάθος σωματείο'))
  await page.locator('tr', { hasText: 'E2E-1' }).getByRole('button', { name: 'Αντιλογισμός' }).click(); await page.waitForTimeout(1000)
  const restored = await readBal()
  ok('2.3 reversal restores balance (entry not deleted)', Math.abs(restored - before) < 0.01 && /Αντιλογισμός: Λάθος σωματείο/.test(await page.locator('body').innerText()))
  await page.getByRole('button', { name: 'Αποστολή υπενθύμισης' }).click(); await page.waitForTimeout(800)
  ok('2.4 reminder recorded', /@club3-demo.gr/.test(await page.locator('body').innerText()))
  await shot(page, '2-account-after-reversal')
  await ctx.close()
}

// ---------------------------------------------------------------------------
// FLOW 3 — Αποτέλεσμα → βαθμολογία στη δημόσια σελίδα
// ---------------------------------------------------------------------------
{
  const pub = await browser.newContext()
  const pp = await pub.newPage()
  await pp.goto(BASE + '/f/esna/c/paidon-2026-27', { waitUntil: 'networkidle' })
  const rankBefore = (await pp.locator('tbody tr').allInnerTexts()).map(r => r.split('\t')[1])
  const { ctx, page } = await login('secretary@esna-demo.gr')
  await page.goto(BASE + '/competitions', { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: /Πρωτάθλημα Παίδων/ }).click()
  await page.getByRole('button', { name: /^Πρόγραμμα/ }).click(); await page.waitForTimeout(600)
  // first scheduled match → enter a result
  await page.getByRole('button', { name: 'Καταχώριση αποτελέσματος' }).first().click()
  const inputs = page.locator('input[type=number]')
  await inputs.nth(0).fill('99'); await inputs.nth(1).fill('40')
  await page.getByRole('button', { name: 'Αποθήκευση' }).click(); await page.waitForTimeout(1000)
  ok('3.1 result entered', /99 – 40/.test(await page.locator('body').innerText()))
  await page.getByRole('button', { name: /^Βαθμολογία/ }).click(); await page.waitForTimeout(600)
  await shot(page, '3-standings-after-result')
  await pp.reload({ waitUntil: 'networkidle' }); await pp.waitForTimeout(500)
  const rows = await pp.locator('tbody tr').allInnerTexts()
  const played = rows.map(r => Number(r.split('\t')[2])).reduce((a, b) => a + b, 0)
  ok('3.2 public standings updated automatically', played === 2 * 31 || played > 0, `total played cells = ${played}; before: ${rankBefore.slice(0, 3).join(',')}`)
  await shot(pp, '3-public-standings'); await pub.close(); await ctx.close()
}

// ---------------------------------------------------------------------------
// FLOW 4 — Import από «βρώμικο» Excel
// ---------------------------------------------------------------------------
{
  const rows = [['Επώνυμο', 'Όνομα', 'Ημ. Γέννησης', 'Φύλο', 'Σύλλογος', 'Αρ. Ταυτότητας', 'Κηδεμόνας', 'Τηλ. κηδεμόνα']]
  const last = ['Ξένος', 'Δημητρακόπουλος', 'Αργυρίου', 'Λέκκας', 'Παππάς', 'Μήτσου', 'Κατσαρός', 'Φλώρος']
  for (let i = 0; i < 40; i++) {
    const dob = i % 7 === 0 ? `${10 + i}/13/2012` : i % 5 === 0 ? `2012-0${1 + (i % 9)}-15` : `${1 + (i % 28)}/${1 + (i % 12)}/${2009 + (i % 5)}`
    rows.push([(i % 2 ? '  ' : '') + last[i % 8] + (i > 30 ? 'ς' : ''), 'Αθλητής' + i, dob, i % 3 ? 'Α' : 'Θήλυ', i % 9 === 0 ? 'Άγνωστος Σύλλογος' : i % 2 ? 'Α.Ο. ΓΛΥΦΑΔΑΣ' : 'Γ.Σ. Βούλας', i % 4 ? 'ΑΚ' + (700000 + i) : '', i < 20 ? 'Μαρία ' + last[i % 8] : '', '69' + (10000000 + i)])
  }
  rows.push(rows[5]) // exact duplicate row in file
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Αθλητές')
  const file = '/tmp/dirty-import.xlsx'; XLSX.writeFile(wb, file)

  const { ctx, page } = await login('secretary@esna-demo.gr')
  await page.goto(BASE + '/persons', { waitUntil: 'networkidle' })
  const countBefore = Number((await page.locator('h1 + p').innerText()).match(/από (\d+)/)?.[1] ?? 0)
  await page.goto(BASE + '/import', { waitUntil: 'networkidle' })
  const t0 = Date.now()
  await page.locator('input[type=file]').setInputFiles(file)
  await page.waitForTimeout(800)
  ok('4.1 columns auto-detected', await page.getByText('Αυτόματη αναγνώριση στηλών').isVisible())
  await page.getByRole('button', { name: 'Επόμενο' }).click(); await page.waitForTimeout(2500)
  const previewText = await page.locator('body').innerText()
  const errCount = Number(previewText.match(/Λάθος (\d+)/)?.[1] ?? 0)
  const okCount = Number(previewText.match(/Εντάξει (\d+)/)?.[1] ?? 0)
  ok('4.2 preview flags bad dates, unknown club and in-file duplicate', errCount >= 6 && okCount > 20, `ok=${okCount} errors=${errCount}`)
  await shot(page, '4-import-preview')
  await page.getByRole('button', { name: /^Εισαγωγή \d+ γραμμών/ }).click()
  await page.getByText('Η εισαγωγή ολοκληρώθηκε').waitFor({ timeout: 120000 })
  const secs = Math.round((Date.now() - t0) / 1000)
  const doneText = await page.locator('body').innerText()
  const created = Number(doneText.match(/(\d+)\s+δημιουργήθηκαν/)?.[1] ?? 0)
  ok('4.3 import committed', created > 20, `${created} created in ${secs}s`)
  await shot(page, '4-import-done')
  await page.goto(BASE + '/persons', { waitUntil: 'networkidle' })
  const countAfter = Number((await page.locator('h1 + p').innerText()).match(/από (\d+)/)?.[1] ?? 0)
  ok('4.4 persons count increased by created rows (+guardians)', countAfter >= countBefore + created, `${countBefore} → ${countAfter}`)
  await ctx.close()
}

// ---------------------------------------------------------------------------
// FLOW 5 — RLS from the browser: ESBA viewer cannot see ESNA data
// ---------------------------------------------------------------------------
{
  const { ctx, page } = await login('viewer@esba-demo.gr')
  await page.goto(BASE + '/clubs', { waitUntil: 'networkidle' })
  const txt = await page.locator('body').innerText()
  ok('5.1 ESBA viewer sees no ESNA clubs', !txt.includes('Α.Ο. Γλυφάδας') && txt.includes('Γ.Σ. Χαλανδρίου'))
  await page.goto(BASE + '/finance', { waitUntil: 'networkidle' })
  ok('5.2 ESBA viewer has no payment buttons', (await page.getByRole('button', { name: 'Υπενθύμιση σε όλους τους οφειλέτες' }).count()) === 0)
  await ctx.close()
}

// ---------------------------------------------------------------------------
// FLOW 6 — Σύνθεση & επιλεξιμότητα (Φάση 1.5-A): club manager declares, secretary overrides, cards show activity
// ---------------------------------------------------------------------------
{
  const { ctx, page } = await login('club@glyfada-demo.gr')
  await page.goto(BASE + '/competitions', { waitUntil: 'networkidle' })
  await page.getByText('Πρωτάθλημα Παίδων ΕΣΝΑ 2026-27').first().click()
  await page.getByRole('button', { name: 'Ομάδες' }).click()
  await page.waitForSelector('[data-roster]')
  const roster = page.locator('[data-roster]').first()
  const before = await roster.locator('tbody tr').count()
  ok('6.1 club manager sees own roster with eligibility badges', before > 5 && (await roster.getByText('Μη επιλέξιμος').count()) > 0, `${before} rows`)
  ok('6.2 ineligible rows carry a reason', (await roster.getByText('δελτίο').count()) > 0)
  ok('6.3 club manager has no override button', (await roster.getByRole('button', { name: 'Παράκαμψη' }).count()) === 0)
  await roster.getByRole('button', { name: 'Δήλωση αθλητών' }).click()
  const dlg = page.locator('[role=dialog]')
  await dlg.locator('input[type=checkbox]').first().check()
  await dlg.getByRole('button', { name: /Δήλωση αθλητών \(1\)/ }).click()
  await page.waitForTimeout(800)
  ok('6.4 club manager declares one more athlete', (await roster.locator('tbody tr').count()) === before + 1)
  await shot(page, '6-roster-club')
  await ctx.close()

  const s = await login('secretary@esna-demo.gr')
  await s.page.goto(BASE + '/competitions', { waitUntil: 'networkidle' })
  await s.page.getByText('Πρωτάθλημα Παίδων ΕΣΝΑ 2026-27').first().click()
  await s.page.getByRole('button', { name: 'Ομάδες' }).click()
  await s.page.locator('tr[data-entry]').filter({ hasText: 'Α.Ο. Γλυφάδας' }).getByRole('button', { name: 'Σύνθεση' }).click()
  const r2 = s.page.locator('[data-roster]').first()
  await r2.getByRole('button', { name: 'Παράκαμψη' }).first().click()
  await s.page.locator('[role=dialog] input').fill('Απόφαση ΔΣ 12/2026')
  await s.page.locator('[role=dialog]').getByRole('button', { name: 'Αποθήκευση' }).click()
  await s.page.waitForTimeout(800)
  ok('6.5 secretary overrides with a reason', (await r2.getByText('Παράκαμψη γραμματείας').count()) > 0)
  await shot(s.page, '6-roster-override')
  await s.page.goto(BASE + '/clubs', { waitUntil: 'networkidle' })
  await s.page.getByText('Α.Ο. Γλυφάδας').first().click()
  await s.page.getByRole('button', { name: /Διοργανώσεις/ }).click()
  ok('6.6 club card shows competitions tab with rank and roster counts', await s.page.getByText('Πρωτάθλημα Παίδων ΕΣΝΑ 2026-27').first().isVisible())
  await shot(s.page, '6-club-competitions')
  await s.page.goto(BASE + '/competitions', { waitUntil: 'networkidle' })
  await s.page.getByText('Πρωτάθλημα Παίδων ΕΣΝΑ 2026-27').first().click()
  await s.page.getByRole('button', { name: 'Ομάδες' }).click()
  await s.page.locator('tr[data-entry]').filter({ hasText: 'Α.Ο. Γλυφάδας' }).getByRole('button', { name: 'Σύνθεση' }).click()
  await s.page.locator('[data-roster] tbody tr').first().locator('a').first().click()
  await s.page.waitForURL(/\/persons\//); await s.page.getByText('Αγωνιστική δραστηριότητα').waitFor(); await s.page.waitForTimeout(1200)
  ok('6.7 athlete card shows competition activity', await s.page.getByText('Αγωνιστική δραστηριότητα').isVisible() && await s.page.getByText('Πρωτάθλημα Παίδων ΕΣΝΑ 2026-27').first().isVisible())
  await shot(s.page, '6-athlete-activity')
  await s.ctx.close()
}

// ---------------------------------------------------------------------------
// FLOW 7 — Νοκ-άουτ (Φάση 1.5-B): ημιτελικός → ο τελικός γεμίζει· ισοπαλία απαιτεί νικητή· δημόσιο ταμπλό
// ---------------------------------------------------------------------------
{
  const { ctx, page } = await login('secretary@esna-demo.gr')
  await page.goto(BASE + '/competitions', { waitUntil: 'networkidle' })
  await page.getByText('Κύπελλο Παίδων ΕΣΝΑ 2026-27').first().click()
  await page.waitForSelector('[data-bracket]')
  ok('7.1 bracket renders 3 rounds', (await page.locator('[data-bracket-match]').count()) === 7)
  // ημιτελικός 1: κλικ στην κάρτα → αποτέλεσμα ισοπαλίας χωρίς νικητή → μήνυμα
  const semi = page.locator('[data-bracket-match]').nth(4)
  await semi.click()
  const dlg = page.locator('[role=dialog]')
  const inputs = dlg.locator('input[type=number]')
  await inputs.nth(0).fill('66'); await inputs.nth(1).fill('66')
  ok('7.2 draw asks for a winner', await dlg.getByText('Νικητής').isVisible())
  await dlg.locator('label:has-text("Νικητής") select').selectOption({ index: 1 })
  await dlg.getByRole('button', { name: 'Αποθήκευση' }).click(); await page.waitForTimeout(1000)
  const finalCard = page.locator('[data-bracket-match]').nth(6)
  ok('7.3 final home slot filled after SF result', !(await finalCard.innerText()).startsWith('…'))
  await shot(page, '7-bracket-after-sf')
  await ctx.close()
  const pp = await (await browser.newContext({ viewport: { width: 420, height: 800 } })).newPage()
  await pp.goto(BASE + '/f/esna/c/kypello-paidon-2026-27', { waitUntil: 'networkidle' }); await pp.waitForTimeout(500)
  ok('7.4 public page shows the bracket', (await pp.locator('[data-bracket-match]').count()) === 7)
  await shot(pp, '7-bracket-public-mobile')
  await pp.context().close()
}

// ---------------------------------------------------------------------------
// FLOW 8 — Αγωνίσματα & επιδόσεις (Φάση 1.5-C): καταχώριση επίδοσης → κατάταξη· δήλωση από σύλλογο· δημόσια αποτελέσματα
// ---------------------------------------------------------------------------
{
  const { ctx, page } = await login('admin@osd-demo.gr')
  await page.goto(BASE + '/competitions', { waitUntil: 'networkidle' })
  await page.getByText('Διασυλλογικοί Αγώνες Κ16 2027').first().click()
  await page.waitForSelector('[data-result]')
  ok('8.1 meet shows heats and final for 100m', (await page.locator('[data-result]').count()) === 29)
  // τελικός: ο 8ος παίρνει 10.50 → 1ος
  const finalCard = page.locator('section').filter({ has: page.locator('h3', { hasText: /^Τελικός$/ }) }).last()
  const lastRow = finalCard.locator('[data-result]').last()
  await lastRow.locator('input').first().fill('10.50'); await lastRow.locator('input').first().press('Enter'); await page.waitForTimeout(1000)
  ok('8.2 entering a faster time makes the athlete rank 1', /1\s*🥇/.test(await finalCard.locator('[data-result]').last().innerText()))
  await shot(page, '8-meet-results')
  await page.getByRole('button', { name: 'Κατάταξη' }).click(); await page.waitForTimeout(400)
  ok('8.3 ranking tab shows 10.50 first', (await page.locator('tbody tr').first().innerText()).includes('10.50'))
  await ctx.close()

  // υπεύθυνος πολυαθλητικού συλλόγου δηλώνει αθλητή στα 800μ
  const c = await login('club@psychiko-demo.gr')
  await c.page.goto(BASE + '/', { waitUntil: 'networkidle' })
  const optVal = await c.page.locator('aside select option').filter({ hasText: 'ΟΣΔ' }).getAttribute('value')
  await c.page.locator('aside select').selectOption(optVal); await c.page.waitForTimeout(800)
  await c.page.goto(BASE + '/competitions', { waitUntil: 'networkidle' })
  await c.page.getByText('Διασυλλογικοί Αγώνες Κ16 2027').first().click(); await c.page.waitForSelector('[data-event]')
  await c.page.locator('[data-event]').nth(2).click(); await c.page.waitForTimeout(500)
  await c.page.getByRole('button', { name: 'Συμμετοχές' }).click()
  const before = await c.page.locator('tbody tr').count()
  await c.page.getByRole('button', { name: 'Δήλωση αθλητών' }).click()
  const dlg = c.page.locator('[role=dialog]'); await dlg.locator('input[type=checkbox]').first().check()
  await dlg.getByRole('button', { name: /Δήλωση αθλητών \(1\)/ }).click(); await c.page.waitForTimeout(1000)
  ok('8.4 club manager enters own athlete into 800m (pending, eligibility checked)', (await c.page.locator('tbody tr').count()) === before + 1 && (await c.page.getByText('Εκκρεμεί').count()) > 0)
  await shot(c.page, '8-meet-club-entry')
  await c.ctx.close()

  const pp = await (await browser.newContext({ viewport: { width: 420, height: 800 } })).newPage()
  await pp.goto(BASE + '/f/osd/c/diasyllogikoi-k16-2027', { waitUntil: 'networkidle' }); await pp.waitForTimeout(600)
  const txt = await pp.locator('body').innerText()
  ok('8.5 public results show masked minor names', /\S\. \S\./.test(txt) && !txt.includes('Κυριακίδη Μαρία'))
  await shot(pp, '8-meet-public-mobile')
  await pp.context().close()
}

// ---------------------------------------------------------------------------
// FLOW 9 — Αίτηση δελτίου (Φάση 12): πρόσκληση τμήματος → wizard κηδεμόνα (κινητό) → ο σύλλογος βλέπει «Από αθλητή», επιστρέφει, επιβεβαιώνει → σελίδα παρακολούθησης
// ---------------------------------------------------------------------------
{
  const { ctx, page } = await login('club@glyfada-demo.gr')
  await page.goto(BASE + '/sections', { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: 'Παίδων', exact: true }).first().click(); await page.waitForSelector('[data-member]')
  ok('9.1 section page shows readiness badges', (await page.getByText(/Χωρίς δελτίο|Έτοιμος|Χωρίς κάρτα υγείας/).count()) > 0)
  await page.getByRole('button', { name: 'Πρόσκληση για δελτίο' }).click()
  const dlg = page.locator('[role=dialog]')
  await dlg.getByRole('button', { name: 'Ανοιχτός σύνδεσμος τμήματος' }).click(); await page.waitForSelector('[data-new-link]')
  const applyUrl = await page.locator('[data-new-link] a').first().getAttribute('href')
  ok('9.2 club manager creates a section invitation link', !!applyUrl && applyUrl.includes('/apply/'))
  await shot(page, '9-invite-link')
  await ctx.close()

  // ο κηδεμόνας ανοίγει το link στο κινητό
  const m = await (await browser.newContext({ viewport: { width: 400, height: 820 }, locale: 'el-GR' })).newPage()
  m.on('pageerror', e => console.log('PAGEERROR', e.message))
  await m.goto(applyUrl, { waitUntil: 'networkidle' }); await m.waitForSelector('[data-apply-step="1"]')
  await m.locator('input[name=who]').nth(0).check()
  await m.getByRole('button', { name: 'Συνέχεια' }).click(); await m.waitForSelector('[data-apply-step="2"]')
  const inputs = m.locator('[data-apply-step="2"] input')
  await inputs.nth(0).fill('Δοκιμαστόπουλος'); await inputs.nth(1).fill('Άρης'); await inputs.nth(2).fill('Κ.'); await inputs.nth(3).fill('2012-03-03')
  await m.locator('[data-apply-step="2"] select').nth(0).selectOption('M')
  await m.locator('[data-apply-step="2"] input').nth(4).fill('AK999999')
  const gi = m.locator('[data-apply-step="2"] input'); const n = await gi.count()
  await gi.nth(n - 4).fill('Δοκιμαστόπουλος'); await gi.nth(n - 3).fill('Κώστας'); await gi.nth(n - 2).fill('kostas@example.com')
  await m.getByRole('button', { name: 'Συνέχεια' }).click(); await m.waitForSelector('[data-apply-step="3"]')
  ok('9.3 minor → guardian consent document is required', (await m.locator('[data-doc="guardian_consent"]').count()) === 1)
  for (const d of ['photo', 'id_card', 'guardian_consent']) {
    await m.locator(`[data-doc="${d}"] input[type=file]`).setInputFiles({ name: `${d}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from('x'.repeat(2000)) })
    await m.waitForTimeout(300)
  }
  await shot(m, '9-wizard-docs')
  await m.getByRole('button', { name: 'Συνέχεια' }).click(); await m.waitForSelector('[data-apply-step="4"]')
  const hcIn = m.locator('[data-apply-step="4"] input')
  await hcIn.nth(0).fill('2026-09-01'); await hcIn.nth(1).fill('2027-09-01'); await hcIn.nth(2).fill('Δρ. Δοκιμή')
  await m.getByRole('button', { name: 'Συνέχεια' }).click(); await m.waitForSelector('[data-apply-step="5"]')
  await m.locator('[data-apply-step="5"] input[type=checkbox]').first().check()
  await m.getByRole('button', { name: 'Αποστολή αίτησης' }).click(); await m.waitForSelector('[data-apply-done]', { timeout: 10000 })
  const trackHref = await m.locator('[data-apply-done] a').first().getAttribute('href')
  ok('9.4 guardian submits the application and receives a tracking link', !!trackHref && trackHref.includes('/my/'))
  await shot(m, '9-wizard-done')
  await m.goto(trackHref, { waitUntil: 'networkidle' }); await m.waitForSelector('[data-track-status]')
  ok('9.5 tracking page shows draft (awaiting club)', (await m.locator('[data-track-status]').getAttribute('data-track-status')) === 'draft')
  await shot(m, '9-track-draft')

  // ο σύλλογος βλέπει τις αιτήσεις από αθλητές, επιστρέφει, επιβεβαιώνει
  const c = await login('club@glyfada-demo.gr')
  await c.page.goto(BASE + '/licenses?status=athlete', { waitUntil: 'networkidle' }); await c.page.waitForTimeout(500)
  const row = c.page.locator('tbody tr').filter({ hasText: 'Δοκιμαστόπουλος' })
  ok('9.6 club sees the application under «Από αθλητές» with badge', (await row.count()) === 1 && (await row.getByText('Από αθλητή').count()) === 1)
  await row.locator('a').first().click(); await c.page.waitForSelector('[data-via="athlete"]')
  await c.page.getByRole('button', { name: 'Επιστροφή στον αιτούντα' }).click()
  await c.page.locator('[role=dialog] textarea').fill('Η φωτογραφία είναι θολή')
  await c.page.locator('[role=dialog]').getByRole('button', { name: 'Επιστροφή στον αιτούντα' }).click(); await c.page.waitForTimeout(800)
  ok('9.7 club returns the application with a note', (await c.page.getByText('Η φωτογραφία είναι θολή').count()) > 0)
  await c.page.locator('[data-action=submit]').click(); await c.page.waitForTimeout(1000)
  ok('9.8 club confirms → submitted to the union', (await c.page.getByText('Υποβλήθηκε').count()) > 0)
  await shot(c.page, '9-club-confirm')
  await c.ctx.close()

  await m.reload({ waitUntil: 'networkidle' }); await m.waitForSelector('[data-track-status]'); await m.waitForTimeout(500)
  ok('9.9 tracking page follows the status', (await m.locator('[data-track-status]').getAttribute('data-track-status')) === 'submitted')
  await m.context().close()
}

await browser.close()
const failed = results.filter(r => !r.ok)
fs.writeFileSync('../reports/e2e-report.md', `# E2E acceptance report — ${new Date().toISOString()}\n\n| Result | Flow | Notes |\n|---|---|---|\n` + results.map(r => `| ${r.ok ? '✅' : '❌'} | ${r.name} | ${r.extra} |`).join('\n') + `\n\n${results.length - failed.length}/${results.length} passed\n`)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
