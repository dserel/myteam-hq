import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { orgs, registry } from '@/api'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, Empty, ErrorBox, statusTone } from '@/components/ui'
import { errorMessage } from '@/lib/format'

export default function Sections() {
  const { t, i18n } = useTranslation()
  const a = useAuth(); const orgId = a.orgId!
  const qc = useQueryClient()
  const sections = useQuery({ queryKey: ['sections', orgId, a.clubId], queryFn: () => registry.sections(orgId, a.clubId) })
  const clubs = useQuery({ queryKey: ['clubs', orgId], queryFn: () => orgs.clubsOf(orgId) })
  const sports = useQuery({ queryKey: ['sports'], queryFn: orgs.sports })
  const seasons = useQuery({ queryKey: ['seasons', orgId], queryFn: () => orgs.seasons(orgId) })
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ club_org_id: a.clubId ?? '', sport_id: '', category_id: '', name: '', season_id: '' })
  const cats = useQuery({ queryKey: ['cats', form.sport_id, orgId], enabled: !!form.sport_id, queryFn: () => orgs.categories(form.sport_id, orgId) })
  const [err, setErr] = useState<string | null>(null)
  const [filterClub, setFilterClub] = useState('')
  const canEdit = a.canWrite && a.role !== 'treasurer'
  const sportName = (s: { name_el: string; name_en: string } | null) => s ? (i18n.language === 'en' ? s.name_en : s.name_el) : ''

  async function create(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    try {
      await registry.createSection({ org_id: orgId, club_org_id: form.club_org_id, sport_id: form.sport_id, category_id: form.category_id || null, name: form.name, season_id: form.season_id || seasons.data?.find(s => s.is_current)?.id || null })
      qc.invalidateQueries({ queryKey: ['sections'] }); setOpen(false)
    } catch (e) { setErr(errorMessage(e)) }
  }
  const rows = (sections.data ?? []).filter(s => !filterClub || s.club_org_id === filterClub)

  return (
    <>
      <PageHeader title={t('sections.title')} subtitle={`${rows.length}`} actions={canEdit && <Button onClick={() => setOpen(true)}>{t('sections.new')}</Button>} />
      {!a.clubId && <div className="mb-3 max-w-sm"><Select value={filterClub} onChange={e => setFilterClub(e.target.value)}><option value="">{t('common.all')} — {t('common.club')}</option>{(clubs.data ?? []).map(c => <option key={c.id} value={(c.club as { id: string }).id}>{(c.club as { name: string }).name}</option>)}</Select></div>}
      {sections.isLoading ? <Spinner /> : rows.length === 0 ? <Empty /> : (
        <Table>
          <thead><tr><Th>{t('common.name')}</Th><Th>{t('common.club')}</Th><Th>{t('common.sport')}</Th><Th>{t('common.category')}</Th><Th>{t('common.status')}</Th></tr></thead>
          <tbody>{rows.map(s => (
            <tr key={s.id} className="hover:bg-slate-50">
              <Td><Link className="font-medium text-brand-700 hover:underline" to={`/sections/${s.id}`}>{s.name}</Link></Td>
              <Td>{(s.club as { name: string })?.name}</Td><Td>{sportName(s.sport as { name_el: string; name_en: string })}</Td><Td>{(s.category as { name: string })?.name ?? '—'}</Td>
              <Td><Badge tone={statusTone(s.status)}>{t(`common.${s.status}`)}</Badge></Td>
            </tr>))}</tbody>
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={t('sections.new')}>
        <form onSubmit={create} className="grid gap-3">
          {!a.clubId && <Field label={t('common.club')} required><Select required value={form.club_org_id} onChange={e => setForm({ ...form, club_org_id: e.target.value })}><option value="">{t('common.select')}</option>{(clubs.data ?? []).map(c => <option key={c.id} value={(c.club as { id: string }).id}>{(c.club as { name: string }).name}</option>)}</Select></Field>}
          <Field label={t('common.sport')} required><Select required value={form.sport_id} onChange={e => setForm({ ...form, sport_id: e.target.value, category_id: '' })}><option value="">{t('common.select')}</option>{(sports.data ?? []).map(s => <option key={s.id} value={s.id}>{sportName(s)}</option>)}</Select></Field>
          <Field label={t('common.category')}><Select value={form.category_id} onChange={e => { const c = cats.data?.find(x => x.id === e.target.value); setForm({ ...form, category_id: e.target.value, name: form.name || c?.name || '' }) }}><option value="">—</option>{(cats.data ?? []).map(c => <option key={c.id} value={c.id}>{c.name} ({c.birth_year_from}–{c.birth_year_to})</option>)}</Select></Field>
          <Field label={t('common.name')} required><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={t('common.season')}><Select value={form.season_id} onChange={e => setForm({ ...form, season_id: e.target.value })}><option value="">{t('settings.current')}</option>{(seasons.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          {err && <ErrorBox error={err} />}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button type="submit">{t('common.create')}</Button></div>
        </form>
      </Modal>
    </>
  )
}
