import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import * as XLSX from 'xlsx'
import { orgs, registry } from '@/api'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, Empty, ErrorBox } from '@/components/ui'
import { fmtDate, age, isMinor, fullName, errorMessage } from '@/lib/format'

export function PersonForm({ onDone, initial, clubId }: { onDone: (id: string) => void; initial?: Record<string, string>; clubId?: string | null }) {
  const { t } = useTranslation()
  const a = useAuth(); const orgId = a.orgId!
  const clubs = useQuery({ queryKey: ['clubs', orgId], enabled: !a.clubId, queryFn: () => orgs.clubsOf(orgId) })
  const [f, setF] = useState<Record<string, string>>({ first_name: '', last_name: '', father_name: '', birth_date: '', gender: 'M', nationality: 'GR', email: '', phone: '', id_document_type: 'id_card', id_document_no: '', legacy_no: '', home_club_org_id: clubId ?? a.clubId ?? '', ...initial })
  const [err, setErr] = useState<string | null>(null)
  const [dups, setDups] = useState<{ id: string; first_name: string; last_name: string; birth_date: string | null }[]>([])
  const editing = !!initial?.id
  useEffect(() => {
    if (editing || f.last_name.length < 3 || f.first_name.length < 2) { setDups([]); return }
    const h = setTimeout(() => registry.findDuplicates(orgId, f.last_name, f.first_name, f.birth_date || null).then(setDups).catch(() => {}), 400)
    return () => clearTimeout(h)
  }, [f.last_name, f.first_name, f.birth_date, orgId, editing])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    try {
      const payload = { ...f, birth_date: f.birth_date || null, home_club_org_id: f.home_club_org_id || null, email: f.email || null, phone: f.phone || null, id_document_no: f.id_document_no || null, legacy_no: f.legacy_no || null, father_name: f.father_name || null }
      delete (payload as Record<string, unknown>).id
      if (editing) { await registry.updatePerson(initial!.id, payload); onDone(initial!.id) }
      else { const r = await registry.createPerson({ ...payload, managed_by_org_id: orgId }); onDone(r.id) }
    } catch (e) { setErr(errorMessage(e)) }
  }
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <Field label={t('persons.lastName')} required><Input required value={f.last_name} onChange={set('last_name')} /></Field>
      <Field label={t('persons.firstName')} required><Input required value={f.first_name} onChange={set('first_name')} /></Field>
      <Field label={t('persons.fatherName')}><Input value={f.father_name} onChange={set('father_name')} /></Field>
      <Field label={t('persons.birthDate')} hint={f.birth_date && isMinor(f.birth_date) ? <span className="text-amber-700">{t('persons.minorNeedsGuardian')}</span> : undefined}><Input type="date" value={f.birth_date} onChange={set('birth_date')} /></Field>
      <Field label={t('persons.gender')}><Select value={f.gender} onChange={set('gender')}><option value="M">{t('persons.M')}</option><option value="F">{t('persons.F')}</option></Select></Field>
      <Field label={t('persons.nationality')}><Input value={f.nationality} onChange={set('nationality')} /></Field>
      {!a.clubId && <Field label={t('persons.homeClub')} className="sm:col-span-2"><Select value={f.home_club_org_id} onChange={set('home_club_org_id')}><option value="">—</option>{(clubs.data ?? []).map(c => <option key={c.id} value={(c.club as { id: string }).id}>{(c.club as { name: string }).name}</option>)}</Select></Field>}
      <Field label={t('persons.idType')}><Select value={f.id_document_type} onChange={set('id_document_type')}><option value="id_card">{t('persons.id_card')}</option><option value="passport">{t('persons.passport')}</option></Select></Field>
      <Field label={t('persons.idNo')}><Input value={f.id_document_no} onChange={set('id_document_no')} /></Field>
      <Field label={t('common.email')}><Input type="email" value={f.email} onChange={set('email')} /></Field>
      <Field label={t('common.phone')}><Input value={f.phone} onChange={set('phone')} /></Field>
      <Field label={t('persons.legacyNo')}><Input value={f.legacy_no} onChange={set('legacy_no')} /></Field>
      {dups.length > 0 && <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:col-span-2">
        {dups.map(d => <div key={d.id}>{t('persons.dedupeWarning', { name: fullName(d), dob: fmtDate(d.birth_date) })} — <Link to={`/persons/${d.id}`} className="underline">{t('common.details')}</Link></div>)}
      </div>}
      {err && <div className="sm:col-span-2"><ErrorBox error={err} /></div>}
      <div className="flex justify-end gap-2 sm:col-span-2"><Button type="submit">{editing ? t('common.save') : t('common.create')}</Button></div>
    </form>
  )
}

