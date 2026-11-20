import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import * as XLSX from 'xlsx'
import { licenses, orgs } from '@/api'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, Empty, statusTone, Field } from '@/components/ui'
import { fmtDate, fullName, isMinor } from '@/lib/format'
import { useToast } from '@/lib/toast'

const QUEUE = ['submitted', 'under_review', 'approved']
const ALL = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'issued', 'expired', 'revoked']

export default function Licenses() {
  const { t } = useTranslation()
  const a = useAuth(); const orgId = a.orgId!
  const qc = useQueryClient(); const toast = useToast()
  const [sp, setSp] = useSearchParams()
  const statusParam = sp.get('status') ?? (a.isStaff ? 'queue' : 'all')
  const [club, setClub] = useState(a.clubId ?? '')
  const [search, setSearch] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [renewOpen, setRenewOpen] = useState(false)
  const [renewSeason, setRenewSeason] = useState('')
  const [busy, setBusy] = useState(false)
  const root = useQuery({ queryKey: ['root', orgId], queryFn: () => orgs.rootOf(orgId) })
  const clubs = useQuery({ queryKey: ['clubs', orgId], enabled: !a.clubId, queryFn: () => orgs.clubsOf(orgId) })
  const seasons = useQuery({ queryKey: ['seasons-root', root.data], enabled: !!root.data, queryFn: () => orgs.seasons(root.data!) })
  const settings = useQuery({ queryKey: ['ui-settings', orgId], queryFn: () => orgs.uiSettings(orgId) })
  const applyOn = settings.data?.applications_from_athletes !== false   // 07 §4
  const statuses = statusParam === 'queue' ? QUEUE : statusParam === 'all' ? undefined : statusParam === 'athlete' ? ['draft', 'rejected'] : [statusParam]
  const list = useQuery({ queryKey: ['licenses', orgId, root.data, club, statusParam], enabled: !!root.data, queryFn: () => licenses.list({ orgId, issuerId: root.data!, clubId: club || null, status: statuses }) })
  const rows = useMemo(() => (list.data?.rows ?? []).filter(l => (statusParam !== 'athlete' || l.submitted_via === 'athlete') && (!search || fullName(l.person).toLowerCase().includes(search.toLowerCase()) || (l.license_no ?? '').includes(search))), [list.data, search, statusParam])
  const inv = () => qc.invalidateQueries({ queryKey: ['licenses'] })

  async function bulk(action: string) {
    setBusy(true)
    try {
      const r = await licenses.bulk([...sel], action)
      const ok = r.filter(x => x.ok).length
      toast(t('licenses.bulkResult', { ok, failed: r.length - ok }) + (r.length - ok ? ' — ' + r.filter(x => !x.ok).map(x => x.error).slice(0, 2).join('; ') : ''))
      setSel(new Set()); inv()
    } finally { setBusy(false) }
  }
  async function renew() {
    setBusy(true)
    try {
      const r = await licenses.renew([...sel], renewSeason)
      const ok = r.filter(x => x.ok).length
      toast(t('licenses.bulkResult', { ok, failed: r.length - ok }) + (r.length - ok ? ' — ' + r.filter(x => !x.ok).map(x => x.error).slice(0, 2).join('; ') : ''))
      setSel(new Set()); setRenewOpen(false); inv()
    } finally { setBusy(false) }
  }
  function exportXlsx() {
    const ws = XLSX.utils.json_to_sheet(rows.map(l => ({ 'Αριθμός': l.license_no, 'Επώνυμο': l.person?.last_name, 'Όνομα': l.person?.first_name, 'Ημ. γέννησης': l.person?.birth_date, 'Σύλλογος': l.club?.name, 'Άθλημα': l.sport?.name_el, 'Περίοδος': l.season?.name, 'Κατάσταση': t(`licenses.status.${l.status}`), 'Ισχύς έως': l.valid_to })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Δελτία'); XLSX.writeFile(wb, 'licenses.xlsx')
  }
  const toggleAll = () => setSel(sel.size === rows.length ? new Set() : new Set(rows.map(r => r.id)))
  const selRows = rows.filter(r => sel.has(r.id))
  const canApprove = a.isStaff && a.role !== 'treasurer' && selRows.length > 0 && selRows.every(r => ['submitted', 'under_review'].includes(r.status))
  const canIssue = a.isStaff && a.role !== 'treasurer' && selRows.length > 0 && selRows.every(r => r.status === 'approved')
  const canRenew = a.isStaff && a.role !== 'treasurer' && selRows.length > 0 && selRows.every(r => ['issued', 'expired'].includes(r.status))

  return (
    <>
      <PageHeader title={statusParam === 'queue' ? t('licenses.queue') : t('licenses.title')} subtitle={`${rows.length}`}
        actions={<>
          <Button variant="outline" onClick={exportXlsx}>{t('common.export')}</Button>
          {a.canWrite && a.role !== 'treasurer' && <Link to="/licenses/new"><Button>{t('licenses.new')}</Button></Link>}
        </>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select className="w-auto" value={statusParam} onChange={e => setSp({ status: e.target.value })}>
          <option value="queue">{t('licenses.queue')}</option>{applyOn && <option value="athlete">{t('apply.fromAthletes')}</option>}<option value="all">{t('common.all')}</option>
          {ALL.map(s => <option key={s} value={s}>{t(`licenses.status.${s}`)}</option>)}
        </Select>
        {!a.clubId && <Select className="w-auto max-w-xs" value={club} onChange={e => setClub(e.target.value)}><option value="">{t('common.all')} — {t('common.club')}</option>{(clubs.data ?? []).map(c => <option key={c.id} value={(c.club as { id: string }).id}>{(c.club as { name: string }).name}</option>)}</Select>}
        <Input className="max-w-xs" placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} />
        {sel.size > 0 && (
          <div className="ml-auto flex items-center gap-2 rounded-md bg-brand-50 px-3 py-1.5 text-sm">
            <span>{sel.size} {t('common.selected')}</span>
            {canApprove && <Button size="sm" loading={busy} onClick={() => bulk('approve')}>{t('licenses.actions.bulkApprove')}</Button>}
            {canIssue && <Button size="sm" variant="official" loading={busy} onClick={() => bulk('issue')}>{t('licenses.actions.bulkIssue')}</Button>}
            {canRenew && <Button size="sm" loading={busy} onClick={() => setRenewOpen(true)}>{t('licenses.actions.bulkRenew')}</Button>}
            <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>{t('common.cancel')}</Button>
          </div>
        )}
      </div>
      {list.isLoading ? <Spinner /> : rows.length === 0 ? <Empty>{statusParam === 'queue' ? t('licenses.noPending') : undefined}</Empty> : (
        <Table>
          <thead><tr>
            <Th><input type="checkbox" checked={sel.size === rows.length && rows.length > 0} onChange={toggleAll} /></Th>
            <Th>{t('licenses.number')}</Th><Th>{t('common.person')}</Th><Th>{t('common.club')}</Th><Th>{t('common.sport')}</Th><Th>{t('licenses.type')}</Th><Th>{t('common.status')}</Th><Th>{t('licenses.validTo')}</Th>
          </tr></thead>
          <tbody>{rows.map(l => (
            <tr key={l.id} className={sel.has(l.id) ? 'bg-brand-50/50' : 'hover:bg-slate-50'}>
              <Td><input type="checkbox" checked={sel.has(l.id)} onChange={() => { const s = new Set(sel); if (s.has(l.id)) s.delete(l.id); else s.add(l.id); setSel(s) }} /></Td>
              <Td className="tabular-nums">{l.license_no ?? <span className="text-slate-400">—</span>}</Td>
              <Td><Link className="font-medium text-brand-700 hover:underline" to={`/licenses/${l.id}`}>{fullName(l.person)}</Link>{isMinor(l.person?.birth_date) && <span className="ml-1 text-xs text-amber-700">({t('persons.minor')})</span>}</Td>
              <Td>{l.club?.name}</Td><Td>{l.sport?.name_el}</Td><Td>{l.license_type === 'renewal' ? t('licenses.renewal') : t('licenses.new_type')}</Td>
              <Td><Badge tone={statusTone(l.status)}>{t(`licenses.status.${l.status}`)}</Badge>{l.submitted_via === 'athlete' && <Badge tone="blue" className="ml-1">{t('apply.fromAthlete')}</Badge>}</Td><Td>{fmtDate(l.valid_to)}</Td>
            </tr>))}</tbody>
        </Table>
      )}
      <Modal open={renewOpen} onClose={() => setRenewOpen(false)} title={t('licenses.actions.bulkRenew')}>
        <div className="grid gap-3">
          <Field label={t('licenses.renewTo')}><Select value={renewSeason} onChange={e => setRenewSeason(e.target.value)}><option value="">{t('licenses.selectSeason')}</option>{(seasons.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <p className="text-xs text-slate-500">{t('licenses.healthRequired')}. {sel.size} {t('common.selected')}.</p>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRenewOpen(false)}>{t('common.cancel')}</Button><Button disabled={!renewSeason} loading={busy} onClick={renew}>{t('licenses.actions.renew')}</Button></div>
        </div>
      </Modal>
    </>
  )
}
