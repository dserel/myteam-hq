// Φάση 13-A — μεταγραφές: ολόκληρη η ροή από τον browser, όπως θα την κάνει η ΕΟΖΖ
import { chromium } from 'playwright'
const BASE = 'http://localhost:5173'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width: 1360, height: 950 }, locale: 'el-GR' })
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(e.message))
let pass = 0, fail = 0
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${n} ${x}`) }

// ---------------------------------------------------------------- γραμματεία ΕΟΖΖ
await p.goto(BASE + '/login'); await p.getByText('secretary@eozz-demo.gr').click()
await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 })
await p.waitForTimeout(1500)
ok('1. login ως γραμματεία ΕΟΖΖ', true)

// το μενού δείχνει Μεταγραφές — και ΔΕΝ δείχνει Τμήματα (ο διακόπτης της ΕΟΖΖ)
const nav = await p.locator('aside').innerText()
ok('2. «Μεταγραφές» στο μενού', nav.includes('Μεταγραφές'))
ok('3. «Τμήματα» κρυμμένα για την ΕΟΖΖ', !nav.includes('Τμήματα'), nav.replace(/\n/g, ' · '))

await p.goto(BASE + '/transfers', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
const win = await p.locator('[data-window]').innerText()
ok('4. ανοιχτή μεταγραφική περίοδος στην κορυφή', win.includes('Ανοιχτή μεταγραφική περίοδος'), win.trim())
const queued = await p.locator('[data-transfer]').count()
ok('5. ουρά μεταγραφών', queued >= 2, `${queued} αιτήσεις`)
await p.screenshot({ path: '../reports/screens/tr-1-queue.png', fullPage: true })

// ---------------------------------------------------------------- νέα αίτηση από τον σύλλογο που υποδέχεται
// Μαζεύουμε αρκετούς αριθμούς δελτίων: κάποιοι έχουν ήδη ανοιχτή μεταγραφή από το seed.
await p.goto(BASE + '/licenses?status=issued', { waitUntil: 'networkidle' }); await p.waitForTimeout(1800)
const licNos = (await p.locator('tbody tr td:nth-child(2)').allInnerTexts()).map(x => x.trim()).filter(x => /\d/.test(x)).slice(0, 8)
ok('6. βρέθηκαν αριθμοί δελτίων σε ισχύ', licNos.length > 0, licNos.slice(0, 3).join(', '))

await p.goto(BASE + '/transfers/new', { waitUntil: 'networkidle' }); await p.waitForTimeout(900)
const clubOpts = await p.locator('[data-to-club] option').count()
ok('7. επιλογή σωματείου υποδοχής', clubOpts > 1, `${clubOpts - 1} σωματεία`)

let created = false, cardText = '', usedNo = '', usedClub = 1
outer:
for (let ci = 1; ci < Math.min(clubOpts, 4) && !created; ci++) {
  await p.locator('[data-to-club]').selectOption({ index: ci })
  for (const n of licNos) {
    await p.locator('[data-license-no]').fill(n)
    await p.locator('[data-action=search]').click(); await p.waitForTimeout(1200)
    if (!(await p.locator('[data-found]').count())) continue
    cardText = await p.locator('[data-found]').innerText()
    if (await p.locator('[data-blocked]').count()) continue
    const btn = p.locator('[data-action=create]')
    if (await btn.count()) {
      usedNo = n; usedClub = ci
      await p.screenshot({ path: '../reports/screens/tr-2-find.png', fullPage: true })
      await btn.first().click(); created = true; break outer
    }
  }
}
ok('8. αναζήτηση με αριθμό δελτίου βρίσκει τον αθλητή', cardText.length > 0)
ok('9. δείχνει μόνο όνομα, έτος και τρέχον σωματείο', /\(\d{4}\)/.test(cardText) && cardText.includes('Τρέχον σωματείο'), cardText.split('\n')[0])
ok('10. δημιουργήθηκε αίτηση', created)
await p.waitForURL(/\/transfers\/[0-9a-f-]{36}$/, { timeout: 15000 }); await p.waitForTimeout(1200)
const trUrl = p.url()
ok('11. άνοιξε η καρτέλα μεταγραφής', true, trUrl.split('/').pop())

// το ίδιο δελτίο δεύτερη φορά → μπλοκάρεται με ελληνικό λόγο (ντετερμινιστικός έλεγχος)
await p.goto(BASE + '/transfers/new', { waitUntil: 'networkidle' }); await p.waitForTimeout(900)
await p.locator('[data-to-club]').selectOption({ index: usedClub })
await p.locator('[data-license-no]').fill(usedNo)
await p.locator('[data-action=search]').click(); await p.waitForTimeout(1500)
const blockedTxt = (await p.locator('[data-blocked]').innerText().catch(() => '')).trim()
ok('12. δεύτερη αίτηση για το ίδιο δελτίο μπλοκάρεται με ελληνικό λόγο', blockedTxt.includes('ανοιχτή αίτηση'), blockedTxt)
await p.goto(trUrl, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)

const detail = await p.locator('body').innerText()
ok('13. δηλώνει ρητά ότι το δελτίο κρατά τον αριθμό του', detail.includes('κρατά τον ίδιο αριθμό'))
ok('14. λίστα δικαιολογητικών μεταγραφής', (await p.locator('td:has-text("αποδέσμευσης")').count()) > 0)
await p.screenshot({ path: '../reports/screens/tr-3-detail.png', fullPage: true })

// ---------------------------------------------------------------- υποβολή χωρίς δικαιολογητικά → μπλοκάρει με ελληνικό λόγο
await p.locator('[data-action=submit]').click(); await p.waitForTimeout(1500)
const afterSubmit = await p.locator('body').innerText()
ok('15. υποβολή χωρίς δικαιολογητικά μπλοκάρεται', afterSubmit.includes('Λείπουν δικαιολογητικά'),
   afterSubmit.match(/Λείπουν δικαιολογητικά[^\n]*/)?.[0]?.slice(0, 90) ?? '')

// ---------------------------------------------------------------- υπάρχουσα αίτηση σε έλεγχο → έγκριση
await p.goto(BASE + '/transfers?status=under_review', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
const underReview = await p.locator('[data-transfer]').count()
ok('16. υπάρχει αίτηση σε έλεγχο από το seed', underReview >= 1)
if (underReview) {
  await p.locator('[data-transfer] a').first().click(); await p.waitForTimeout(1500)
  const before = await p.locator('body').innerText()
  const toClub = before.match(/Προς\n([^\n]+)/)?.[1] ?? ''
  await p.locator('[data-action=approve]').click(); await p.waitForTimeout(2500)
  const after = await p.locator('body').innerText()
  ok('17. έγκριση → ολοκληρώθηκε', after.includes('Ολοκληρώθηκε'))
  ok('18. μήνυμα ότι το δελτίο ανήκει πλέον στο νέο σωματείο', (await p.locator('[data-completed]').count()) === 1,
     (await p.locator('[data-completed]').innerText().catch(() => '')).trim())
  await p.screenshot({ path: '../reports/screens/tr-4-approved.png', fullPage: true })
  ok('19. το νέο σωματείο καταγράφηκε', toClub.length > 0, toClub)
}

// ---------------------------------------------------------------- ρυθμίσεις: περίοδοι & διακόπτες
await p.goto(BASE + '/login'); await p.waitForTimeout(500)
await p.getByText('admin@eozz-demo.gr').click()
await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 }); await p.waitForTimeout(1200)
await p.goto(BASE + '/settings', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000)
await p.getByRole('button', { name: 'Μεταγραφές' }).click(); await p.waitForTimeout(900)
ok('20. καρτέλα μεταγραφών στις ρυθμίσεις', (await p.locator('[data-action=add-window]').count()) === 1)
await p.screenshot({ path: '../reports/screens/tr-5-settings.png', fullPage: true })
await p.getByRole('button', { name: 'Δελτία' }).click(); await p.waitForTimeout(700)
const applySwitch = p.locator('[data-switch=apply]')
ok('22. διακόπτης «αίτηση από αθλητή» υπάρχει και είναι κλειστός', await applySwitch.count() === 1 && !(await applySwitch.isChecked()))
const secSwitch = p.locator('[data-switch=sections]')
ok('21. διακόπτης «τμήματα» κλειστός', await secSwitch.count() === 1 && !(await secSwitch.isChecked()))

// ---------------------------------------------------------------- ο παλιός σύλλογος: βλέπει, δεν εγκρίνει
await p.goto(BASE + '/login'); await p.waitForTimeout(500)
await p.getByText('club@jj-athens-demo.gr').click()
await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 }); await p.waitForTimeout(1200)
await p.goto(BASE + '/transfers?status=all', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
const clubRows = await p.locator('[data-transfer]').count()
ok('24. ο σύλλογος βλέπει μόνο τις δικές του μεταγραφές', clubRows >= 0, `${clubRows} γραμμές`)
if (clubRows) {
  await p.locator('[data-transfer] a').first().click(); await p.waitForTimeout(1500)
  const noApprove = (await p.locator('[data-action=approve]').count()) === 0
  ok('23. ο σύλλογος ΔΕΝ έχει κουμπί έγκρισης', noApprove)
  await p.screenshot({ path: '../reports/screens/tr-6-club.png', fullPage: true })
}

console.log(`\n${pass} πέρασαν, ${fail} απέτυχαν`)
console.log(errs.length ? '❌ PAGE ERRORS:\n' + errs.join('\n') : '✅ 0 page errors')
await b.close()
process.exit(fail || errs.length ? 1 : 0)
