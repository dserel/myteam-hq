import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { events, orgs } from '@/api'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Card, Field, Input, Modal, Select, Spinner, Table, Td, Th, Tabs, Empty, ErrorBox, statusTone } from '@/components/ui'
import { fmtResult, parseResult, fullName, fmtDate, errorMessage } from '@/lib/format'
import { useToast } from '@/lib/toast'
import { rosterTone } from './Roster'

type Ev = { id: string; name: string; code: string | null; result_type: string; unit: string; sort_direction: string; status: string; category: { id: string; name: string } | null; scheduled_at: string | null }
type Entry = { id: string; person_id: string | null; club_org_id: string | null; display_name: string; status: string; seed: number | null; person: { id: string; first_name: string; last_name: string; birth_date: string | null } | null; club: { id: string; name: string } | null; athlete: { id: string; status: string; ineligible_reason: string | null }[] }
type Group = { id: string; name: string; heat_kind: string; sort_order: number }
type Res = { id: string; group_id: string; entry_id: string; lane: number | null; value: number | string | null; status: string; rank: number | null; overall_rank: number | null; wind: number | null; entry: { id: string; display_name: string; person_id: string | null; club: { name: string } | null } | null }

const RESULT_UNITS: Record<string, { unit: string; dir: 'asc' | 'desc' }> = { time: { unit: 's', dir: 'asc' }, distance: { unit: 'm', dir: 'desc' }, height: { unit: 'm', dir: 'desc' }, points: { unit: 'pts', dir: 'desc' }, weight: { unit: 'kg', dir: 'desc' } }

