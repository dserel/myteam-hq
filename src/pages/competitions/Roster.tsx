import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { rosters } from '@/api'
import { Badge, Button, Field, Input, Modal, Spinner, Table, Td, Th, Empty, ErrorBox } from '@/components/ui'
import { fullName, errorMessage, fmtDate } from '@/lib/format'
import { useToast } from '@/lib/toast'

type Row = { id: string; person_id: string; shirt_no: number | null; status: string; ineligible_reason: string | null; manual_override: boolean; override_reason: string | null; person: { id: string; first_name: string; last_name: string; birth_date: string | null } | null; license: { id: string; license_no: string | null; status: string; valid_to: string | null } | null }

export const rosterTone = (s: string) => (s === 'eligible' ? 'green' : s === 'ineligible' ? 'red' : s === 'withdrawn' ? 'gray' : 'amber') as 'green' | 'red' | 'gray' | 'amber'

/** Δηλωμένη σύνθεση μιας συμμετοχής. canDeclare = σύλλογος ή γραμματεία· canOverride = μόνο γραμματεία. */
export function RosterPanel({ entryId, orgId, clubId, sportId, canDeclare, canOverride }: { entryId: string; orgId: string; clubId: string; sportId: string; canDeclare: boolean; canOverride: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient(); const toast = useToast()
  const rows = useQuery({ queryKey: ['roster', entryId], queryFn: () => rosters.list(entryId) as Promise<Row[]> })
  const [pick, setPick] = useState(false)
  const cands = useQuery({ queryKey: ['roster-cands', entryId], enabled: pick, queryFn: () => rosters.candidates(orgId, clubId, sportId, entryId) })
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [ov, setOv] = useState<Row | null>(null); const [ovReason, setOvReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const inv = () => { qc.invalidateQueries({ queryKey: ['roster', entryId] }); qc.invalidateQueries({ queryKey: ['roster-cands', entryId] }); qc.invalidateQueries({ queryKey: ['club-comps'] }) }

  async function declare() {
    setErr(null)
    const ids = Object.keys(sel).filter(k => sel[k]); if (ids.length === 0) return
    try {
      const res = await rosters.declare(ids.map(person_id => ({ entry_id: entryId, person_id }))) as { status: string }[]
      const ok = res.filter(r => r.status === 'eligible').length
      toast(t('roster.declaredOk', { n: res.length, ok, bad: res.length - ok })); setPick(false); setSel({}); inv()
    } catch (e) { setErr(errorMessage(e)) }
  }
  async function saveOverride(e: React.FormEvent) {
    e.preventDefault(); if (!ov) return; setErr(null)
    try { await rosters.update(ov.id, { manual_override: true, override_reason: ovReason }); setOv(null); setOvReason(''); inv() } catch (e) { setErr(errorMessage(e)) }
  }
  async function setShirt(r: Row, v: string) {
    const n = v === '' ? null : Number(v); if (n === r.shirt_no) return
    try { await rosters.update(r.id, { shirt_no: n }); inv() } catch (e) { toast(errorMessage(e)) }
  }

  const list = rows.data ?? []
  const counts = { eligible: list.filter(r => r.status === 'eligible').length, ineligible: list.filter(r => r.status === 'ineligible').length, withdrawn: list.filter(r => r.status === 'withdrawn').length }
  return (
    <div data-roster={entryId}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="green">{t('roster.eligible')}: {counts.eligible}</Badge>
        <Badge tone={counts.ineligible > 0 ? 'red' : 'gray'}>{t('roster.ineligible')}: {counts.ineligible}</Badge>
        {counts.withdrawn > 0 && <Badge tone="gray">{t('roster.withdrawn')}: {counts.withdrawn}</Badge>}
        <span className="flex-1" />
        {canDeclare && <Button size="sm" variant="outline" onClick={async () => { const n = await rosters.recheck(entryId); toast(t('roster.rechecked', { n })); inv() }}>{t('roster.recheck')}</Button>}
        {canDeclare && <Button size="sm" onClick={() => setPick(true)}>{t('roster.declare')}</Button>}
      </div>
      {err && <div className="mb-2"><ErrorBox error={err} /></div>}
      {rows.isLoading ? <Spinner /> : list.length === 0 ? <Empty>{t('roster.empty')}</Empty> : (
        <Table>
          <thead><tr><Th className="w-16">{t('roster.shirt')}</Th><Th>{t('common.person')}</Th><Th>{t('persons.birthDate')}</Th><Th>{t('roster.license')}</Th><Th>{t('common.status')}</Th><Th>{t('roster.reason')}</Th><Th /></tr></thead>
          <tbody>{list.map(r => (
            <tr key={r.id} className={r.status === 'withdrawn' ? 'opacity-50' : ''}>
              <Td>{canDeclare ? <Input className="w-14 py-0.5 text-center tabular-nums" defaultValue={r.shirt_no ?? ''} onBlur={e => setShirt(r, e.target.value)} /> : <span className="tabular-nums">{r.shirt_no ?? '—'}</span>}</Td>
              <Td><Link className="font-medium text-brand-700 hover:underline" to={`/persons/${r.person_id}`}>{fullName(r.person)}</Link></Td>
              <Td className="text-xs text-slate-500">{fmtDate(r.person?.birth_date)}</Td>
              <Td className="tabular-nums text-xs">{r.license ? <Link className="text-brand-700 hover:underline" to={`/licenses/${r.license.id}`}>{r.license.license_no ?? t(`licenses.status.${r.license.status}`)}</Link> : '—'}</Td>
              <Td><Badge tone={rosterTone(r.status)}>{t(`roster.status.${r.status}`)}</Badge>{r.manual_override && <span className="ml-1 text-xs text-slate-500" title={r.override_reason ?? ''}>✎ {t('roster.overridden')}</span>}</Td>
              <Td className="text-xs text-red-700">{r.ineligible_reason ?? ''}</Td>
              <Td right>
                {canOverride && r.status === 'ineligible' && <Button size="sm" variant="ghost" onClick={() => { setOv(r); setOvReason('') }}>{t('roster.override')}</Button>}
                {canDeclare && r.status !== 'withdrawn' && <button className="ml-2 text-xs text-slate-500 hover:text-red-700" onClick={async () => { try { await rosters.remove(r.id); inv() } catch (e) { toast(errorMessage(e)) } }}>{t('common.delete')}</button>}
              </Td>
            </tr>))}</tbody>
        </Table>
      )}

      <Modal open={pick} onClose={() => setPick(false)} title={t('roster.declare')} wide>
        <p className="mb-2 text-sm text-slate-500">{t('roster.selectAthletes')}</p>
        {cands.isLoading ? <Spinner /> : (cands.data ?? []).length === 0 ? <Empty>{t('roster.noCandidates')}</Empty> : (
          <div className="max-h-96 overflow-auto rounded border border-slate-200">
            <table className="w-full text-sm"><tbody>{(cands.data ?? []).map(c => {
              const p = c.person as { id: string; first_name: string; last_name: string; birth_date: string | null }
              return (<tr key={c.person_id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="w-8 px-2 py-1.5"><input type="checkbox" checked={!!sel[c.person_id]} onChange={e => setSel({ ...sel, [c.person_id]: e.target.checked })} /></td>
                <td className="px-2 py-1.5 font-medium">{fullName(p)}</td>
                <td className="px-2 py-1.5 text-xs text-slate-500">{fmtDate(p.birth_date)}</td>
                <td className="px-2 py-1.5 text-xs text-slate-500">{c.section?.name}</td>
              </tr>)
            })}</tbody></table>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between">
          <button className="text-xs text-brand-700" onClick={() => { const all: Record<string, boolean> = {}; for (const c of (cands.data ?? [])) all[c.person_id] = true; setSel(all) }}>{t('common.all')}</button>
          <Button onClick={declare} disabled={Object.values(sel).filter(Boolean).length === 0}>{t('roster.declare')} ({Object.values(sel).filter(Boolean).length})</Button>
        </div>
      </Modal>
      <Modal open={!!ov} onClose={() => setOv(null)} title={`${t('roster.override')} — ${fullName(ov?.person)}`}>
        <form onSubmit={saveOverride} className="grid gap-3">
          <p className="text-sm text-red-700">{ov?.ineligible_reason}</p>
          <Field label={t('roster.overrideReason')} required><Input required value={ovReason} onChange={e => setOvReason(e.target.value)} placeholder="π.χ. Απόφαση ΔΣ 12/2026" /></Field>
          <div className="flex justify-end"><Button type="submit">{t('common.save')}</Button></div>
        </form>
      </Modal>
    </div>
  )
}
