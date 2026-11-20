// Live smoke for Φάση 12 (cloud): club manager creates an invite link → guardian wizard (real storage upload + precheck) → track page → club confirms
import { chromium } from 'playwright'
import fs from 'fs'
const DOCS = '/tmp/claude-0/-home-claude/0fa18267-fabd-5dc0-a28f-5592b2b3b180/scratchpad/docs'
const BASE = process.env.BASE ?? 'https://federations-mvp.netlify.app'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, locale: 'el-GR' }); const p = await ctx.newPage()
const errors = []; p.on('pageerror', e => errors.push(e.message))
await p.goto(BASE + '/login'); await p.waitForSelector('text=club@glyfada-demo.gr'); await p.click('text=club@glyfada-demo.gr')
await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 })
await p.goto(BASE + '/sections'); await p.getByRole('link', { name: 'Παίδων', exact: true }).first().click(); await p.waitForSelector('[data-member]', { timeout: 20000 })
console.log('readiness badges:', await p.getByText(/Χωρίς δελτίο|Έτοιμος|Χωρίς κάρτα υγείας/).count())
await p.getByRole('button', { name: 'Πρόσκληση για δελτίο' }).click()
await p.locator('[role=dialog]').getByRole('button', { name: 'Ανοιχτός σύνδεσμος τμήματος' }).click(); await p.waitForSelector('[data-new-link]', { timeout: 20000 })
const applyUrl = await p.locator('[data-new-link] a').first().getAttribute('href'); console.log('apply url:', applyUrl)
await p.screenshot({ path: '../reports/screens/live-invite.png' })

const m = await (await b.newContext({ viewport: { width: 400, height: 820 }, locale: 'el-GR' })).newPage(); m.on('pageerror', e => errors.push(e.message))
await m.goto(applyUrl); await m.waitForSelector('[data-apply-step="1"]', { timeout: 20000 })
await m.locator('input[name=who]').nth(0).check(); await m.getByRole('button', { name: 'Συνέχεια' }).click(); await m.waitForSelector('[data-apply-step="2"]')
const i = m.locator('[data-apply-step="2"] input')
await i.nth(0).fill('Κλάουντ'); await i.nth(1).fill('Δεύτερη'); await i.nth(2).fill('Κ.'); await i.nth(3).fill('2012-03-03'); await m.locator('[data-apply-step="2"] select').nth(0).selectOption('M'); await i.nth(4).fill('AK000001')
const n = await i.count(); await i.nth(n - 4).fill('Κλάουντ'); await i.nth(n - 3).fill('Γονέας'); await i.nth(n - 2).fill('demo-parent@example.com')
await m.getByRole('button', { name: 'Συνέχεια' }).click(); await m.waitForSelector('[data-apply-step="3"]')
// a tiny valid JPEG so the storage upload is real
const jpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64')
for (const d of ['photo', 'id_card', 'guardian_consent']) { await m.locator(`[data-doc="${d}"] input[type=file]`).setInputFiles({ name: `${d}.jpg`, mimeType: 'image/jpeg', buffer: fs.readFileSync(`${DOCS}/${d}.jpg`) }); await m.waitForSelector(`[data-doc="${d}"] >> text=Ανέβηκε`, { timeout: 30000 }) }
await m.waitForFunction(() => !document.body.innerText.includes('Ο AI ελέγχει'), null, { timeout: 90000 }); await m.waitForTimeout(500); console.log('docs step text:', (await m.locator('[data-apply-step="3"]').innerText()).replace(/\n/g, ' | ').slice(0, 900))
await m.screenshot({ path: '../reports/screens/live-wizard-docs.png' })
await m.getByRole('button', { name: 'Συνέχεια' }).click(); await m.waitForSelector('[data-apply-step="4"]')
const h = m.locator('[data-apply-step="4"] input'); await h.nth(0).fill('2026-09-01'); await h.nth(1).fill('2027-09-01'); await h.nth(2).fill('Δρ. Δοκιμή')
await m.getByRole('button', { name: 'Συνέχεια' }).click(); await m.waitForSelector('[data-apply-step="5"]')
await m.locator('[data-apply-step="5"] input[type=checkbox]').first().check(); await m.getByRole('button', { name: 'Αποστολή αίτησης' }).click()
await m.waitForSelector('[data-apply-done]', { timeout: 30000 }); const track = await m.locator('[data-apply-done] a').first().getAttribute('href'); console.log('track url:', track)
await m.goto(track); await m.waitForSelector('[data-track-status]', { timeout: 20000 }); console.log('track status:', await m.locator('[data-track-status]').getAttribute('data-track-status'))
await m.screenshot({ path: '../reports/screens/live-track.png', fullPage: true })

await p.goto(BASE + '/licenses?status=athlete'); await p.waitForSelector('table', { timeout: 20000 }); await p.waitForTimeout(1500)
const row = p.locator('tbody tr').filter({ hasText: 'Κλάουντ' }); console.log('athlete rows:', await row.count())
await row.first().locator('a').first().click(); await p.waitForSelector('[data-via="athlete"]', { timeout: 20000 })
await p.locator('[data-action=ai]').click(); await p.waitForSelector('[data-ai-check]', { timeout: 90000 }); await p.waitForTimeout(800); console.log('ai badges:', await p.locator('[data-ai-check]').evaluateAll(els => els.map(e => e.getAttribute('data-ai-check') + ' — ' + e.getAttribute('title'))))
await p.locator('[data-action=submit]').click(); await p.waitForTimeout(2500); console.log('after confirm has Υποβλήθηκε:', (await p.locator('body').innerText()).includes('Υποβλήθηκε'))
await p.screenshot({ path: '../reports/screens/live-license-athlete.png', fullPage: true })
console.log('page errors:', errors)
await b.close()
