import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { registry, licenses, rosters, events, transfers } from '@/api'
import { rosterTone } from '@/pages/competitions/Roster'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, Empty, statusTone, ErrorBox } from '@/components/ui'
import { fmtDate, age, isMinor, fullName, daysUntil, errorMessage, fmtDateTime, fmtResult } from '@/lib/format'
import { PersonForm } from './Persons'
import { DEV_AUTH } from '@/lib/supabase'
import { useToast } from '@/lib/toast'

const DOC_TYPES = ['id_card', 'birth_cert', 'photo', 'guardian_consent', 'health_cert', 'other']

export default function PersonDetail() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const a = useAuth(); const orgId = a.orgId!
  const qc = useQueryClient(); const toast = useToast()
  const p = useQuery({ queryKey: ['person', id], queryFn: () => registry.person(id!) })
  const guardians = useQuery({ queryKey: ['guardians', id], queryFn: () => registry.guardians(id!) })
  const consents = useQuery({ queryKey: ['consents', id], queryFn: () => registry.consents(id!) })
  const docs = useQuery({ queryKey: ['docs', id], queryFn: () => registry.documents(id!) })
  const hcs = useQuery({ queryKey: ['hc', id], queryFn: () => registry.healthCards(id!) })
  const lics = useQuery({ queryKey: ['licenses', 'person', id], queryFn: () => licenses.byPerson(id!) })
  const clubHistory = useQuery({ queryKey: ['club-history', id], queryFn: () => transfers.clubHistory(id!) })
  const mems = useQuery({ queryKey: ['memberships', id], queryFn: () => registry.membershipsOf(id!) })
  const activity = useQuery({ queryKey: ['person-activity', id], queryFn: () => rosters.personActivity(id!) })
  const perf = useQuery({ queryKey: ['person-results', id], queryFn: () => events.personResults(id!) })
  const [edit, setEdit] = useState(false)
  const [gModal, setG] = useState(false)
  const [gForm, setGForm] = useState({ first_name: '', last_name: '', email: '', phone: '', relation: 'parent' })
  const [cType, setCType] = useState('data_processing')
  const [docModal, setDoc] = useState(false)
  const [docForm, setDocForm] = useState<{ doc_type: string; file: File | null; expires_at: string }>({ doc_type: 'id_card', file: null, expires_at: '' })
  const [hcModal, setHc] = useState(false)
  const [hcForm, setHcForm] = useState({ issued_on: '', expires_on: '', issuer_name: '' })
  const [err, setErr] = useState<string | null>(null)
  const canEdit = a.canWrite && a.role !== 'treasurer'
  const isStaff = a.isStaff
  const inv = () => ['person', 'guardians', 'consents', 'docs', 'hc'].forEach(k => qc.invalidateQueries({ queryKey: [k, id] }))

  if (p.isLoading || !p.data) return <Spinner />
  const person = p.data
  const minor = isMinor(person.birth_date)
  const activeHc = (hcs.data ?? []).find(h => h.status === 'valid' && daysUntil(h.expires_on) >= 0)

  async function addGuardian(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    try {
      const g = await registry.createPerson({ managed_by_org_id: person.managed_by_org_id, home_club_org_id: person.home_club_org_id, first_name: gForm.first_name, last_name: gForm.last_name, email: gForm.email || null, phone: gForm.phone || null })
      await registry.addGuardian({ ward_person_id: id, guardian_person_id: g.id, relation: gForm.relation, is_primary: (guardians.data?.length ?? 0) === 0 })
      setG(false); inv()
    } catch (e) { setErr(errorMessage(e)) }
  }
  async function addConsent() {
    const g = guardians.data?.[0]
    await registry.addConsent({ person_id: id, org_id: orgId, consent_type: cType, given_by: minor ? 'guardian' : 'self', given_by_person_id: minor ? g?.guardian_person_id : id, method: 'checkbox' })
    inv(); toast(t('common.saved'))
  }
  async function addDoc(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    try {
      let path = `${orgId}/${id}/${docForm.doc_type}-${Date.now()}`
      if (docForm.file && !DEV_AUTH) path = await registry.uploadFile('documents', path + '-' + docForm.file.name, docForm.file)
      await registry.addDocument({ org_id: orgId, person_id: id, doc_type: docForm.doc_type, storage_path: path, file_name: docForm.file?.name ?? docForm.doc_type, mime_type: docForm.file?.type ?? null, size_bytes: docForm.file?.size ?? null, expires_at: docForm.expires_at || null })
      setDoc(false); inv()
    } catch (e) { setErr(errorMessage(e)) }
  }
  async function addHc(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    try { await registry.addHealthCard({ org_id: orgId, person_id: id, ...hcForm, issuer_name: hcForm.issuer_name || null }); setHc(false); inv() } catch (e) { setErr(errorMessage(e)) }
  }

  return (
    <>
      <PageHeader title={fullName(person)} subtitle={<span>{fmtDate(person.birth_date)} · {age(person.birth_date)} {t('common.days') === 'ημέρες' ? 'ετών' : 'y'} {minor && <Badge tone="amber">{t('persons.minor')}</Badge>} · {person.home_club?.name}</span>}
        actions={<>{canEdit && <Button variant="outline" onClick={() => setEdit(true)}>{t('common.edit')}</Button>}{canEdit && <Link to={`/licenses/new?person=${id}&club=${person.home_club_org_id ?? ''}`}><Button>{t('licenses.new')}</Button></Link>}</>} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('common.details')}>
          <dl className="grid grid-cols-[150px_1fr] gap-y-1.5 text-sm">
            <dt className="text-slate-500">{t('persons.fatherName')}</dt><dd>{person.father_name ?? '—'}</dd>
            <dt className="text-slate-500">{t('persons.gender')}</dt><dd>{person.gender ? t(`persons.${person.gender}`) : '—'}</dd>
            <dt className="text-slate-500">{t('persons.idType')}</dt><dd>{person.id_document_type ? t(`persons.${person.id_document_type}`) : '—'} {person.id_document_no}</dd>
            <dt className="text-slate-500">{t('common.email')}</dt><dd>{person.email ?? '—'}</dd>
            <dt className="text-slate-500">{t('common.phone')}</dt><dd>{person.phone ?? '—'}</dd>
            <dt className="text-slate-500">{t('persons.legacyNo')}</dt><dd>{person.legacy_no ?? '—'}</dd>
            <dt className="text-slate-500">{t('sections.title')}</dt><dd>{(mems.data ?? []).map(m => <div key={m.id}><Link className="text-brand-700 hover:underline" to={`/sections/${m.section?.id}`}>{m.section?.name}</Link> <span className="text-xs text-slate-500">({m.section?.club?.name}, {t(`sections.${m.member_role}`)})</span></div>)}</dd>
          </dl>
        </Card>

        <Card title={t('persons.healthCard')} actions={canEdit && <Button size="sm" variant="outline" onClick={() => setHc(true)}>{t('health.new')}</Button>}>
          {activeHc ? (
            <div className="flex items-center gap-3">
              <Badge tone={daysUntil(activeHc.expires_on) < 30 ? 'amber' : 'green'}>{t('health.valid')}</Badge>
              <span className="text-sm">{t('health.expiresOn')}: <b>{fmtDate(activeHc.expires_on)}</b> ({t('health.expiring', { n: daysUntil(activeHc.expires_on) })})</span>
              {activeHc.verified_at ? <Badge tone="blue">{t('health.verified')}</Badge> : isStaff && <Button size="sm" variant="ghost" onClick={async () => { await registry.verifyHealthCard(activeHc.id); inv() }}>{t('health.verify')}</Button>}
            </div>
          ) : <div className="text-sm text-red-700">{t('health.noCard')}</div>}
          {(hcs.data ?? []).length > 1 && <ul className="mt-3 space-y-1 text-xs text-slate-500">{(hcs.data ?? []).filter(h => h.id !== activeHc?.id).map(h => <li key={h.id}>{fmtDate(h.issued_on)} → {fmtDate(h.expires_on)} · {t(`health.${h.status}`)}</li>)}</ul>}
        </Card>

        <Card title={t('persons.guardians')} actions={canEdit && <Button size="sm" variant="outline" onClick={() => setG(true)}>{t('persons.addGuardian')}</Button>}>
          {(guardians.data ?? []).length === 0 ? <div className={`text-sm ${minor ? 'text-red-700' : 'text-slate-500'}`}>{minor ? t('persons.minorNeedsGuardian') : '—'}</div> : (
            <ul className="divide-y divide-slate-100 text-sm">{(guardians.data ?? []).map(g => (
              <li key={g.id} className="flex items-center justify-between py-1.5"><span>{fullName(g.guardian)} <span className="text-xs text-slate-500">({t(`persons.${g.relation}`)}) · {g.guardian?.email} {g.guardian?.phone}</span></span>{canEdit && <button className="text-xs text-red-600" onClick={async () => { await registry.removeGuardian(g.id); inv() }}>{t('common.delete')}</button>}</li>
            ))}</ul>
          )}
        </Card>

        <Card title={t('persons.consents')} actions={canEdit && <div className="flex gap-1"><Select className="w-auto py-1 text-xs" value={cType} onChange={e => setCType(e.target.value)}>{['data_processing', 'photo_public', 'health_data', 'marketing'].map(c => <option key={c} value={c}>{t(`persons.${c}`)}</option>)}</Select><Button size="sm" variant="outline" onClick={addConsent} disabled={minor && (guardians.data?.length ?? 0) === 0}>{t('persons.consentGiven')}</Button></div>}>
          {(consents.data ?? []).length === 0 ? <Empty /> : (
            <ul className="divide-y divide-slate-100 text-sm">{(consents.data ?? []).map(c => (
              <li key={c.id} className="flex items-center justify-between py-1.5">
                <span>{t(`persons.${c.consent_type}`)} <span className="text-xs text-slate-500">· {c.given_by === 'self' ? t('persons.self') : t('persons.byGuardian')} · {fmtDateTime(c.given_at)} · {c.policy_version}</span></span>
                {c.withdrawn_at ? <Badge tone="red">{fmtDate(c.withdrawn_at)}</Badge> : canEdit && <button className="text-xs text-slate-500" onClick={async () => { await registry.withdrawConsent(c.id); inv() }}>{t('common.delete')}</button>}
              </li>))}</ul>
          )}
        </Card>

        <Card title={t('docs.title')} actions={canEdit && <Button size="sm" variant="outline" onClick={() => setDoc(true)}>{t('docs.upload')}</Button>}>
          {(docs.data ?? []).length === 0 ? <Empty /> : (
            <Table><thead><tr><Th>{t('docs.type')}</Th><Th>{t('common.name')}</Th><Th>{t('docs.expires')}</Th><Th>{t('docs.uploadedAt')}</Th><Th /></tr></thead>
              <tbody>{(docs.data ?? []).map(d => (
                <tr key={d.id}><Td>{t(`docs.${d.doc_type}`)}</Td><Td className="text-xs">{d.file_name}</Td><Td>{fmtDate(d.expires_at)}</Td><Td className="text-xs">{fmtDate(d.uploaded_at)}</Td>
                  <Td right>{canEdit && <button className="text-xs text-red-600" onClick={async () => { try { await registry.deleteDocument(d.id); inv() } catch (e) { toast(errorMessage(e)) } }}>{t('common.delete')}</button>}</Td></tr>
              ))}</tbody></Table>
          )}
        </Card>

        <Card title={t('persons.licenses')} className="lg:col-span-2">
          {(lics.data ?? []).length === 0 ? <Empty /> : (
            <Table><thead><tr><Th>{t('licenses.number')}</Th><Th>{t('common.club')}</Th><Th>{t('common.sport')}</Th><Th>{t('common.season')}</Th><Th>{t('common.status')}</Th><Th>{t('licenses.validTo')}</Th></tr></thead>
              <tbody>{(lics.data ?? []).map(l => (
                <tr key={l.id}><Td className="tabular-nums"><Link className="text-brand-700 hover:underline" to={`/licenses/${l.id}`}>{l.license_no ?? '—'}</Link></Td><Td>{l.club?.name}</Td><Td>{l.sport?.name_el}</Td><Td>{l.season?.name}</Td><Td><Badge tone={statusTone(l.status)}>{t(`licenses.status.${l.status}`)}</Badge></Td><Td>{fmtDate(l.valid_to)}</Td></tr>
              ))}</tbody></Table>
          )}
        </Card>

        {(clubHistory.data ?? []).length > 0 && (
          <Card title={t('transfers.clubHistory')} className="lg:col-span-2">
            <Table><thead><tr><Th>{t('common.season')}</Th><Th>{t('common.sport')}</Th><Th>{t('transfers.fromClub')}</Th><Th>{t('transfers.toClub')}</Th><Th>{t('licenses.number')}</Th><Th>{t('common.date')}</Th></tr></thead>
              <tbody>{(clubHistory.data ?? []).map((h: { completed_at: string; season_name: string; sport_name: string; from_club_name: string; to_club_name: string; license_no: string | null }, i: number) => (
                <tr key={i}><Td>{h.season_name}</Td><Td>{h.sport_name}</Td><Td className="text-slate-600">{h.from_club_name}</Td><Td className="font-medium">{h.to_club_name}</Td><Td className="tabular-nums">{h.license_no ?? '—'}</Td><Td>{fmtDate(h.completed_at)}</Td></tr>
              ))}</tbody></Table>
          </Card>
        )}

        <Card title={t('roster.activity')} className="lg:col-span-2">
          {activity.isLoading ? <Spinner /> : (activity.data ?? []).length === 0 ? <Empty>{t('roster.noActivity')}</Empty> : (
            <Table><thead><tr><Th>{t('common.season')}</Th><Th>{t('comp.title')}</Th><Th>{t('roster.team')}</Th><Th>{t('roster.shirt')}</Th><Th>{t('roster.license')}</Th><Th>{t('common.status')}</Th><Th>{t('roster.rank')}</Th></tr></thead>
              <tbody>{(activity.data ?? []).map(x => (
                <tr key={x.id}><Td>{x.season_name}</Td><Td><Link className="text-brand-700 hover:underline" to={`/competitions/${x.competition_id}`}>{x.competition_name}</Link><div className="text-xs text-slate-500">{x.sport_name_el} {x.category_name ? '· ' + x.category_name : ''}</div></Td><Td>{x.team_name}<div className="text-xs text-slate-500">{x.club_name}</div></Td><Td className="tabular-nums">{x.shirt_no ?? '—'}</Td><Td className="tabular-nums text-xs">{x.license_no ?? '—'}</Td><Td><Badge tone={rosterTone(x.status)}>{t(`roster.status.${x.status}`)}</Badge>{x.ineligible_reason && <div className="text-xs text-red-700">{x.ineligible_reason}</div>}</Td><Td className="tabular-nums">{x.rank ?? '—'}</Td></tr>
              ))}</tbody></Table>
          )}
        </Card>

        {(perf.data ?? []).length > 0 && (
          <Card title={t('events.performances')} className="lg:col-span-2">
            <Table><thead><tr><Th>{t('common.season')}</Th><Th>{t('comp.title')}</Th><Th>{t('events.name')}</Th><Th>{t('events.heat')}</Th><Th>{t('events.result')}</Th><Th>{t('roster.rank')}</Th></tr></thead>
              <tbody>{(perf.data ?? []).map(r => (
                <tr key={r.id}><Td>{r.season_name}</Td><Td><Link className="text-brand-700 hover:underline" to={`/competitions/${r.competition_id}`}>{r.competition_name}</Link></Td><Td className="font-medium">{r.event_name}</Td><Td className="text-xs text-slate-500">{r.group_name}</Td>
                  <Td className="tabular-nums">{r.status === 'ok' ? fmtResult(r.value, r.result_type, r.unit) : t(`events.rstatus.${r.status}`)} {r.is_pb && <Badge tone="green">{t('events.pb')}</Badge>}</Td>
                  <Td className="tabular-nums">{r.heat_kind === 'heat' ? (r.rank ? `${r.rank} (${t('events.heat').toLowerCase()})` : '—') : r.overall_rank ?? '—'}</Td></tr>
              ))}</tbody></Table>
          </Card>
        )}
      </div>

      <Modal open={edit} onClose={() => setEdit(false)} title={t('common.edit')} wide>
        <PersonForm initial={Object.fromEntries(Object.entries(person).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, v as string]))} onDone={() => { setEdit(false); inv() }} />
      </Modal>
      <Modal open={gModal} onClose={() => setG(false)} title={t('persons.addGuardian')}>
        <form onSubmit={addGuardian} className="grid gap-3 sm:grid-cols-2">
          <Field label={t('persons.lastName')} required><Input required value={gForm.last_name} onChange={e => setGForm({ ...gForm, last_name: e.target.value })} /></Field>
          <Field label={t('persons.firstName')} required><Input required value={gForm.first_name} onChange={e => setGForm({ ...gForm, first_name: e.target.value })} /></Field>
          <Field label={t('common.email')}><Input type="email" value={gForm.email} onChange={e => setGForm({ ...gForm, email: e.target.value })} /></Field>
          <Field label={t('common.phone')}><Input value={gForm.phone} onChange={e => setGForm({ ...gForm, phone: e.target.value })} /></Field>
          <Field label={t('persons.relation')}><Select value={gForm.relation} onChange={e => setGForm({ ...gForm, relation: e.target.value })}><option value="parent">{t('persons.parent')}</option><option value="legal_guardian">{t('persons.legal_guardian')}</option><option value="other">{t('persons.other')}</option></Select></Field>
          {err && <div className="sm:col-span-2"><ErrorBox error={err} /></div>}
          <div className="flex justify-end sm:col-span-2"><Button type="submit">{t('common.save')}</Button></div>
        </form>
      </Modal>
      <Modal open={docModal} onClose={() => setDoc(false)} title={t('docs.upload')}>
        <form onSubmit={addDoc} className="grid gap-3">
          <Field label={t('docs.type')}><Select value={docForm.doc_type} onChange={e => setDocForm({ ...docForm, doc_type: e.target.value })}>{DOC_TYPES.map(d => <option key={d} value={d}>{t(`docs.${d}`)}</option>)}</Select></Field>
          <Field label={t('common.upload')} hint={DEV_AUTH ? t('docs.noStorage') : undefined}><Input type="file" onChange={e => setDocForm({ ...docForm, file: e.target.files?.[0] ?? null })} /></Field>
          <Field label={t('docs.expires')}><Input type="date" value={docForm.expires_at} onChange={e => setDocForm({ ...docForm, expires_at: e.target.value })} /></Field>
          {err && <ErrorBox error={err} />}
          <div className="flex justify-end"><Button type="submit">{t('common.save')}</Button></div>
        </form>
      </Modal>
      <Modal open={hcModal} onClose={() => setHc(false)} title={t('health.new')}>
        <form onSubmit={addHc} className="grid gap-3">
          <Field label={t('health.issuedOn')} required><Input type="date" required value={hcForm.issued_on} onChange={e => setHcForm({ ...hcForm, issued_on: e.target.value })} /></Field>
          <Field label={t('health.expiresOn')} required><Input type="date" required value={hcForm.expires_on} onChange={e => setHcForm({ ...hcForm, expires_on: e.target.value })} /></Field>
          <Field label={t('health.issuer')}><Input value={hcForm.issuer_name} onChange={e => setHcForm({ ...hcForm, issuer_name: e.target.value })} /></Field>
          {err && <ErrorBox error={err} />}
          <div className="flex justify-end"><Button type="submit">{t('common.save')}</Button></div>
        </form>
      </Modal>
    </>
  )
}