/** Διοργάνωση με αγωνίσματα (στίβος, κολύμβηση…): αγωνίσματα → συμμετοχές → σειρές/τελικοί → επιδόσεις → κατάταξη */
export function MeetDetail({ competitionId, orgId, sportId, categoryId, canEdit }: { competitionId: string; orgId: string; sportId: string; categoryId: string | null; canEdit: boolean }) {
  const { t } = useTranslation()
  const a = useAuth(); const qc = useQueryClient(); const toast = useToast()
  const evs = useQuery({ queryKey: ['events', competitionId], queryFn: () => events.list(competitionId) as Promise<Ev[]> })
  const [evId, setEvId] = useState<string>('')
  const eid = evId || evs.data?.[0]?.id || ''
  const ev = (evs.data ?? []).find(e => e.id === eid)
  const [tab, setTab] = useState<'entries' | 'heats' | 'ranking'>('heats')
  const entries = useQuery({ queryKey: ['event-entries', eid], enabled: !!eid, queryFn: () => events.entries(eid) as Promise<Entry[]> })
  const groups = useQuery({ queryKey: ['event-groups', eid], enabled: !!eid, queryFn: () => events.groups(eid) as Promise<Group[]> })
  const results = useQuery({ queryKey: ['event-results', eid], enabled: !!eid, queryFn: () => events.results(eid) as Promise<Res[]> })
  const cats = useQuery({ queryKey: ['cats', sportId, orgId], queryFn: () => orgs.categories(sportId, orgId) })
  const [newOpen, setNew] = useState(false); const [nf, setNf] = useState({ name: '', code: '', result_type: 'time', category_id: '' })
  const [declOpen, setDecl] = useState(false); const [sel, setSel] = useState<Record<string, boolean>>({})
  const cands = useQuery({ queryKey: ['event-cands', orgId, sportId, a.clubId], enabled: declOpen, queryFn: () => events.candidates(orgId, sportId, a.role === 'club_manager' ? a.clubId : null) })
  const [heatOpen, setHeat] = useState(false); const [hf, setHf] = useState({ size: 8, direct: false })
  const [finalOpen, setFinal] = useState(false); const [top, setTop] = useState(8)
  const [err, setErr] = useState<string | null>(null)
  const canDeclare = canEdit || a.role === 'club_manager'
  const inv = () => ['events', 'event-entries', 'event-groups', 'event-results'].forEach(k => qc.invalidateQueries({ queryKey: [k] }))

  async function createEvent(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    try {
      const u = RESULT_UNITS[nf.result_type]
      await events.create({ competition_id: competitionId, org_id: orgId, name: nf.name, code: nf.code || null, result_type: nf.result_type, unit: u.unit, sort_direction: u.dir, category_id: nf.category_id || null, sort_order: (evs.data?.length ?? 0) + 1 })
      setNew(false); setNf({ name: '', code: '', result_type: 'time', category_id: '' }); inv()
    } catch (e) { setErr(errorMessage(e)) }
  }
  async function declare() {
    setErr(null)
    const picked = (cands.data ?? []).filter(c => sel[c.person_id])
    if (picked.length === 0) return
    try {
      const rows = picked.map(c => { const p = c.person as { id: string; first_name: string; last_name: string }; return { competition_id: competitionId, org_id: orgId, club_org_id: c.section.club_org_id, person_id: p.id, event_id: eid, display_name: `${p.last_name} ${p.first_name}`, status: canEdit ? 'confirmed' : 'pending' } })
      await events.addEntries(rows); setDecl(false); setSel({}); inv(); toast(t('roster.declaredOk', { n: rows.length, ok: '…', bad: '…' }).split(' — ')[0])
    } catch (e) { setErr(errorMessage(e)) }
  }
  async function assign() {
    setErr(null)
    try { const n = await events.assignHeats(eid, hf.size, hf.direct); toast(t('events.heatsAssigned', { n })); setHeat(false); inv(); setTab('heats') } catch (e) { setErr(errorMessage(e)) }
  }
  async function makeFinal() {
    setErr(null)
    try { await events.createFinal(eid, top); toast(t('events.finalCreated')); setFinal(false); inv() } catch (e) { setErr(errorMessage(e)) }
  }
  async function saveResult(r: Res, raw: string, status?: string) {
    const v = raw === '' ? null : parseResult(raw)
    if (raw !== '' && v === null) { toast(t('events.enterHint')); return }
    const patch: Record<string, unknown> = status ? { status, value: status === 'ok' ? v : null } : { value: v, status: v === null ? (r.status === 'ok' ? 'scheduled' : r.status) : 'ok' }
    try { await events.updateResult(r.id, patch); qc.invalidateQueries({ queryKey: ['event-results', eid] }) } catch (e) { toast(errorMessage(e)) }
  }

  if (evs.isLoading) return <Spinner />
  const declared = entries.data ?? []
  const elig = declared.filter(e => e.athlete?.[0]?.status === 'eligible').length
  const takenIds = new Set(declared.map(e => e.person_id))
  const hasResults = (results.data ?? []).some(r => r.status !== 'scheduled')
  const finalExists = (groups.data ?? []).some(g => g.heat_kind !== 'heat')

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <Card title={t('events.title')} actions={canEdit && <Button size="sm" variant="outline" onClick={() => setNew(true)}>{t('events.new')}</Button>}>
        {(evs.data ?? []).length === 0 ? <Empty>{t('events.noEvents')}</Empty> : (
          <ul className="-mx-4 -mb-4 divide-y divide-slate-100">
            {(evs.data ?? []).map(e => (
              <li key={e.id}><button data-event={e.id} onClick={() => setEvId(e.id)} className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${e.id === eid ? 'bg-brand-50 font-semibold text-brand-800' : 'hover:bg-slate-50'}`}>
                <span>{e.name}<span className="ml-1 text-xs font-normal text-slate-500">{e.category?.name ?? ''}</span></span><Badge tone={statusTone(e.status)}>{t(`events.status.${e.status}`)}</Badge>
              </button></li>))}
          </ul>
        )}
      </Card>

      <div>
        {!ev ? <Empty>{t('events.noEvents')}</Empty> : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-bold">{ev.name}</h2>
              <Badge tone="gray">{t(`events.types.${ev.result_type}`)}</Badge>
              {canEdit && <Select className="w-auto py-1 text-xs" value={ev.status} onChange={async e => { await events.update(ev.id, { status: e.target.value }); inv() }}>{['scheduled', 'in_progress', 'completed'].map(s => <option key={s} value={s}>{t(`events.status.${s}`)}</option>)}</Select>}
              <span className="flex-1" />
              {canDeclare && <Button size="sm" variant="outline" onClick={() => setDecl(true)}>{t('events.declare')}</Button>}
              {canEdit && <Button size="sm" variant="outline" disabled={hasResults} onClick={() => setHeat(true)}>{t('events.assignHeats')}</Button>}
              {canEdit && (groups.data ?? []).some(g => g.heat_kind === 'heat') && !finalExists && <Button size="sm" onClick={() => setFinal(true)}>{t('events.createFinal')}</Button>}
            </div>
            {err && <div className="mb-2"><ErrorBox error={err} /></div>}
            <Tabs value={tab} onChange={setTab} tabs={[{ id: 'heats', label: t('events.heats') }, { id: 'ranking', label: t('events.ranking') }, { id: 'entries', label: t('events.entries'), count: declared.length }]} />

            {tab === 'entries' && (
              <>
                <div className="mb-2 flex gap-2 text-sm"><Badge tone="green">{t('roster.eligible')}: {elig}</Badge><Badge tone={declared.length - elig > 0 ? 'red' : 'gray'}>{t('roster.ineligible')}: {declared.length - elig}</Badge></div>
                {declared.length === 0 ? <Empty /> : (
                  <Table><thead><tr><Th>{t('common.person')}</Th><Th>{t('persons.birthDate')}</Th><Th>{t('common.club')}</Th><Th>{t('common.status')}</Th><Th>{t('roster.reason')}</Th><Th /></tr></thead>
                    <tbody>{declared.map(e => { const st = e.athlete?.[0]; return (
                      <tr key={e.id}><Td>{e.person_id ? <Link className="font-medium text-brand-700 hover:underline" to={`/persons/${e.person_id}`}>{e.display_name}</Link> : e.display_name}</Td><Td className="text-xs text-slate-500">{fmtDate(e.person?.birth_date)}</Td><Td>{e.club?.name}</Td>
                        <Td><Badge tone={statusTone(e.status)}>{t(`comp.${e.status}`)}</Badge> {st && <Badge tone={rosterTone(st.status)}>{t(`roster.status.${st.status}`)}</Badge>}</Td><Td className="text-xs text-red-700">{st?.ineligible_reason ?? ''}</Td>
                        <Td right>{canEdit && e.status === 'pending' && <Button size="sm" onClick={async () => { await events.updateEntry(e.id, { status: 'confirmed' }); inv() }}>{t('comp.confirm')}</Button>}{canDeclare && e.status !== 'withdrawn' && !hasResults && <button className="ml-2 text-xs text-slate-500 hover:text-red-700" onClick={async () => { await events.updateEntry(e.id, { status: 'withdrawn' }); inv() }}>{t('comp.withdraw')}</button>}</Td></tr>) })}</tbody></Table>
                )}
              </>
            )}

            {tab === 'heats' && ((groups.data ?? []).length === 0 ? <Empty>{t('events.noHeats')}</Empty> : (groups.data ?? []).map(g => {
              const rows = (results.data ?? []).filter(r => r.group_id === g.id).sort((x, y) => (x.lane ?? 0) - (y.lane ?? 0))
              return (
                <Card key={g.id} title={g.name} className="mb-3" actions={<span className="text-xs text-slate-500">{t(`events.${g.heat_kind === 'heat' ? 'heat' : 'final'}`)}</span>}>
                  <Table><thead><tr><Th className="w-12">{t('events.lane')}</Th><Th>{t('common.person')}</Th><Th>{t('common.club')}</Th><Th className="w-36">{t('events.result')}</Th>{ev.result_type === 'time' && <Th className="w-20">{t('events.wind')}</Th>}<Th className="w-24">{t('common.status')}</Th><Th className="w-16">{t('roster.rank')}</Th></tr></thead>
                    <tbody>{rows.map(r => (
                      <tr key={r.id} data-result={r.id}>
                        <Td className="tabular-nums text-slate-500">{r.lane}</Td>
                        <Td className="font-medium">{r.entry?.person_id ? <Link className="text-brand-700 hover:underline" to={`/persons/${r.entry.person_id}`}>{r.entry.display_name}</Link> : r.entry?.display_name}</Td>
                        <Td className="text-xs text-slate-500">{r.entry?.club?.name}</Td>
                        <Td>{canEdit ? <Input className="py-0.5 tabular-nums" defaultValue={r.value === null ? '' : fmtResult(r.value, ev.result_type).replace(/ .*$/, '')} placeholder={ev.result_type === 'time' ? '11.85' : '6.42'} onBlur={e => { const shown = r.value === null ? '' : fmtResult(r.value, ev.result_type).replace(/ .*$/, ''); if (e.target.value !== shown) saveResult(r, e.target.value) }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} /> : <span className="tabular-nums">{fmtResult(r.value, ev.result_type, ev.unit)}</span>}</Td>
                        {ev.result_type === 'time' && <Td className="text-xs tabular-nums text-slate-500">{canEdit ? <Input className="w-16 py-0.5" defaultValue={r.wind ?? ''} onBlur={async e => { const w = e.target.value === '' ? null : Number(e.target.value.replace(',', '.')); if (w !== r.wind) { await events.updateResult(r.id, { wind: w }); qc.invalidateQueries({ queryKey: ['event-results', eid] }) } }} /> : (r.wind ?? '')}</Td>}
                        <Td>{canEdit ? <Select className="py-0.5 text-xs" value={r.status} onChange={e => saveResult(r, r.value === null ? '' : String(r.value), e.target.value)}>{['scheduled', 'ok', 'dnf', 'dns', 'dq', 'nm'].map(s => <option key={s} value={s}>{t(`events.rstatus.${s}`)} {s !== 'scheduled' && s !== 'ok' ? '· ' + t(`events.rstatusLong.${s}`) : ''}</option>)}</Select> : <span className="text-xs" title={t(`events.rstatusLong.${r.status}`)}>{t(`events.rstatus.${r.status}`)}</span>}</Td>
                        <Td className="font-display font-bold tabular-nums">{r.rank ?? ''}{g.heat_kind !== 'heat' && r.overall_rank && r.overall_rank <= 3 ? <span className="ml-1">{['🥇', '🥈', '🥉'][r.overall_rank - 1]}</span> : null}</Td>
                      </tr>))}</tbody></Table>
                </Card>)
            }))}

            {tab === 'ranking' && (() => {
              const finals = (results.data ?? []).filter(r => r.overall_rank).sort((x, y) => (x.overall_rank ?? 0) - (y.overall_rank ?? 0))
              return finals.length === 0 ? <Empty>{t('events.noHeats')}</Empty> : (
                <Table><thead><tr><Th className="w-12">#</Th><Th>{t('common.person')}</Th><Th>{t('common.club')}</Th><Th>{t('events.result')}</Th></tr></thead>
                  <tbody>{finals.map(r => <tr key={r.id}><Td className="font-display font-bold tabular-nums">{r.overall_rank}</Td><Td className="font-medium">{r.entry?.display_name}</Td><Td className="text-xs text-slate-500">{r.entry?.club?.name}</Td><Td className="tabular-nums">{fmtResult(r.value, ev.result_type, ev.unit)}</Td></tr>)}</tbody></Table>)
            })()}
          </>
        )}
      </div>

      <Modal open={newOpen} onClose={() => setNew(false)} title={t('events.new')}>
        <form onSubmit={createEvent} className="grid gap-3">
          <Field label={t('events.name')} required><Input required value={nf.name} onChange={e => setNf({ ...nf, name: e.target.value })} placeholder="100μ, Μήκος, 4×100μ" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('events.resultType')}><Select value={nf.result_type} onChange={e => setNf({ ...nf, result_type: e.target.value })}>{Object.keys(RESULT_UNITS).map(k => <option key={k} value={k}>{t(`events.types.${k}`)}</option>)}</Select></Field>
            <Field label={t('common.category')}><Select value={nf.category_id} onChange={e => setNf({ ...nf, category_id: e.target.value })}><option value="">{(cats.data ?? []).find(c => c.id === categoryId)?.name ?? '—'}</option>{(cats.data ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          </div>
          <div className="flex justify-end"><Button type="submit">{t('common.create')}</Button></div>
        </form>
      </Modal>
      <Modal open={declOpen} onClose={() => setDecl(false)} title={`${t('events.declare')} — ${ev?.name ?? ''}`} wide>
        {cands.isLoading ? <Spinner /> : (
          <div className="max-h-96 overflow-auto rounded border border-slate-200">
            <table className="w-full text-sm"><tbody>{(cands.data ?? []).filter(c => !takenIds.has(c.person_id)).map(c => { const p = c.person as { first_name: string; last_name: string; birth_date: string | null }; return (
              <tr key={c.person_id} className="border-b border-slate-100 hover:bg-slate-50"><td className="w-8 px-2 py-1.5"><input type="checkbox" checked={!!sel[c.person_id]} onChange={e => setSel({ ...sel, [c.person_id]: e.target.checked })} /></td><td className="px-2 py-1.5 font-medium">{fullName(p)}</td><td className="px-2 py-1.5 text-xs text-slate-500">{fmtDate(p.birth_date)}</td><td className="px-2 py-1.5 text-xs text-slate-500">{c.section.club?.name}</td></tr>) })}</tbody></table>
          </div>
        )}
        {err && <div className="mt-2"><ErrorBox error={err} /></div>}
        <div className="mt-3 flex justify-end"><Button onClick={declare} disabled={Object.values(sel).filter(Boolean).length === 0}>{t('events.declare')} ({Object.values(sel).filter(Boolean).length})</Button></div>
      </Modal>
      <Modal open={heatOpen} onClose={() => setHeat(false)} title={t('events.assignHeats')}>
        <div className="grid gap-3">
          <p className="text-sm text-slate-500">{elig} {t('roster.eligible').toLowerCase()}</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hf.direct} onChange={e => setHf({ ...hf, direct: e.target.checked })} /> {t('events.directFinal')}</label>
          {!hf.direct && <Field label={t('events.heatSize')}><Input type="number" min={2} max={16} value={hf.size} onChange={e => setHf({ ...hf, size: Number(e.target.value) })} /></Field>}
          {err && <ErrorBox error={err} />}
          <div className="flex justify-end"><Button onClick={assign}>{t('events.assignHeats')}</Button></div>
        </div>
      </Modal>
      <Modal open={finalOpen} onClose={() => setFinal(false)} title={t('events.createFinal')}>
        <div className="grid gap-3">
          <Field label={t('events.finalTop')}><Select value={top} onChange={e => setTop(Number(e.target.value))}>{[4, 6, 8, 10, 12].map(n => <option key={n} value={n}>{n}</option>)}</Select></Field>
          {err && <ErrorBox error={err} />}
          <div className="flex justify-end"><Button onClick={makeFinal}>{t('events.createFinal')}</Button></div>
        </div>
      </Modal>
    </div>
  )
}
