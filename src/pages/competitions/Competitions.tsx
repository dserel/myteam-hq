import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { competitions, orgs } from '@/api'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, Empty, ErrorBox, statusTone } from '@/components/ui'
import { errorMessage } from '@/lib/format'

export default function Competitions() {
  const { t } = useTranslation()
  const a = useAuth(); const orgId = a.orgId!
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['competitions', orgId], queryFn: () => competitions.list(orgId) })
  const seasons = useQuery({ queryKey: ['seasons', orgId], queryFn: () => orgs.seasons(orgId) })
  const sports = useQuery({ queryKey: ['sports'], queryFn: orgs.sports })
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', slug: '', season_id: '', sport_id: '', category_id: '', scoring_rule_id: '', is_public: true, format: 'league' as 'league' | 'cup' | 'league_playoffs' | 'meet' })
  const cats = useQuery({ queryKey: ['cats', f.sport_id, orgId], enabled: !!f.sport_id, queryFn: () => orgs.categories(f.sport_id, orgId) })
  const rules = useQuery({ queryKey: ['rules', f.sport_id, orgId], enabled: !!f.sport_id, queryFn: () => orgs.scoringRules(f.sport_id, orgId) })
  const [err, setErr] = useState<string | null>(null)
  const canEdit = a.isStaff && a.role !== 'treasurer'
  const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9α-ω]+/g, '-').replace(/^-|-$/g, '')

  async function create(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    try {
      await competitions.create({ org_id: orgId, name: f.name, slug: f.slug || slugify(f.name), season_id: f.season_id || seasons.data?.find(s => s.is_current)?.id, sport_id: f.sport_id, category_id: f.category_id || null, scoring_rule_id: f.scoring_rule_id || rules.data?.find(r => r.is_default)?.id || null, is_public: f.is_public, status: 'draft' }, f.format)
      qc.invalidateQueries({ queryKey: ['competitions', orgId] }); setOpen(false)
    } catch (e) { setErr(errorMessage(e)) }
  }

  return (
    <>
      <PageHeader title={t('comp.title')} actions={canEdit && <Button onClick={() => setOpen(true)}>{t('comp.new')}</Button>} />
      {list.isLoading ? <Spinner /> : (list.data ?? []).length === 0 ? <Empty /> : (
        <Table>
          <thead><tr><Th>{t('common.name')}</Th><Th>{t('common.season')}</Th><Th>{t('common.sport')}</Th><Th>{t('common.category')}</Th><Th>{t('common.status')}</Th><Th>{t('comp.public')}</Th></tr></thead>
          <tbody>{(list.data ?? []).map(c => (
            <tr key={c.id} className="hover:bg-slate-50">
              <Td><Link className="font-medium text-brand-700 hover:underline" to={`/competitions/${c.id}`}>{c.name}</Link></Td>
              <Td>{c.season?.name}</Td><Td>{c.sport?.name_el}</Td><Td>{c.category?.name ?? '—'}</Td>
              <Td><Badge tone={statusTone(c.status)}>{t(`comp.status.${c.status}`)}</Badge></Td><Td>{c.is_public ? '🌐' : '—'}</Td>
            </tr>))}</tbody>
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={t('comp.new')}>
        <form onSubmit={create} className="grid gap-3">
          <Field label={t('common.name')} required><Input required value={f.name} onChange={e => setF({ ...f, name: e.target.value, slug: slugify(e.target.value) })} /></Field>
          <Field label={t('comp.slug')}><Input value={f.slug} onChange={e => setF({ ...f, slug: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.season')}><Select value={f.season_id} onChange={e => setF({ ...f, season_id: e.target.value })}><option value="">{t('settings.current')}</option>{(seasons.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label={t('common.sport')} required><Select required value={f.sport_id} onChange={e => setF({ ...f, sport_id: e.target.value, category_id: '', scoring_rule_id: '' })}><option value="">{t('common.select')}</option>{(sports.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name_el}</option>)}</Select></Field>
            <Field label={t('comp.format')} className="col-span-2"><Select value={f.format} onChange={e => setF({ ...f, format: e.target.value as typeof f.format })}>{(['league', 'cup', 'league_playoffs', 'meet'] as const).filter(k => { const kind = (sports.data ?? []).find(s => s.id === f.sport_id)?.kind; return kind === 'performance' ? k === 'meet' : k !== 'meet' }).map(k => <option key={k} value={k}>{t(`comp.formats.${k}`)}</option>)}</Select></Field>
            <Field label={t('common.category')}><Select value={f.category_id} onChange={e => setF({ ...f, category_id: e.target.value })}><option value="">—</option>{(cats.data ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label={t('comp.scoringRule')}><Select value={f.scoring_rule_id} onChange={e => setF({ ...f, scoring_rule_id: e.target.value })}><option value="">—</option>{(rules.data ?? []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_public} onChange={e => setF({ ...f, is_public: e.target.checked })} /> {t('comp.public')}</label>
          {err && <ErrorBox error={err} />}
          <div className="flex justify-end"><Button type="submit">{t('common.create')}</Button></div>
        </form>
      </Modal>
    </>
  )
}
