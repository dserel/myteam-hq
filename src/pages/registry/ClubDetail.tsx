import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { orgs, registry, finance, licenses, rosters, events } from '@/api'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Spinner, Table, Td, Th, Tabs, statusTone, Empty } from '@/components/ui'
import { money, fullName, fmtDate, fmtDateTime } from '@/lib/format'
import { useToast } from '@/lib/toast'

export default function ClubDetail() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const a = useAuth(); const orgId = a.orgId!
  const qc = useQueryClient(); const toast = useToast()
  const club = useQuery({ queryKey: ['org', id], queryFn: () => orgs.get(id!) })
  const contacts = useQuery({ queryKey: ['contacts', id], queryFn: () => orgs.contacts(id!) })
  const sections = useQuery({ queryKey: ['sections', orgId, id], queryFn: () => registry.sections(orgId, id) })
  const bal = useQuery({ queryKey: ['club-balances', id], queryFn: () => finance.balancesOfClub(id!) })
  const lic = useQuery({ queryKey: ['licenses', 'club', id], queryFn: () => licenses.list({ orgId, clubId: id, limit: 500 }) })
  const comps = useQuery({ queryKey: ['club-comps', id], queryFn: () => rosters.clubSummary(id!) })
  const medals = useQuery({ queryKey: ['club-medals', id], queryFn: () => events.clubMedals(id!) })
  const [tab, setTab] = useState<'info' | 'sections' | 'licenses' | 'finance' | 'competitions'>('info')
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [contact, setContact] = useState({ role_title: '', full_name: '', email: '', phone: '' })
  const [addC, setAddC] = useState(false)
  const canEdit = a.canWrite && a.role !== 'treasurer'

  if (club.isLoading || !club.data) return <Spinner />
  const c = club.data

  async function save() {
    await orgs.update(id!, form); qc.invalidateQueries({ queryKey: ['org', id] }); setEdit(false); toast(t('common.saved'))
  }
  async function toggleStatus() {
    await orgs.update(id!, { status: c.status === 'active' ? 'inactive' : 'active' }); qc.invalidateQueries({ queryKey: ['org', id] })
  }
  async function addContact(e: React.FormEvent) {
    e.preventDefault(); await orgs.addContact({ ...contact, org_id: id, is_primary: (contacts.data?.length ?? 0) === 0 })
    qc.invalidateQueries({ queryKey: ['contacts', id] }); setAddC(false); setContact({ role_title: '', full_name: '', email: '', phone: '' })
  }

  const byStatus = (lic.data?.rows ?? []).reduce<Record<string, number>>((m, l) => { m[l.status] = (m[l.status] ?? 0) + 1; return m }, {})

  return (
    <>
      <PageHeader title={c.name} subtitle={<span>{c.address_city} · <Badge tone={c.status === 'active' ? 'green' : 'gray'}>{c.status === 'active' ? t('common.active') : t('common.inactive')}</Badge></span>}
        actions={<>
          {canEdit && <Button variant="outline" onClick={() => { setForm({ name: c.name, short_name: c.short_name ?? '', vat_number: c.vat_number ?? '', gga_registry_no: c.gga_registry_no ?? '', address_city: c.address_city ?? '', address_street: c.address_street ?? '', email: c.email ?? '', phone: c.phone ?? '', website: c.website ?? '' }); setEdit(true) }}>{t('common.edit')}</Button>}
          {a.isAdmin && <Button variant="outline" onClick={toggleStatus}>{c.status === 'active' ? t('clubs.deactivate') : t('clubs.activate')}</Button>}
          {a.canWrite && <Link to={`/licenses/new?club=${id}`}><Button>{t('licenses.new')}</Button></Link>}
        </>} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'info', label: t('common.details') }, { id: 'sections', label: t('clubs.sections'), count: sections.data?.length },
        { id: 'licenses', label: t('licenses.title'), count: lic.data?.count }, { id: 'competitions', label: t('roster.clubTab'), count: (comps.data?.length ?? 0) + (medals.data?.length ?? 0) }, { id: 'finance', label: t('nav.finance') }]} />

      {tab === 'info' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('common.details')}>
            <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
              <dt className="text-slate-500">{t('clubs.vat')}</dt><dd className="tabular-nums">{c.vat_number ?? '—'}</dd>
              <dt className="text-slate-500">{t('clubs.gga')}</dt><dd>{c.gga_registry_no ?? '—'}</dd>
              <dt className="text-slate-500">{t('clubs.address')}</dt><dd>{[c.address_street, c.address_city].filter(Boolean).join(', ') || '—'}</dd>
              <dt className="text-slate-500">{t('common.email')}</dt><dd>{c.email ?? '—'}</dd>
              <dt className="text-slate-500">{t('common.phone')}</dt><dd>{c.phone ?? '—'}</dd>
              <dt className="text-slate-500">{t('clubs.website')}</dt><dd>{c.website ?? '—'}</dd>
            </dl>
          </Card>
          <Card title={t('clubs.contacts')} actions={canEdit && <Button size="sm" variant="outline" onClick={() => setAddC(true)}>{t('clubs.addContact')}</Button>}>
            {(contacts.data ?? []).length === 0 ? <Empty /> : (
              <ul className="divide-y divide-slate-100 text-sm">
                {(contacts.data ?? []).map(k => (
                  <li key={k.id} className="flex items-start justify-between py-2">
                    <div><div className="font-medium">{k.full_name} {k.is_primary && <Badge tone="blue">{t('clubs.primary')}</Badge>}</div><div className="text-xs text-slate-500">{k.role_title} · {k.email} · {k.phone}</div></div>
                    {canEdit && <button className="text-xs text-red-600" onClick={async () => { await orgs.deleteContact(k.id); qc.invalidateQueries({ queryKey: ['contacts', id] }) }}>{t('common.delete')}</button>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'sections' && (
        <Table>
          <thead><tr><Th>{t('common.name')}</Th><Th>{t('common.sport')}</Th><Th>{t('common.category')}</Th><Th>{t('common.status')}</Th></tr></thead>
          <tbody>{(sections.data ?? []).map(s => (
            <tr key={s.id}><Td><Link className="text-brand-700 hover:underline" to={`/sections/${s.id}`}>{s.name}</Link></Td><Td>{(s.sport as { name_el: string })?.name_el}</Td><Td>{(s.category as { name: string })?.name ?? '—'}</Td><Td><Badge tone={statusTone(s.status)}>{t(`common.${s.status}`)}</Badge></Td></tr>
          ))}</tbody>
        </Table>
      )}

      {tab === 'licenses' && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">{Object.entries(byStatus).map(([s, n]) => <Badge key={s} tone={statusTone(s)}>{t(`licenses.status.${s}`)}: {n}</Badge>)}</div>
          <Table>
            <thead><tr><Th>{t('licenses.number')}</Th><Th>{t('common.person')}</Th><Th>{t('common.sport')}</Th><Th>{t('common.season')}</Th><Th>{t('common.status')}</Th><Th>{t('licenses.validTo')}</Th></tr></thead>
            <tbody>{(lic.data?.rows ?? []).map(l => (
              <tr key={l.id}><Td className="tabular-nums">{l.license_no ?? '—'}</Td><Td><Link className="text-brand-700 hover:underline" to={`/licenses/${l.id}`}>{fullName(l.person)}</Link></Td><Td>{l.sport?.name_el}</Td><Td>{l.season?.name}</Td><Td><Badge tone={statusTone(l.status)}>{t(`licenses.status.${l.status}`)}</Badge></Td><Td>{fmtDate(l.valid_to)}</Td></tr>
            ))}</tbody>
          </Table>
        </>
      )}

      {tab === 'competitions' && (medals.data ?? []).length > 0 && (
        <Card title={t('events.medals')} className="mb-4">
          <Table><thead><tr><Th>{t('common.season')}</Th><Th>{t('comp.title')}</Th><Th>🥇 {t('events.gold')}</Th><Th>🥈 {t('events.silver')}</Th><Th>🥉 {t('events.bronze')}</Th><Th>{t('events.athletes')}</Th><Th>{t('events.title')}</Th></tr></thead>
            <tbody>{(medals.data ?? []).map(m => <tr key={m.competition_id}><Td>{m.season_name}</Td><Td><Link className="font-medium text-brand-700 hover:underline" to={`/competitions/${m.competition_id}`}>{m.competition_name}</Link></Td><Td className="font-display font-bold tabular-nums">{m.gold}</Td><Td className="tabular-nums">{m.silver}</Td><Td className="tabular-nums">{m.bronze}</Td><Td className="tabular-nums">{m.athletes}</Td><Td className="tabular-nums">{m.events}</Td></tr>)}</tbody></Table>
        </Card>
      )}
      {tab === 'competitions' && (comps.isLoading ? <Spinner /> : (comps.data ?? []).length === 0 ? ((medals.data ?? []).length > 0 ? null : <Empty>{t('roster.noActivity')}</Empty>) : (
        <Table>
          <thead><tr><Th>{t('common.season')}</Th><Th>{t('comp.title')}</Th><Th>{t('roster.team')}</Th><Th>{t('common.status')}</Th><Th>{t('roster.rank')}</Th><Th>{t('roster.title')}</Th><Th>{t('roster.nextMatch')}</Th></tr></thead>
          <tbody>{(comps.data ?? []).map(c => (
            <tr key={c.entry_id}>
              <Td>{c.season_name}</Td>
              <Td><Link className="font-medium text-brand-700 hover:underline" to={`/competitions/${c.competition_id}`}>{c.competition_name}</Link><div className="text-xs text-slate-500">{c.sport_name_el} {c.category_name ? '· ' + c.category_name : ''}</div></Td>
              <Td>{c.display_name}</Td>
              <Td><Badge tone={statusTone(c.entry_status)}>{t(`comp.${c.entry_status}`)}</Badge></Td>
              <Td className="tabular-nums">{c.rank ? <><b>{c.rank}</b><span className="text-xs text-slate-500"> · {c.played} {t('comp.played').toLowerCase()} · {c.points} {t('comp.points')}</span></> : '—'}</Td>
              <Td><span className="text-emerald-700">{c.eligible}</span>{Number(c.ineligible) > 0 && <span className="ml-1 text-red-700" title={t('roster.gaps', { n: c.ineligible })}>/ {c.ineligible} ✗</span>}<span className="text-xs text-slate-500"> ({c.declared})</span></Td>
              <Td className="text-xs text-slate-500">{fmtDateTime(c.next_match_at)}</Td>
            </tr>))}</tbody>
        </Table>
      ))}

      {tab === 'finance' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(bal.data ?? []).map(b => (
            <Card key={b.account_id} title={b.org_name}>
              <div className={`text-2xl font-semibold ${Number(b.balance) > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{money(b.balance)}</div>
              <div className="mt-1 text-xs text-slate-500">{t('finance.lastPayment')}: {fmtDate(b.last_payment_on)}</div>
              <Link to={`/finance/accounts/${b.account_id}`} className="mt-3 inline-block text-sm text-brand-700 hover:underline">{t('finance.account')} →</Link>
            </Card>
          ))}
          {(bal.data ?? []).length === 0 && <Empty />}
        </div>
      )}

      <Modal open={edit} onClose={() => setEdit(false)} title={t('common.edit')}>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries({ name: t('common.name'), short_name: t('clubs.shortName'), vat_number: t('clubs.vat'), gga_registry_no: t('clubs.gga'), address_street: t('clubs.address'), address_city: t('common.city'), email: t('common.email'), phone: t('common.phone'), website: t('clubs.website') }).map(([k, label]) => (
            <Field key={k} label={label} className={k === 'name' ? 'sm:col-span-2' : ''}><Input value={form[k] ?? ''} onChange={e => setForm({ ...form, [k]: e.target.value })} /></Field>
          ))}
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setEdit(false)}>{t('common.cancel')}</Button><Button onClick={save}>{t('common.save')}</Button></div>
        </div>
      </Modal>
      <Modal open={addC} onClose={() => setAddC(false)} title={t('clubs.addContact')}>
        <form onSubmit={addContact} className="grid gap-3">
          <Field label={t('clubs.roleTitle')} required><Input required value={contact.role_title} onChange={e => setContact({ ...contact, role_title: e.target.value })} placeholder="Πρόεδρος / Έφορος" /></Field>
          <Field label={t('common.name')} required><Input required value={contact.full_name} onChange={e => setContact({ ...contact, full_name: e.target.value })} /></Field>
          <Field label={t('common.email')}><Input type="email" value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })} /></Field>
          <Field label={t('common.phone')}><Input value={contact.phone} onChange={e => setContact({ ...contact, phone: e.target.value })} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAddC(false)}>{t('common.cancel')}</Button><Button type="submit">{t('common.save')}</Button></div>
        </form>
      </Modal>
    </>
  )
}
