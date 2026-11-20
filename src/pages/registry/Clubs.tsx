import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { orgs, finance } from '@/api'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, Empty, ErrorBox } from '@/components/ui'
import { money, fmtDate, errorMessage } from '@/lib/format'
import { useToast } from '@/lib/toast'

export default function Clubs() {
  const { t } = useTranslation()
  const a = useAuth(); const orgId = a.orgId!
  const qc = useQueryClient(); const toast = useToast()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const clubs = useQuery({ queryKey: ['clubs', orgId], queryFn: () => orgs.clubsOf(orgId) })
  const balances = useQuery({ queryKey: ['balances', orgId], queryFn: () => finance.balances(orgId) })
  const sports = useQuery({ queryKey: ['sports'], queryFn: orgs.sports })
  const [form, setForm] = useState({ name: '', short_name: '', vat_number: '', gga_registry_no: '', address_city: '', email: '', phone: '', sport_id: '' })
  const [err, setErr] = useState<string | null>(null)

  if (a.role === 'club_manager') return <Navigate to={`/clubs/${a.clubId}`} replace />

  const balOf = (clubId: string) => balances.data?.find(b => b.club_org_id === clubId)?.balance ?? 0
  const rows = (clubs.data ?? []).filter(r => !q || (r.club as { name: string }).name.toLowerCase().includes(q.toLowerCase()))

  async function create(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    try {
      const { sport_id, ...club } = form
      await orgs.createClub(orgId, { ...club, slug: null }, sport_id || null)
      qc.invalidateQueries({ queryKey: ['clubs', orgId] }); setOpen(false); toast(t('common.saved'))
      setForm({ name: '', short_name: '', vat_number: '', gga_registry_no: '', address_city: '', email: '', phone: '', sport_id: '' })
    } catch (e) { setErr(errorMessage(e)) }
  }

  return (
    <>
      <PageHeader title={t('clubs.title')} subtitle={`${rows.length}`} actions={a.isStaff && a.role !== 'treasurer' && <Button onClick={() => setOpen(true)}>{t('clubs.new')}</Button>} />
      <div className="mb-3 max-w-sm"><Input placeholder={t('common.search')} value={q} onChange={e => setQ(e.target.value)} /></div>
      {clubs.isLoading ? <Spinner /> : rows.length === 0 ? <Empty /> : (
        <Table>
          <thead><tr><Th>{t('common.name')}</Th>{a.isFederation && <Th>{t('orgType.union')}</Th>}<Th>{t('clubs.memberNo')}</Th><Th>{t('common.city')}</Th><Th>{t('clubs.vat')}</Th><Th>{t('clubs.joinedAt')}</Th><Th>{t('common.status')}</Th><Th right>{t('clubs.balance')}</Th></tr></thead>
          <tbody>
            {rows.map(r => { const c = r.club as { id: string; name: string; address_city: string; vat_number: string; status: string }; const b = Number(balOf(c.id)); return (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td><Link to={`/clubs/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.name}</Link></Td>
                {a.isFederation && <Td>{r.body?.short_name ?? r.body?.name}</Td>}
                <Td>{r.member_no ?? '—'}</Td><Td>{c.address_city ?? '—'}</Td><Td className="tabular-nums">{c.vat_number ?? '—'}</Td><Td>{fmtDate(r.joined_at)}</Td>
                <Td><Badge tone={c.status === 'active' && r.status === 'active' ? 'green' : 'gray'}>{c.status === 'active' && r.status === 'active' ? t('common.active') : t('common.inactive')}</Badge></Td>
                <Td right className={b > 0 ? 'text-red-700' : 'text-slate-600'}>{money(b)}</Td>
              </tr>) })}
          </tbody>
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={t('clubs.new')}>
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <Field label={t('common.name')} required className="sm:col-span-2"><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={t('clubs.shortName')}><Input value={form.short_name} onChange={e => setForm({ ...form, short_name: e.target.value })} /></Field>
          <Field label={t('common.city')}><Input value={form.address_city} onChange={e => setForm({ ...form, address_city: e.target.value })} /></Field>
          <Field label={t('clubs.vat')}><Input value={form.vat_number} onChange={e => setForm({ ...form, vat_number: e.target.value })} pattern="[0-9]{9}" /></Field>
          <Field label={t('clubs.gga')}><Input value={form.gga_registry_no} onChange={e => setForm({ ...form, gga_registry_no: e.target.value })} /></Field>
          <Field label={t('common.email')}><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label={t('common.phone')}><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label={t('common.sport')} className="sm:col-span-2"><Select value={form.sport_id} onChange={e => setForm({ ...form, sport_id: e.target.value })}><option value="">{t('common.all')}</option>{(sports.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name_el}</option>)}</Select></Field>
          {err && <div className="sm:col-span-2"><ErrorBox error={err} /></div>}
          <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button type="submit">{t('common.create')}</Button></div>
        </form>
      </Modal>
    </>
  )
}
