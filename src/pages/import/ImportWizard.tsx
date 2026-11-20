import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import * as XLSX from 'xlsx'
import { imports, orgs, registry } from '@/api'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Card, Field, PageHeader, Select, Spinner, Table, Td, Th, Tabs, Input } from '@/components/ui'
import { normalizeGr, fmtDateTime } from '@/lib/format'
import { supabase } from '@/lib/supabase'

type Kind = 'clubs' | 'persons'
type Row = Record<string, string>
type Issue = { level: 'error' | 'warning'; msg: string }
type Preview = { row_no: number; raw: Row; normalized: Record<string, string | null>; status: 'ok' | 'warning' | 'error' | 'duplicate'; issues: Issue[]; matched_id: string | null; matched_label?: string; resolution: 'create' | 'update' | 'skip' }

const FIELDS: Record<Kind, { key: string; label: string; aliases: string[]; required?: boolean }[]> = {
  clubs: [
    { key: 'name', label: 'Επωνυμία', aliases: ['επωνυμια', 'ονομα', 'συλλογος', 'σωματειο', 'name', 'club'], required: true },
    { key: 'short_name', label: 'Σύντομο', aliases: ['συντομο', 'short'] },
    { key: 'vat_number', label: 'ΑΦΜ', aliases: ['αφμ', 'vat', 'afm'] },
    { key: 'gga_registry_no', label: 'Αρ. ΓΓΑ', aliases: ['γγα', 'μητρωο', 'gga'] },
    { key: 'address_city', label: 'Πόλη', aliases: ['πολη', 'city', 'εδρα'] },
    { key: 'email', label: 'Email', aliases: ['email', 'e-mail', 'mail'] },
    { key: 'phone', label: 'Τηλέφωνο', aliases: ['τηλεφωνο', 'τηλ', 'phone', 'κινητο'] },
    { key: 'member_no', label: 'Αρ. μητρώου στον φορέα', aliases: ['αρ. μητρωου', 'μελος', 'member'] },
  ],
  persons: [
    { key: 'last_name', label: 'Επώνυμο', aliases: ['επωνυμο', 'επιθετο', 'last', 'surname'], required: true },
    { key: 'first_name', label: 'Όνομα', aliases: ['ονομα', 'first', 'name'], required: true },
    { key: 'father_name', label: 'Πατρώνυμο', aliases: ['πατρωνυμο', 'πατερας', 'father'] },
    { key: 'birth_date', label: 'Ημ. γέννησης', aliases: ['γεννησ', 'ημ. γεν', 'birth', 'dob', 'ημερομηνια'] },
    { key: 'gender', label: 'Φύλο', aliases: ['φυλο', 'gender', 'sex'] },
    { key: 'club', label: 'Σύλλογος', aliases: ['συλλογος', 'σωματειο', 'club', 'ομαδα'] },
    { key: 'id_document_no', label: 'Αρ. ταυτότητας', aliases: ['ταυτοτητα', 'αδτ', 'id'] },
    { key: 'legacy_no', label: 'Παλιός αρ. δελτίου', aliases: ['δελτιο', 'αρ. δελτιου', 'μητρωο', 'license'] },
    { key: 'email', label: 'Email', aliases: ['email', 'mail'] },
    { key: 'phone', label: 'Τηλέφωνο', aliases: ['τηλ', 'phone', 'κινητο'] },
    { key: 'guardian_name', label: 'Κηδεμόνας', aliases: ['κηδεμον', 'γονεας', 'guardian', 'parent'] },
    { key: 'guardian_phone', label: 'Τηλ. κηδεμόνα', aliases: ['τηλ. κηδ', 'τηλεφωνο γονεα', 'guardian phone'] },
    { key: 'role', label: 'Ιδιότητα (αθλητής/προπονητής)', aliases: ['ιδιοτητα', 'ρολος', 'role'] },
  ],
}

