import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { transfers, licenses, registry } from '@/api'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Card, Modal, PageHeader, Spinner, Textarea, statusTone, ErrorBox, Field } from '@/components/ui'
import { fmtDate, fmtDateTime, errorMessage } from '@/lib/format'
import { useToast } from '@/lib/toast'

export default function TransferDetail() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const a = useAuth()
  const qc = useQueryClient(); const toast = useToast()
  const tr = useQuery({ queryKey: ['transfer', id], queryFn: () => transfers.get(id!) })
  const docs = useQuery({ queryKey: ['transfer-docs', id], queryFn: () => transfers.documents(id!) })
  const history = useQuery({ queryKey: ['transfer-history', id], queryFn: () => transfers.history(id!) })
  const reqs = useQuery({ queryKey: ['treqs', tr.data?.org_id], enabled: !!tr.data, queryFn: () => licenses.requirements([tr.data!.org_id]) })
  const personDocs = useQuery({ queryKey: ['docs', tr.data?.person_id], enabled: !!tr.data, queryFn: () => registry.documents(tr.data!.person_id) })
  const [reject, setReject] = useState(false)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inv = () => ['transfer', 'transfer-docs', 'transfer-history'].forEach(k => qc.invalidateQueries({ queryKey: [k, id] }))

  if (tr.isLoading || !tr.data) return <Spinner />
  const x = tr.data
  const isStaffRole = a.isStaff && a.role !== 'treasurer'
  const isNewClub = a.role === 'club_manager' && a.clubId === x.to_club_org_id
  const isOldClub = a.role === 'club_manager' && a.clubId === x.from_club_org_id
  const editable = ['draft', 'rejected'].includes(x.status) && (isNewClub || isStaffRole)
  const required = (reqs.data ?? []).filter(r => r.required_for_transfer)

  async function act(to: string, note?: string) {
    setBusy(true); setErr(null)
    try { await transfers.transition(id!, to, note); inv(); qc.invalidateQueries({ queryKey: ['transfers'] }); toast(t(`transfers.actions.${to}`)); setReject(false) }
    catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader
        title={<span>{t('transfers.one')} — {x.last_name} {x.first_name}</span>}
        subtitle={`${x.from_club_name} → ${x.to_club_name}`}
        actions={<Badge tone={statusTone(x.status)}>{t(`transfers.status.${x.status}`)}</Badge>} />
      {err && <ErrorBox error={err} />}

      {/* Ο παλιός σύλλογος ενημερώνεται — δεν εγκρίνει (07 §1.1) */}
      {isOldClub && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-old-club-notice>
          {t('transfers.oldClubNotice')}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <Card title={t('transfers.docs')}>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {required.map(r => {
                  const attached = (docs.data ?? []).filter(d => d.doc_type === r.doc_type)
                  const available = (personDocs.data ?? []).filter(d => d.doc_type === r.doc_type && !attached.some(y => y.document_id === d.id))
                  return (
                    <tr key={r.id}>
                      <td className="w-56 py-2 align-top text-slate-600">{r.label}</td>
                      <td className="py-2">
                        {attached.map(d => (
                          <div key={d.id} className="flex flex-wrap items-center gap-2" data-doc={r.doc_type}>
                            <span className="text-xs text-slate-600">{d.document?.file_name}</span>
                            <Badge tone={d.check_status === 'ok' ? 'green' : d.check_status === 'problem' ? 'red' : 'gray'}>
                              {d.check_status === 'ok' ? t('licenses.checkOk') : d.check_status === 'problem' ? t('licenses.checkProblem') : t('licenses.attached')}
                            </Badge>
                            {isStaffRole && ['submitted', 'under_review'].includes(x.status) && d.check_status !== 'ok' &&
                              <Button size="sm" variant="ghost" onClick={async () => { await transfers.checkDoc(d.id, 'ok'); inv() }}>✓</Button>}
                            {isStaffRole && ['submitted', 'under_review'].includes(x.status) && d.check_status !== 'problem' &&
                              <Button size="sm" variant="ghost" onClick={async () => { const n = prompt(t('licenses.checkProblem')) ?? ''; await transfers.checkDoc(d.id, 'problem', n); inv() }}>✗</Button>}
                            {editable && <Button size="sm" variant="ghost" onClick={async () => { await transfers.detach(d.id); inv() }}>×</Button>}
                            {d.check_note && <div className="basis-full text-xs text-red-700">{d.check_note}</div>}
                          </div>
                        ))}
                        {attached.length === 0 && <span className="text-xs text-red-700">{t('licenses.missing')}</span>}
                        {editable && available.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">{available.map(d =>
                            <Button key={d.id} size="sm" variant="outline" data-attach={r.doc_type}
                              onClick={async () => { await transfers.attach(x.id, d.id, d.doc_type); inv() }}>
                              {t('licenses.attach')}: {d.file_name}
                            </Button>)}</div>
                        )}
                        {editable && attached.length === 0 && available.length === 0 &&
                          <Link className="text-xs text-brand-700 underline" to={`/persons/${x.person_id}`}>{t('docs.upload')} →</Link>}
                      </td>
                    </tr>
                  )
                })}
                {required.length === 0 && <tr><td className="py-2 text-slate-500">{t('transfers.noRequirements')}</td></tr>}
              </tbody>
            </table>
          </Card>

          <Card title={t('common.actions')}>
            <div className="flex flex-wrap gap-2">
              {editable && <Button loading={busy} data-action="submit" onClick={() => act('submitted')}>{t('transfers.actions.submitted')}</Button>}
              {isStaffRole && x.status === 'submitted' && <Button variant="outline" loading={busy} data-action="review" onClick={() => act('under_review')}>{t('transfers.actions.under_review')}</Button>}
              {isStaffRole && ['submitted', 'under_review'].includes(x.status) && <Button loading={busy} data-action="approve" onClick={() => act('approved', t('transfers.approvedNote'))}>{t('transfers.actions.approved')}</Button>}
              {isStaffRole && ['submitted', 'under_review'].includes(x.status) && <Button variant="danger" onClick={() => setReject(true)}>{t('transfers.actions.rejected')}</Button>}
              {editable && <Button variant="ghost" onClick={() => act('cancelled')}>{t('transfers.actions.cancelled')}</Button>}
              {x.status === 'completed' && <span className="text-sm text-emerald-700" data-completed>{t('transfers.completedNote', { no: x.license_no ?? '', club: x.to_club_name })}</span>}
              {!editable && !isStaffRole && x.status !== 'completed' && <span className="text-sm text-slate-500">{t('common.readOnly')}</span>}
            </div>
            {x.rejection_reason && <p className="mt-2 text-sm text-red-700">{x.rejection_reason}</p>}
          </Card>

          <Card title={t('licenses.timeline')}>
            <ol className="space-y-2 text-sm">
              {(history.data ?? []).map((h: { id: number; to_status: string; at: string; note: string | null; actor?: { full_name: string } | null }) => (
                <li key={h.id} className="flex gap-3">
                  <span className="w-32 shrink-0 text-xs text-slate-500">{fmtDateTime(h.at)}</span>
                  <span><Badge tone={statusTone(h.to_status)}>{t(`transfers.status.${h.to_status}`)}</Badge>
                    <span className="ml-1 text-xs text-slate-500">{h.actor?.full_name ?? ''}</span>
                    {h.note && <div className="text-xs text-slate-600">{h.note}</div>}</span>
                </li>))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={t('transfers.one')}>
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs text-slate-500">{t('licenses.number')}</dt><dd className="tabular-nums font-medium">{x.license_no ?? '—'}</dd></div>
              <div><dt className="text-xs text-slate-500">{t('transfers.fromClub')}</dt><dd>{x.from_club_name}</dd></div>
              <div><dt className="text-xs text-slate-500">{t('transfers.toClub')}</dt><dd className="font-medium">{x.to_club_name}</dd></div>
              <div><dt className="text-xs text-slate-500">{t('common.sport')}</dt><dd>{x.sport_name}</dd></div>
              <div><dt className="text-xs text-slate-500">{t('common.person')}</dt><dd><Link className="text-brand-700 hover:underline" to={`/persons/${x.person_id}`}>{x.last_name} {x.first_name}</Link> <span className="text-xs text-slate-500">{fmtDate(x.birth_date)}</span></dd></div>
              {x.release_note && <div><dt className="text-xs text-slate-500">{t('transfers.releaseNote')}</dt><dd className="text-slate-700">{x.release_note}</dd></div>}
            </dl>
            <p className="mt-3 border-t pt-3 text-xs text-slate-500">{t('transfers.keepsNumber')}</p>
          </Card>
        </div>
      </div>

      <Modal open={reject} onClose={() => setReject(false)} title={t('transfers.actions.rejected')}>
        <div className="grid gap-3">
          <Field label={t('licenses.rejectReason')}><Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReject(false)}>{t('common.cancel')}</Button>
            <Button variant="danger" disabled={!reason.trim()} loading={busy} onClick={() => act('rejected', reason)}>{t('transfers.actions.rejected')}</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