export default function Persons() {
  const { t } = useTranslation()
  const a = useAuth(); const orgId = a.orgId!
  const nav = useNavigate(); const qc = useQueryClient()
  const [sp, setSp] = useSearchParams()
  const [search, setSearch] = useState('')
  const [club, setClub] = useState(a.clubId ?? '')
  const [minorsOnly, setMinorsOnly] = useState(false)
  const clubs = useQuery({ queryKey: ['clubs', orgId], enabled: !a.clubId, queryFn: () => orgs.clubsOf(orgId) })
  const persons = useQuery({ queryKey: ['persons', orgId, club, search], queryFn: () => registry.persons({ orgId, clubId: club || null, search }) })
  const open = sp.get('new') === '1'
  const canEdit = a.canWrite && a.role !== 'treasurer'
  const rows = (persons.data?.rows ?? []).filter(p => !minorsOnly || isMinor(p.birth_date))

  function exportXlsx() {
    const ws = XLSX.utils.json_to_sheet(rows.map(p => ({ 'Επώνυμο': p.last_name, 'Όνομα': p.first_name, 'Πατρώνυμο': p.father_name, 'Ημ. γέννησης': p.birth_date, 'Φύλο': p.gender, 'Σύλλογος': p.home_club?.name, 'Αρ. εγγράφου': p.id_document_no, 'Παλιός αριθμός': p.legacy_no })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Αθλητές'); XLSX.writeFile(wb, 'athletes.xlsx')
  }

  return (
    <>
      <PageHeader title={t('persons.title')} subtitle={t('common.showing', { n: rows.length, total: persons.data?.count ?? 0 })}
        actions={<><Button variant="outline" onClick={exportXlsx}>{t('common.export')}</Button>{canEdit && <Button onClick={() => setSp({ new: '1' })}>{t('persons.new')}</Button>}</>} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} />
        {!a.clubId && <Select className="max-w-xs" value={club} onChange={e => setClub(e.target.value)}><option value="">{t('common.all')} — {t('common.club')}</option>{(clubs.data ?? []).map(c => <option key={c.id} value={(c.club as { id: string }).id}>{(c.club as { name: string }).name}</option>)}</Select>}
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={minorsOnly} onChange={e => setMinorsOnly(e.target.checked)} /> {t('persons.minor')}</label>
      </div>
      {persons.isLoading ? <Spinner /> : rows.length === 0 ? <Empty /> : (
        <Table>
          <thead><tr><Th>{t('common.name')}</Th><Th>{t('persons.birthDate')}</Th><Th>{t('persons.age')}</Th><Th>{t('persons.gender')}</Th><Th>{t('common.club')}</Th><Th>{t('persons.legacyNo')}</Th></tr></thead>
          <tbody>{rows.map(p => (
            <tr key={p.id} className="hover:bg-slate-50">
              <Td><Link className="font-medium text-brand-700 hover:underline" to={`/persons/${p.id}`}>{fullName(p)}</Link> {isMinor(p.birth_date) && <Badge tone="amber">{t('persons.minor')}</Badge>}</Td>
              <Td>{fmtDate(p.birth_date)}</Td><Td>{age(p.birth_date) ?? '—'}</Td><Td>{p.gender ? t(`persons.${p.gender}`) : '—'}</Td><Td>{p.home_club?.name ?? '—'}</Td><Td className="text-xs">{p.legacy_no ?? '—'}</Td>
            </tr>))}</tbody>
        </Table>
      )}
      <Modal open={open} onClose={() => setSp({})} title={t('persons.new')} wide>
        <PersonForm clubId={sp.get('club')} onDone={async (id) => {
          const section = sp.get('section')
          if (section) await registry.addSectionMember({ section_id: section, person_id: id, member_role: 'athlete' })
          qc.invalidateQueries({ queryKey: ['persons'] }); nav(`/persons/${id}`)
        }} />
      </Modal>
    </>
  )
}