function parseDate(v: string): string | null {
  if (!v) return null
  const s = v.trim()
  let m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/)
  if (m) { const y = m[3].length === 2 ? (Number(m[3]) > 30 ? '19' : '20') + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`
  if (/^\d{5}$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000); return d.toISOString().slice(0, 10) }  // Excel serial
  return 'INVALID'
}
const parseGender = (v: string) => { const s = normalizeGr(v.trim()); if (!s) return null; if (['Α', 'ΑΡΡΕΝ', 'ΑΓΟΡΙ', 'M', 'MALE', 'ΑΝΔΡΑΣ'].some(x => s.startsWith(x))) return 'M'; if (['Θ', 'ΘΗΛΥ', 'ΚΟΡΙΤΣΙ', 'F', 'FEMALE', 'ΓΥΝΑΙΚΑ'].some(x => s.startsWith(x))) return 'F'; return null }

export default function ImportWizard() {
  const { t } = useTranslation()
  const a = useAuth(); const orgId = a.orgId!
  const qc = useQueryClient()
  const [tab, setTab] = useState<'wizard' | 'history'>('wizard')
  const [step, setStep] = useState(1)
  const [kind, setKind] = useState<Kind>('persons')
  const [fileName, setFileName] = useState('')
  const [sheets, setSheets] = useState<Record<string, Row[]>>({})
  const [sheet, setSheet] = useState('')
  const [mapping, setMapping] = useState<Record<string, string>>({})   // field -> column
  const [targetClub, setTargetClub] = useState('')
  const [targetSection, setTargetSection] = useState('')
  const [preview, setPreview] = useState<Preview[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null)
  const clubs = useQuery({ queryKey: ['clubs', orgId], queryFn: () => orgs.clubsOf(orgId) })
  const sections = useQuery({ queryKey: ['sections', orgId, targetClub], enabled: !!targetClub, queryFn: () => registry.sections(orgId, targetClub) })
  const history = useQuery({ queryKey: ['imports', orgId], queryFn: () => imports.list(orgId) })
  const rows = sheets[sheet] ?? []
  const columns = useMemo(() => rows.length ? Object.keys(rows[0]) : [], [rows])
  const fields = FIELDS[kind]

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([fields.map(f => f.label), kind === 'persons' ? ['Παπαδόπουλος', 'Νίκος', 'Γιώργος', '15/03/2011', 'Α', 'Α.Ο. Γλυφάδας', 'ΑΚ123456', 'OLD-1234', '', '6900000000', 'Μαρία Παπαδοπούλου', '6900000001', 'Αθλητής'] : ['Α.Ο. Παράδειγμα', 'ΑΟΠ', '099123456', 'ΓΓΑ-1234', 'Αθήνα', 'info@example.gr', '2101234567', '015']])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, kind === 'persons' ? 'Αθλητές' : 'Σύλλογοι'); XLSX.writeFile(wb, `template-${kind}.xlsx`)
  }
  async function onFile(f: File) {
    const buf = await f.arrayBuffer(); const wb = XLSX.read(buf, { type: 'array', cellDates: false })
    const out: Record<string, Row[]> = {}
    for (const n of wb.SheetNames) { const data = XLSX.utils.sheet_to_json<Row>(wb.Sheets[n], { defval: '', raw: false }); if (data.length) out[n] = data.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [String(k).trim(), String(v ?? '').trim()]))) }
    setSheets(out); const first = Object.keys(out)[0]; setSheet(first); setFileName(f.name)
    // auto-detect mapping
    const cols = out[first] ? Object.keys(out[first][0]) : []
    const m: Record<string, string> = {}
    for (const fld of FIELDS[kind]) { const c = cols.find(col => { const n = normalizeGr(col).toLowerCase(); return fld.aliases.some(al => n.includes(normalizeGr(al).toLowerCase())) && !Object.values(m).includes(col) }); if (c) m[fld.key] = c }
    setMapping(m); setStep(2)
  }

  async function buildPreview() {
    setBusy(true)
    const get = (r: Row, k: string) => (mapping[k] ? r[mapping[k]] ?? '' : '')
    const clubByName = new Map<string, { id: string; name: string }>()
    for (const c of clubs.data ?? []) { const cl = c.club as { id: string; name: string; short_name: string | null }; clubByName.set(normalizeGr(cl.name), cl); if (cl.short_name) clubByName.set(normalizeGr(cl.short_name), cl) }
    const seenInFile = new Set<string>()
    const out: Preview[] = []
    // existing persons for dedupe (one query, then in-memory)
    const existing = kind === 'persons' ? (await registry.persons({ orgId, limit: 5000 })).rows : []
    const exByKey = new Map<string, { id: string; first_name: string; last_name: string; birth_date: string | null }>()
    for (const p of existing) exByKey.set(`${normalizeGr(p.last_name)}|${normalizeGr(p.first_name)}|${p.birth_date ?? ''}`, p)
    const exByDoc = new Map(existing.filter(p => p.id_document_no).map(p => [p.id_document_no as string, p]))
    rows.forEach((r, i) => {
      const issues: Issue[] = []; const n: Record<string, string | null> = {}
      let matched: string | null = null; let matchedLabel: string | undefined
      if (kind === 'persons') {
        n.last_name = get(r, 'last_name').trim(); n.first_name = get(r, 'first_name').trim(); n.father_name = get(r, 'father_name') || null
        if (!n.last_name || !n.first_name) issues.push({ level: 'error', msg: t('import.missingName') })
        const bd = parseDate(get(r, 'birth_date')); if (bd === 'INVALID') { issues.push({ level: 'error', msg: t('import.badDate') }); n.birth_date = null } else n.birth_date = bd
        n.gender = parseGender(get(r, 'gender'))
        const clubName = get(r, 'club'); const cl = clubName ? clubByName.get(normalizeGr(clubName)) : null
        n.home_club_org_id = cl?.id ?? targetClub ?? null
        if (!n.home_club_org_id) issues.push({ level: 'error', msg: t('import.missingClub') })
        else if (clubName && !cl && !targetClub) issues.push({ level: 'error', msg: t('import.unknownClub', { name: clubName }) })
        else if (clubName && !cl) issues.push({ level: 'warning', msg: t('import.unknownClub', { name: clubName }) })
        n.id_document_no = get(r, 'id_document_no') || null; n.legacy_no = get(r, 'legacy_no') || null; n.email = get(r, 'email') || null; n.phone = get(r, 'phone') || null
        n.guardian_name = get(r, 'guardian_name') || null; n.guardian_phone = get(r, 'guardian_phone') || null
        const role = normalizeGr(get(r, 'role')); n.role = role.startsWith('ΠΡΟΠ') || role.startsWith('COACH') ? 'coach' : 'athlete'
        const key = `${normalizeGr(n.last_name)}|${normalizeGr(n.first_name)}|${n.birth_date ?? ''}`
        if (seenInFile.has(key)) issues.push({ level: 'error', msg: t('import.dupInFile') }); seenInFile.add(key)
        const ex = exByKey.get(key) ?? (n.id_document_no ? exByDoc.get(n.id_document_no) : undefined)
        if (ex) { matched = ex.id; matchedLabel = `${ex.last_name} ${ex.first_name}`; issues.push({ level: 'warning', msg: t('import.existing', { name: matchedLabel }) }) }
      } else {
        n.name = get(r, 'name').trim(); if (!n.name) issues.push({ level: 'error', msg: t('import.missingName') })
        n.short_name = get(r, 'short_name') || null; n.vat_number = get(r, 'vat_number').replace(/\D/g, '') || null
        if (n.vat_number && n.vat_number.length !== 9) issues.push({ level: 'warning', msg: t('import.badVat') })
        n.gga_registry_no = get(r, 'gga_registry_no') || null; n.address_city = get(r, 'address_city') || null; n.email = get(r, 'email') || null; n.phone = get(r, 'phone') || null; n.member_no = get(r, 'member_no') || null
        const key = normalizeGr(n.name); if (seenInFile.has(key)) issues.push({ level: 'error', msg: t('import.dupInFile') }); seenInFile.add(key)
        const ex = clubByName.get(key); if (ex) { matched = ex.id; matchedLabel = ex.name; issues.push({ level: 'warning', msg: t('import.existing', { name: ex.name }) }) }
      }
      const hasErr = issues.some(x => x.level === 'error')
      out.push({ row_no: i + 2, raw: r, normalized: n, issues, matched_id: matched, matched_label: matchedLabel, status: hasErr ? 'error' : matched ? 'duplicate' : issues.length ? 'warning' : 'ok', resolution: hasErr ? 'skip' : matched ? 'skip' : 'create' })
    })
    setPreview(out); setBusy(false); setStep(3)
  }

  async function commit() {
    setBusy(true)
    const batch = await imports.createBatch({ org_id: orgId, kind, file_name: fileName, status: 'previewed', column_mapping: mapping, options: { target_club: targetClub || null, target_section: targetSection || null }, stats: { rows: preview.length } })
    let created = 0, updated = 0, skipped = 0
    const rowsOut: Record<string, unknown>[] = []
    for (const p of preview) {
      let created_id: string | null = null
      try {
        if (p.resolution === 'skip') { skipped++ }
        else if (kind === 'persons') {
          const n = p.normalized
          const payload = { first_name: n.first_name, last_name: n.last_name, father_name: n.father_name, birth_date: n.birth_date, gender: n.gender, home_club_org_id: n.home_club_org_id, id_document_type: n.id_document_no ? 'id_card' : null, id_document_no: n.id_document_no, legacy_no: n.legacy_no, email: n.email, phone: n.phone }
          if (p.resolution === 'update' && p.matched_id) { await registry.updatePerson(p.matched_id, payload); created_id = p.matched_id; updated++ }
          else { const r = await registry.createPerson({ ...payload, managed_by_org_id: orgId }); created_id = r.id; created++ }
          if (n.guardian_name && p.resolution === 'create') {
            const [gl, ...gf] = n.guardian_name.split(' ').reverse(); const g = await registry.createPerson({ managed_by_org_id: orgId, home_club_org_id: n.home_club_org_id, last_name: gl, first_name: gf.reverse().join(' ') || '—', phone: n.guardian_phone })
            await registry.addGuardian({ ward_person_id: created_id, guardian_person_id: g.id, relation: 'parent' })
            await registry.addConsent({ person_id: created_id, org_id: orgId, consent_type: 'data_processing', given_by: 'guardian', given_by_person_id: g.id, method: 'import_declared' })
          }
          if (targetSection && created_id) { try { await registry.addSectionMember({ section_id: targetSection, person_id: created_id, member_role: n.role ?? 'athlete' }) } catch { /* already member */ } }
        } else {
          const n = p.normalized
          if (p.resolution === 'update' && p.matched_id) { await orgs.update(p.matched_id, { short_name: n.short_name, vat_number: n.vat_number, gga_registry_no: n.gga_registry_no, address_city: n.address_city, email: n.email, phone: n.phone }); created_id = p.matched_id; updated++ }
          else { created_id = await orgs.createClub(orgId, { name: n.name, short_name: n.short_name, vat_number: n.vat_number, gga_registry_no: n.gga_registry_no, address_city: n.address_city, email: n.email, phone: n.phone }, null); created++ }
        }
      } catch (e) { p.issues.push({ level: 'error', msg: String((e as Error).message) }); skipped++ }
      rowsOut.push({ batch_id: batch.id, org_id: orgId, row_no: p.row_no, raw: p.raw, normalized: p.normalized, status: p.status, issues: p.issues, matched_id: p.matched_id, resolution: p.resolution, created_id })
    }
    for (let i = 0; i < rowsOut.length; i += 200) await imports.addRows(rowsOut.slice(i, i + 200))
    await imports.updateBatch(batch.id, { status: 'committed', committed_at: new Date().toISOString(), stats: { rows: preview.length, created, updated, skipped } })
    await supabase.from('notifications').insert({ org_id: orgId, kind: 'import_done', payload: { batch_id: batch.id, created, updated, skipped } })
    qc.invalidateQueries({ queryKey: ['persons'] }); qc.invalidateQueries({ queryKey: ['clubs'] }); qc.invalidateQueries({ queryKey: ['imports'] })
    setResult({ created, updated, skipped }); setBusy(false); setStep(4)
  }

  const counts = preview.reduce((m, p) => { m[p.status] = (m[p.status] ?? 0) + 1; return m }, {} as Record<string, number>)
  const toCommit = preview.filter(p => p.resolution !== 'skip').length

  return (
    <>
      <PageHeader title={t('import.title')} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'wizard', label: t('import.title') }, { id: 'history', label: t('import.history'), count: history.data?.length }]} />
      {tab === 'history' && (
        <Table><thead><tr><Th>{t('common.date')}</Th><Th>{t('import.kind')}</Th><Th>{t('common.name')}</Th><Th>{t('common.status')}</Th><Th>{t('import.rows')}</Th></tr></thead>
          <tbody>{(history.data ?? []).map(b => <tr key={b.id}><Td className="text-xs">{fmtDateTime(b.created_at)}</Td><Td>{t(`import.${b.kind}`)}</Td><Td className="text-xs">{b.file_name}</Td><Td><Badge tone={b.status === 'committed' ? 'green' : 'gray'}>{b.status}</Badge></Td><Td className="text-xs">{JSON.stringify(b.stats)}</Td></tr>)}</tbody></Table>
      )}
      {tab === 'wizard' && (
        <>
          <div className="mb-4 flex gap-2 text-xs">{[1, 2, 3, 4].map(s => <span key={s} className={`rounded-full px-3 py-1 ${step === s ? 'bg-brand-600 text-white' : step > s ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{t(`import.step${s}`)}</span>)}</div>
          {step === 1 && (
            <Card>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('import.kind')}><Select value={kind} onChange={e => setKind(e.target.value as Kind)}><option value="persons">{t('import.persons')}</option><option value="clubs">{t('import.clubs')}</option></Select></Field>
                <div className="flex items-end"><Button variant="outline" onClick={downloadTemplate}>{t('import.template')}</Button></div>
                {kind === 'persons' && <>
                  <Field label={t('import.targetClub')} hint="Αν το Excel δεν έχει στήλη «Σύλλογος»"><Select value={targetClub} onChange={e => { setTargetClub(e.target.value); setTargetSection('') }}><option value="">—</option>{(clubs.data ?? []).map(c => <option key={c.id} value={(c.club as { id: string }).id}>{(c.club as { name: string }).name}</option>)}</Select></Field>
                  <Field label={t('import.targetSection')}><Select value={targetSection} onChange={e => setTargetSection(e.target.value)} disabled={!targetClub}><option value="">—</option>{(sections.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
                </>}
                <Field label={t('import.drop')} className="sm:col-span-2"><Input type="file" accept=".xlsx,.xls,.csv" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} /></Field>
              </div>
            </Card>
          )}
          {step === 2 && (
            <Card title={`${fileName} · ${rows.length} ${t('import.rows')}`} actions={Object.keys(sheets).length > 1 && <Select className="w-auto" value={sheet} onChange={e => setSheet(e.target.value)}>{Object.keys(sheets).map(s => <option key={s}>{s}</option>)}</Select>}>
              <p className="mb-3 text-xs text-slate-500">{t('import.autoDetected')}</p>
              <Table><thead><tr><Th>{t('import.field')}</Th><Th>{t('import.column')}</Th><Th>Παράδειγμα</Th></tr></thead>
                <tbody>{fields.map(f => (
                  <tr key={f.key}><Td>{f.label}{f.required && <span className="text-red-500"> *</span>}</Td>
                    <Td><Select value={mapping[f.key] ?? ''} onChange={e => setMapping({ ...mapping, [f.key]: e.target.value })}><option value="">{t('import.ignore')}</option>{columns.map(c => <option key={c} value={c}>{c}</option>)}</Select></Td>
                    <Td className="text-xs text-slate-500">{mapping[f.key] ? rows[0]?.[mapping[f.key]] : ''}</Td></tr>))}</tbody></Table>
              <div className="mt-3 flex justify-between"><Button variant="outline" onClick={() => setStep(1)}>{t('common.back')}</Button><Button loading={busy} disabled={fields.some(f => f.required && !mapping[f.key])} onClick={buildPreview}>{t('common.next')}</Button></div>
            </Card>
          )}
          {step === 3 && (
            <Card title={<span>{t('import.step3')}: <Badge tone="green">{t('import.ok')} {counts.ok ?? 0}</Badge> <Badge tone="amber">{t('import.warning')} {counts.warning ?? 0}</Badge> <Badge tone="blue">{t('import.duplicate')} {counts.duplicate ?? 0}</Badge> <Badge tone="red">{t('import.error')} {counts.error ?? 0}</Badge></span>}>
              <p className="mb-3 text-xs text-slate-500">{t('import.hint')}</p>
              <div className="max-h-[60vh] overflow-auto">
                <Table><thead><tr><Th>#</Th><Th>{t('common.status')}</Th><Th>{t('common.name')}</Th><Th>{kind === 'persons' ? t('persons.birthDate') : t('clubs.vat')}</Th><Th>{t('import.issues')}</Th><Th>{t('import.resolution')}</Th></tr></thead>
                  <tbody>{preview.map(p => (
                    <tr key={p.row_no} className={p.status === 'error' ? 'bg-red-50' : p.status === 'duplicate' ? 'bg-blue-50' : p.status === 'warning' ? 'bg-amber-50' : ''}>
                      <Td className="text-xs text-slate-500">{p.row_no}</Td>
                      <Td><Badge tone={p.status === 'ok' ? 'green' : p.status === 'error' ? 'red' : p.status === 'duplicate' ? 'blue' : 'amber'}>{t(`import.${p.status}`)}</Badge></Td>
                      <Td className="font-medium">{kind === 'persons' ? `${p.normalized.last_name} ${p.normalized.first_name}` : p.normalized.name}</Td>
                      <Td className="text-xs">{kind === 'persons' ? p.normalized.birth_date ?? '—' : p.normalized.vat_number ?? '—'}</Td>
                      <Td className="text-xs">{p.issues.map((x, i) => <div key={i} className={x.level === 'error' ? 'text-red-700' : 'text-amber-700'}>{x.msg}</div>)}</Td>
                      <Td>{p.status === 'error' ? <span className="text-xs text-slate-400">{t('import.skip')}</span> : (
                        <Select className="py-1 text-xs" value={p.resolution} onChange={e => setPreview(preview.map(x => x.row_no === p.row_no ? { ...x, resolution: e.target.value as Preview['resolution'] } : x))}>
                          <option value="create">{t('import.create')}</option>{p.matched_id && <option value="update">{t('import.update')}</option>}<option value="skip">{t('import.skip')}</option>
                        </Select>)}</Td>
                    </tr>))}</tbody></Table>
              </div>
              <div className="mt-3 flex justify-between"><Button variant="outline" onClick={() => setStep(2)}>{t('common.back')}</Button><Button loading={busy} disabled={toCommit === 0} onClick={commit}>{t('import.commit', { n: toCommit })}</Button></div>
            </Card>
          )}
          {step === 4 && result && (
            <Card title={t('import.done')}>
              <div className="flex gap-6 text-sm"><span><b>{result.created}</b> {t('import.created')}</span><span><b>{result.updated}</b> {t('import.updated')}</span><span><b>{result.skipped}</b> {t('import.skipped')}</span></div>
              <div className="mt-4"><Button onClick={() => { setStep(1); setPreview([]); setResult(null); setSheets({}) }}>{t('import.title')}</Button></div>
            </Card>
          )}
          {busy && step === 3 && <Spinner />}
        </>
      )}
    </>
  )
}
