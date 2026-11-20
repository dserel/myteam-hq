import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { finance, orgs } from '@/api'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, Empty, ErrorBox } from '@/components/ui'
import { money, errorMessage } from '@/lib/format'

const CATS = ['license_fee', 'transfer_fee', 'participation', 'subscription', 'fine', 'refereeing', 'other']

export default function PriceList() {
  const { t } = useTranslation()
  const a = useAuth(); const orgId = a.orgId!
  const qc = useQueryClient()
  const fees = useQuery({ queryKey: ['fee-types', orgId], queryFn: () => finance.feeTypes(orgId) })
  const seasons = useQuery({ queryKey: ['seasons', orgId], queryFn: () => orgs.seasons(orgId) })
  const sports = useQuery({ queryKey: ['sports'], queryFn: orgs.sports })
  const [open, setOpen] = useState(false)
  const [priceFor, setPriceFor] = useState<string | null>(null)
  const [f, setF] = useState({ code: '', name: '', category: 'other', auto_trigger: '' })
  const [p, setP] = useState({ season_id: '', sport_id: '', amount: '' })
  const [err, setErr] = useState<string | null>(null)
  const canEdit = a.isTreasurer && a.canWrite
  const inv = () => qc.invalidateQueries({ queryKey: ['fee-types', orgId] })

  async function createFee(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    try { await finance.saveFeeType({ org_id: orgId, ...f, auto_trigger: f.auto_trigger || null }); setOpen(false); inv(); setF({ code: '', name: '', category: 'other', auto_trigger: '' }) } catch (e) { setErr(errorMessage(e)) }
  }
  async function addPrice(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    try { await finance.addPrice({ fee_type_id: priceFor, org_id: orgId, season_id: p.season_id || null, sport_id: p.sport_id || null, amount: Number(p.amount) }); setPriceFor(null); inv(); setP({ season_id: '', sport_id: '', amount: '' }) } catch (e) { setErr(errorMessage(e)) }
  }

  return (
    <>
      <PageHeader title={t('finance.priceList')} subtitle={a.current?.org.name} actions={canEdit && <Button onClick={() => setOpen(true)}>{t('finance.newFeeType')}</Button>} />
      {fees.isLoading ? <Spinner /> : (fees.data ?? []).length === 0 ? <Empty /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(fees.data ?? []).map(ft => (
            <Card key={ft.id} title={<span>{ft.name} <span className="ml-1 text-xs font-normal text-slate-400">{ft.code}</span></span>}
              actions={<>
                {ft.auto_trigger && <Badge tone="blue">{t(`finance.${ft.auto_trigger}`)}</Badge>}
                <Badge>{t(`finance.cat.${ft.category}`)}</Badge>
                {canEdit && <Button size="sm" variant="outline" onClick={() => setPriceFor(ft.id)}>{t('finance.addPrice')}</Button>}
                {canEdit && <Button size="sm" variant="ghost" onClick={async () => { await finance.updateFeeType(ft.id, { active: !ft.active }); inv() }}>{ft.active ? t('common.active') : t('common.inactive')}</Button>}
              </>}>
              {(ft.prices ?? []).length === 0 ? <div className="text-sm text-amber-700">{t('finance.noPrice')}</div> : (
                <Table><thead><tr><Th>{t('common.season')}</Th><Th>{t('common.sport')}</Th><Th right>{t('common.amount')}</Th><Th /></tr></thead>
                  <tbody>{(ft.prices as { id: string; season_id: string | null; sport_id: string | null; amount: number; category_id: string | null }[]).map(pr => (
                    <tr key={pr.id}><Td>{seasons.data?.find(s => s.id === pr.season_id)?.name ?? t('common.all')}</Td><Td>{sports.data?.find(s => s.id === pr.sport_id)?.name_el ?? t('common.all')}{pr.category_id ? ' · κατηγορία' : ''}</Td><Td right className="font-medium">{money(pr.amount)}</Td>
                      <Td right>{canEdit && <button className="text-xs text-red-600" onClick={async () => { await finance.deletePrice(pr.id); inv() }}>{t('common.delete')}</button>}</Td></tr>
                  ))}</tbody></Table>
              )}
            </Card>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={t('finance.newFeeType')}>
        <form onSubmit={createFee} className="grid gap-3">
          <Field label={t('finance.code')} required><Input required value={f.code} onChange={e => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="LIC_NEW" /></Field>
          <Field label={t('common.name')} required><Input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
          <Field label={t('finance.categoryType')}><Select value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{CATS.map(c => <option key={c} value={c}>{t(`finance.cat.${c}`)}</option>)}</Select></Field>
          <Field label={t('finance.autoTrigger')}><Select value={f.auto_trigger} onChange={e => setF({ ...f, auto_trigger: e.target.value })}><option value="">{t('common.none')}</option>{['license_issued', 'license_renewed', 'competition_entry_confirmed'].map(x => <option key={x} value={x}>{t(`finance.${x}`)}</option>)}</Select></Field>
          {err && <ErrorBox error={err} />}
          <div className="flex justify-end"><Button type="submit">{t('common.create')}</Button></div>
        </form>
      </Modal>
      <Modal open={!!priceFor} onClose={() => setPriceFor(null)} title={t('finance.addPrice')}>
        <form onSubmit={addPrice} className="grid gap-3">
          <Field label={t('common.amount')} required><Input type="number" step="0.01" min="0" required value={p.amount} onChange={e => setP({ ...p, amount: e.target.value })} /></Field>
          <Field label={t('common.season')}><Select value={p.season_id} onChange={e => setP({ ...p, season_id: e.target.value })}><option value="">{t('common.all')}</option>{(seasons.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label={t('common.sport')}><Select value={p.sport_id} onChange={e => setP({ ...p, sport_id: e.target.value })}><option value="">{t('common.all')}</option>{(sports.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name_el}</option>)}</Select></Field>
          {err && <ErrorBox error={err} />}
          <div className="flex justify-end"><Button type="submit">{t('common.save')}</Button></div>
        </form>
      </Modal>
    </>
  )
}
