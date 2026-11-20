import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { licenses, orgs, transfers } from '@/api'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, Tabs, ErrorBox } from '@/components/ui'
import { errorMessage, fmtDate } from '@/lib/format'
import { useToast } from '@/lib/toast'

export default function Settings() {
  const { t } = useTranslation()
  const a = useAuth(); const orgId = a.orgId!
  const qc = useQueryClient(); const toast = useToast()
  const settings = useQuery({ queryKey: ['settings', orgId], queryFn: () => orgs.settings(orgId) })
  const seasons = useQuery({ queryKey: ['seasons', orgId], queryFn: () => orgs.seasons(orgId) })
  const reqs = useQuery({ queryKey: ['reqs', orgId], queryFn: () => licenses.requirements([orgId]) })
  const unions = useQuery({ queryKey: ['unions', orgId], enabled: a.isFederation, queryFn: () => orgs.unionsOf(orgId) })
  const sports = useQuery({ queryKey: ['sports'], queryFn: orgs.sports })
  const [tab, setTab] = useState<'general' | 'licensing' | 'transfers' | 'finance' | 'seasons' | 'unions'>('general')
  const windows = useQuery({ queryKey: ['tw', orgId], queryFn: () => transfers.windows([orgId]) })
  const [winOpen, setWinOpen] = useState(false)
  const [wfm, setWfm] = useState({ name: '', opens_on: '', closes_on: '', sport_id: '' })
  const [f, setF] = useState<Record<string, unknown>>({})
  const [err, setErr] = useState<string | null>(null)
  const [seasonOpen, setSeasonOpen] = useState(false); const [sf, setSf] = useState({ name: '', starts_on: '', ends_on: '' })
  const [reqOpen, setReqOpen] = useState(false); const [rf, setRf] = useState({ doc_type: 'photo', label: '', required_for_new: true, required_for_renewal: false, applies_to: 'all', sport_id: '' })
  const [unionOpen, setUnionOpen] = useState(false); const [uf, setUf] = useState({ name: '', short_name: '', slug: '', address_city: '', email: '' })
  useEffect(() => { if (settings.data) setF(settings.data) }, [settings.data])
  const canEdit = a.isAdmin
  if (settings.isLoading || !settings.data) return <Spinner />
  const wf = (f.license_workflow as { review_level: string; issue_level: string }) ?? { review_level: 'union', issue_level: 'federation' }

  async function save() {
    setErr(null)
    try {
      const { org_id, updated_at, ...patch } = f as Record<string, unknown> & { org_id: string; updated_at: string }
      void org_id; void updated_at
      await orgs.updateSettings(orgId, { ...patch, debt_block_threshold: patch.debt_block_threshold === '' ? null : patch.debt_block_threshold })
      qc.invalidateQueries({ queryKey: ['settings', orgId] }); toast(t('common.saved'))
    } catch (e) { setErr(errorMessage(e)) }
  }

  return (
    <>
      <PageHeader title={t('settings.title')} subtitle={a.current?.org.name} actions={canEdit && tab !== 'seasons' && tab !== 'unions' && <Button onClick={save}>{t('common.save')}</Button>} />
      {!canEdit && <p className="mb-3 text-xs text-slate-500">{t('common.readOnly')}</p>}
      {err && <div className="mb-3"><ErrorBox error={err} /></div>}
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'general', label: t('settings.general') }, { id: 'licensing', label: t('settings.licensing') }, { id: 'transfers', label: t('transfers.title') }, { id: 'finance', label: t('settings.finance') }, { id: 'seasons', label: t('settings.seasons') }, ...(a.isFederation ? [{ id: 'unions' as const, label: t('settings.unions') }] : [])]} />

      {tab === 'general' && (
        <Card><div className="grid max-w-xl gap-3">
          <Field label={t('settings.noticeDays')}><Input type="number" disabled={!canEdit} value={String(f.health_card_notice_days ?? 30)} onChange={e => setF({ ...f, health_card_notice_days: Number(e.target.value) })} /></Field>
          <Field label={t('settings.showPhoto')}><Select disabled={!canEdit} value={String(f.public_show_photo ?? 'never')} onChange={e => setF({ ...f, public_show_photo: e.target.value })}><option value="never">{t('settings.never')}</option><option value="verified_page">{t('settings.verified_page')}</option></Select></Field>
        </div></Card>
      )}
      {tab === 'licensing' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('settings.licensing')}><div className="grid gap-3">
            <Field label={t('settings.licensePrefix')}><Input disabled={!canEdit} value={String(f.license_no_prefix ?? '')} onChange={e => setF({ ...f, license_no_prefix: e.target.value })} /></Field>
            <Field label={t('settings.licenseNext')}><Input type="number" disabled={!canEdit} value={String(f.license_no_next ?? 1)} onChange={e => setF({ ...f, license_no_next: Number(e.target.value) })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canEdit} checked={!!f.require_health_card_for_issue} onChange={e => setF({ ...f, require_health_card_for_issue: e.target.checked })} /> {t('settings.requireHealth')}</label>
            {/* Διακόπτες από τη συνάντηση ΕΟΖΖ (07 §4): ποιος κάνει αίτηση, αν υπάρχουν τμήματα */}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" data-switch="apply" disabled={!canEdit} checked={f.applications_from_athletes !== false} onChange={e => setF({ ...f, applications_from_athletes: e.target.checked })} /> {t('settings.applicationsFromAthletes')}</label>
            <p className="-mt-1 ml-6 text-xs text-slate-500">{t('settings.applicationsFromAthletesHint')}</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" data-switch="sections" disabled={!canEdit} checked={f.sections_enabled !== false} onChange={e => setF({ ...f, sections_enabled: e.target.checked })} /> {t('settings.sectionsEnabled')}</label>
            <p className="-mt-1 ml-6 text-xs text-slate-500">{t('settings.sectionsEnabledHint')}</p>
            {a.isFederation && <div className="rounded-md border border-slate-200 p-3">
              <Field label={t('apply.aiPolicy')}><Select disabled={!canEdit} value={String(f.ai_check_policy ?? 'assist')} onChange={e => setF({ ...f, ai_check_policy: e.target.value })}><option value="off">{t('apply.aiPolicyOff')}</option><option value="assist">{t('apply.aiPolicyAssist')}</option><option value="auto_advance">{t('apply.aiPolicyAuto')}</option></Select></Field>
              {f.ai_check_policy === 'auto_advance' && <div className="mt-2 grid grid-cols-2 gap-3">
                <Field label={t('apply.aiMinConf')}><Input type="number" min={50} max={100} disabled={!canEdit} value={String(Math.round(Number(f.ai_check_min_confidence ?? 0.85) * 100))} onChange={e => setF({ ...f, ai_check_min_confidence: Number(e.target.value) / 100 })} /></Field>
                <Field label={t('apply.aiAutoTarget')}><Select disabled={!canEdit} value={String(f.ai_auto_target ?? 'under_review')} onChange={e => setF({ ...f, ai_auto_target: e.target.value })}><option value="under_review">{t('licenses.status.under_review')}</option><option value="approved">{t('licenses.status.approved')}</option></Select></Field>
              </div>}
              <p className="mt-1 text-xs text-slate-500">{t('apply.aiPolicyHint')}</p>
            </div>}
            {a.isFederation && <div className="grid grid-cols-2 gap-3">
              <Field label={t('settings.reviewLevel')}><Select disabled={!canEdit} value={wf.review_level} onChange={e => setF({ ...f, license_workflow: { ...wf, review_level: e.target.value } })}><option value="union">{t('settings.union')}</option><option value="federation">{t('settings.federation')}</option></Select></Field>
              <Field label={t('settings.issueLevel')}><Select disabled={!canEdit} value={wf.issue_level} onChange={e => setF({ ...f, license_workflow: { ...wf, issue_level: e.target.value } })}><option value="federation">{t('settings.federation')}</option><option value="union">{t('settings.union')}</option></Select></Field>
            </div>}
          </div></Card>
          <Card title={t('settings.requirements')} actions={canEdit && <Button size="sm" variant="outline" onClick={() => setReqOpen(true)}>{t('settings.addRequirement')}</Button>}>
            <Table><thead><tr><Th>{t('docs.type')}</Th><Th>{t('common.name')}</Th><Th>{t('settings.forNew')}</Th><Th>{t('settings.forRenewal')}</Th><Th>{t('settings.appliesTo')}</Th><Th /></tr></thead>
              <tbody>{(reqs.data ?? []).map(r => (
                <tr key={r.id}><Td>{t(`docs.${r.doc_type}`)}</Td><Td>{r.label}</Td><Td>{r.required_for_new ? '✓' : ''}</Td><Td>{r.required_for_renewal ? '✓' : ''}</Td><Td>{t(`settings.${r.applies_to}`)}</Td>
                  <Td right>{canEdit && <button className="text-xs text-red-600" onClick={async () => { await licenses.deleteRequirement(r.id); qc.invalidateQueries({ queryKey: ['reqs', orgId] }) }}>{t('common.delete')}</button>}</Td></tr>
              ))}</tbody></Table>
          </Card>
        </div>
      )}
      {tab === 'transfers' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('transfers.windows')} actions={canEdit && <Button size="sm" variant="outline" data-action="add-window" onClick={() => setWinOpen(true)}>{t('transfers.addWindow')}</Button>}>
            <Table><thead><tr><Th>{t('transfers.windowName')}</Th><Th>{t('common.sport')}</Th><Th>{t('transfers.opensOn')}</Th><Th>{t('transfers.closesOn')}</Th><Th /></tr></thead>
              <tbody>{(windows.data ?? []).map(w => (
                <tr key={w.id}><Td className="font-medium">{w.name}</Td><Td>{(w.sport as { name_el: string } | null)?.name_el ?? t('common.all')}</Td><Td>{fmtDate(w.opens_on)}</Td><Td>{fmtDate(w.closes_on)}</Td>
                  <Td right>{canEdit && <button className="text-xs text-red-600" onClick={async () => { await transfers.deleteWindow(w.id); qc.invalidateQueries({ queryKey: ['tw'] }) }}>{t('common.delete')}</button>}</Td></tr>
              ))}</tbody></Table>
            <p className="mt-2 text-xs text-slate-500">{t('settings.transferWindowHint')}</p>
          </Card>
          <Card title={t('settings.transferDebtBlock')}>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canEdit} checked={!!f.transfer_debt_block} onChange={e => setF({ ...f, transfer_debt_block: e.target.checked })} /> {t('settings.transferDebtBlockLabel')}</label>
            <p className="mt-1 text-xs text-slate-500">{t('settings.transferDebtBlockHint')}</p>
          </Card>
        </div>
      )}
      {tab === 'finance' && (
        <Card><div className="grid max-w-xl gap-3">
          <Field label={t('settings.receiptPrefix')}><Input disabled={!canEdit} value={String(f.receipt_no_prefix ?? '')} onChange={e => setF({ ...f, receipt_no_prefix: e.target.value })} /></Field>
          <Field label={t('finance.threshold')} hint="€ — κενό = ανενεργό"><Input type="number" step="0.01" disabled={!canEdit} value={f.debt_block_threshold === null || f.debt_block_threshold === undefined ? '' : String(f.debt_block_threshold)} onChange={e => setF({ ...f, debt_block_threshold: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
        </div></Card>
      )}
      {tab === 'seasons' && (
        <Card title={t('settings.seasons')} actions={canEdit && <Button size="sm" variant="outline" onClick={() => setSeasonOpen(true)}>{t('settings.newSeason')}</Button>}>
          <Table><thead><tr><Th>{t('common.name')}</Th><Th>{t('settings.starts')}</Th><Th>{t('settings.ends')}</Th><Th>{t('settings.current')}</Th><Th /></tr></thead>
            <tbody>{(seasons.data ?? []).map(s => (
              <tr key={s.id}><Td className="font-medium">{s.name}</Td><Td>{fmtDate(s.starts_on)}</Td><Td>{fmtDate(s.ends_on)}</Td><Td>{s.is_current && <Badge tone="green">{t('settings.current')}</Badge>}</Td>
                <Td right>{canEdit && !s.is_current && <Button size="sm" variant="ghost" onClick={async () => { await orgs.setCurrentSeason(orgId, s.id); qc.invalidateQueries({ queryKey: ['seasons', orgId] }) }}>{t('settings.current')}</Button>}</Td></tr>
            ))}</tbody></Table>
        </Card>
      )}
      {tab === 'unions' && (
        <Card title={t('settings.unions')} actions={canEdit && <Button size="sm" variant="outline" onClick={() => setUnionOpen(true)}>{t('settings.newUnion')}</Button>}>
          <Table><thead><tr><Th>{t('common.name')}</Th><Th>{t('common.city')}</Th><Th>{t('comp.slug')}</Th><Th>{t('common.status')}</Th></tr></thead>
            <tbody>{(unions.data ?? []).map(u => <tr key={u.id}><Td className="font-medium">{u.name}</Td><Td>{u.address_city}</Td><Td className="text-xs">{u.slug}</Td><Td><Badge tone={u.status === 'active' ? 'green' : 'gray'}>{u.status}</Badge></Td></tr>)}</tbody></Table>
        </Card>
      )}

      <Modal open={winOpen} onClose={() => setWinOpen(false)} title={t('transfers.addWindow')}>
        <div className="grid gap-3">
          <Field label={t('transfers.windowName')}><Input value={wfm.name} onChange={e => setWfm({ ...wfm, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('transfers.opensOn')}><Input type="date" value={wfm.opens_on} onChange={e => setWfm({ ...wfm, opens_on: e.target.value })} /></Field>
            <Field label={t('transfers.closesOn')}><Input type="date" value={wfm.closes_on} onChange={e => setWfm({ ...wfm, closes_on: e.target.value })} /></Field>
          </div>
          <Field label={t('common.sport')} hint={t('settings.allSportsHint')}>
            <Select value={wfm.sport_id} onChange={e => setWfm({ ...wfm, sport_id: e.target.value })}>
              <option value="">{t('common.all')}</option>
              {(sports.data ?? []).map(sp => <option key={sp.id} value={sp.id}>{sp.name_el}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setWinOpen(false)}>{t('common.cancel')}</Button>
            <Button disabled={!wfm.name || !wfm.opens_on || !wfm.closes_on} onClick={async () => {
              try {
                await transfers.saveWindow({ org_id: orgId, name: wfm.name, opens_on: wfm.opens_on, closes_on: wfm.closes_on, sport_id: wfm.sport_id || null })
                setWinOpen(false); setWfm({ name: '', opens_on: '', closes_on: '', sport_id: '' })
                qc.invalidateQueries({ queryKey: ['tw'] }); toast(t('common.saved'))
              } catch (e) { setErr(errorMessage(e)) }
            }}>{t('common.save')}</Button>
          </div>
        </div>
      </Modal>
      <Modal open={seasonOpen} onClose={() => setSeasonOpen(false)} title={t('settings.newSeason')}>
        <form onSubmit={async e => { e.preventDefault(); try { await orgs.createSeason({ org_id: orgId, ...sf }); setSeasonOpen(false); qc.invalidateQueries({ queryKey: ['seasons', orgId] }) } catch (x) { setErr(errorMessage(x)) } }} className="grid gap-3">
          <Field label={t('common.name')} required><Input required placeholder="2027-28" value={sf.name} onChange={e => setSf({ ...sf, name: e.target.value })} /></Field>
          <Field label={t('settings.starts')} required><Input type="date" required value={sf.starts_on} onChange={e => setSf({ ...sf, starts_on: e.target.value })} /></Field>
          <Field label={t('settings.ends')} required><Input type="date" required value={sf.ends_on} onChange={e => setSf({ ...sf, ends_on: e.target.value })} /></Field>
          <div className="flex justify-end"><Button type="submit">{t('common.create')}</Button></div>
        </form>
      </Modal>
      <Modal open={reqOpen} onClose={() => setReqOpen(false)} title={t('settings.addRequirement')}>
        <form onSubmit={async e => { e.preventDefault(); await licenses.saveRequirement({ org_id: orgId, ...rf, sport_id: rf.sport_id || null, sort_order: (reqs.data?.length ?? 0) + 1 }); setReqOpen(false); qc.invalidateQueries({ queryKey: ['reqs', orgId] }) }} className="grid gap-3">
          <Field label={t('docs.type')}><Select value={rf.doc_type} onChange={e => setRf({ ...rf, doc_type: e.target.value, label: rf.label || t(`docs.${e.target.value}`) })}>{['photo', 'id_card', 'birth_cert', 'guardian_consent', 'health_cert', 'other'].map(d => <option key={d} value={d}>{t(`docs.${d}`)}</option>)}</Select></Field>
          <Field label={t('common.name')} required><Input required value={rf.label} onChange={e => setRf({ ...rf, label: e.target.value })} /></Field>
          <Field label={t('common.sport')}><Select value={rf.sport_id} onChange={e => setRf({ ...rf, sport_id: e.target.value })}><option value="">{t('common.all')}</option>{(sports.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name_el}</option>)}</Select></Field>
          <div className="flex gap-4 text-sm"><label className="flex items-center gap-1"><input type="checkbox" checked={rf.required_for_new} onChange={e => setRf({ ...rf, required_for_new: e.target.checked })} /> {t('settings.forNew')}</label><label className="flex items-center gap-1"><input type="checkbox" checked={rf.required_for_renewal} onChange={e => setRf({ ...rf, required_for_renewal: e.target.checked })} /> {t('settings.forRenewal')}</label></div>
          <Field label={t('settings.appliesTo')}><Select value={rf.applies_to} onChange={e => setRf({ ...rf, applies_to: e.target.value })}><option value="all">{t('settings.all')}</option><option value="minors">{t('settings.minors')}</option><option value="adults">{t('settings.adults')}</option></Select></Field>
          <div className="flex justify-end"><Button type="submit">{t('common.save')}</Button></div>
        </form>
      </Modal>
      <Modal open={unionOpen} onClose={() => setUnionOpen(false)} title={t('settings.newUnion')}>
        <form onSubmit={async e => { e.preventDefault(); try { await orgs.createUnion(orgId, { ...uf, slug: uf.slug || null }); setUnionOpen(false); qc.invalidateQueries({ queryKey: ['unions', orgId] }) } catch (x) { setErr(errorMessage(x)) } }} className="grid gap-3">
          <Field label={t('common.name')} required><Input required value={uf.name} onChange={e => setUf({ ...uf, name: e.target.value })} /></Field>
          <Field label={t('clubs.shortName')}><Input value={uf.short_name} onChange={e => setUf({ ...uf, short_name: e.target.value })} /></Field>
          <Field label={t('comp.slug')}><Input value={uf.slug} onChange={e => setUf({ ...uf, slug: e.target.value })} /></Field>
          <Field label={t('common.city')}><Input value={uf.address_city} onChange={e => setUf({ ...uf, address_city: e.target.value })} /></Field>
          <Field label={t('common.email')}><Input type="email" value={uf.email} onChange={e => setUf({ ...uf, email: e.target.value })} /></Field>
          <div className="flex justify-end"><Button type="submit">{t('common.create')}</Button></div>
        </form>
      </Modal>
    </>
  )
}
