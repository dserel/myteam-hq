import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { licenses, registry, ai, applications } from '@/api'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Card, Field, Modal, PageHeader, Spinner, Textarea, statusTone, ErrorBox } from '@/components/ui'
import { fmtDate, fmtDateTime, fullName, isMinor, errorMessage } from '@/lib/format'
import { useToast } from '@/lib/toast'

export default function LicenseDetail() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const a = useAuth(); const orgId = a.orgId!
  const qc = useQueryClient(); const toast = useToast()
  const lic = useQuery({ queryKey: ['license', id], queryFn: () => licenses.get(id!) })
  const docs = useQuery({ queryKey: ['license-docs', id], queryFn: () => licenses.documents(id!) })
  const missing = useQuery({ queryKey: ['license-missing', id], queryFn: () => licenses.missing(id!) })
  const history = useQuery({ queryKey: ['license-history', id], queryFn: () => licenses.history(id!) })
  const reqs = useQuery({ queryKey: ['reqs', lic.data?.issuer_org_id, lic.data?.org_id], enabled: !!lic.data, queryFn: () => licenses.requirements([lic.data!.issuer_org_id, lic.data!.org_id]) })
  const checks = useQuery({ queryKey: ['doc-checks', id], queryFn: () => ai.checks(id!) })
  const mails = useQuery({ queryKey: ['license-mails', id], queryFn: () => applications.emailsForLicense(id!) })
  const [aiBusy, setAiBusy] = useState(false)
  const personDocs = useQuery({ queryKey: ['docs', lic.data?.person_id], enabled: !!lic.data, queryFn: () => registry.documents(lic.data!.person_id) })
  const [reject, setReject] = useState(false)
  const [ret, setRet] = useState(false)
  const [retNote, setRetNote] = useState('')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inv = () => ['license', 'license-docs', 'license-missing', 'license-history'].forEach(k => qc.invalidateQueries({ queryKey: [k, id] }))

  if (lic.isLoading || !lic.data) return <Spinner />
  const l = lic.data
  const isClub = a.role === 'club_manager'
  const isStaffRole = a.isStaff && a.role !== 'treasurer'
  const isIssuerStaff = isStaffRole && (a.isFederation || l.issuer_org_id === orgId)
  const isHandlerStaff = isStaffRole && (l.org_id === orgId || a.isFederation)
  const editable = ['draft', 'rejected'].includes(l.status) && (isClub || isStaffRole)

  async function act(action: string, note?: string) {
    setBusy(true); setErr(null)
    try { await licenses.transition(id!, action, note); inv(); toast(t(`licenses.actions.${action === 'resubmit' ? 'submit' : action}`)); setReject(false) }
    catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }
  const requirementRows = (reqs.data ?? []).filter(r => (l.license_type === 'new' ? r.required_for_new : r.required_for_renewal) && (r.applies_to === 'all' || (r.applies_to === 'minors') === isMinor(l.person?.birth_date)))
  const verifyUrl = l.qr_token ? `${window.location.origin}/v/${l.qr_token}` : null
  const viaAthlete = l.submitted_via === 'athlete'
  const trackUrl = viaAthlete && l.track_token ? `${window.location.origin}/my/${l.track_token}` : null
  async function runAi() {
    setAiBusy(true); setErr(null)
    try {
      const r = await ai.checkLicense(id!)
      if (!r) toast(t('apply.aiSkipped'))
      else if (r.results.every(x => x.status === 'skipped')) toast(t('apply.aiSkipped'))
      else toast(t('apply.aiDone'))
      inv(); qc.invalidateQueries({ queryKey: ['doc-checks', id] })
    } catch (e) { setErr(errorMessage(e)) } finally { setAiBusy(false) }
  }
  const lastCheck = (docId: string) => (checks.data ?? []).find(c => c.document_id === docId)
  async function returnToApplicant() {
    setBusy(true); setErr(null)
    try { await licenses.returnToApplicant(id!, retNote); inv(); toast(t('apply.returned')); setRet(false); setRetNote('') }
    catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title={<span>{t('licenses.card')} {l.license_no && <span className="tabular-nums text-brand-700">{l.license_no}</span>}</span>}
        subtitle={<span><Link className="text-brand-700 hover:underline" to={`/persons/${l.person_id}`}>{fullName(l.person)}</Link> · <Link className="text-brand-700 hover:underline" to={`/clubs/${l.club_org_id}`}>{l.club?.name}</Link> · {l.sport?.name_el} · {l.season?.name}</span>}
        actions={<>
          <Badge tone={statusTone(l.status)} className="text-sm">{t(`licenses.status.${l.status}`)}</Badge>
          {viaAthlete && <span data-via="athlete"><Badge tone="blue" className="text-sm">{t('apply.fromAthlete')}</Badge></span>}
          {l.status === 'issued' && <Link to={`/print/license/${l.id}`} target="_blank"><Button variant="outline">{t('licenses.printCard')}</Button></Link>}
        </>} />

      {l.status === 'rejected' && l.rejection_reason && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"><b>{t('licenses.rejectionShown')}:</b> {l.rejection_reason}</div>}
      {viaAthlete && l.applicant_note && ['draft', 'rejected'].includes(l.status) && <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><b>{t('apply.applicantNote')}:</b> {l.applicant_note}</div>}
      {err && <div className="mb-4"><ErrorBox error={err} /></div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={t('licenses.requiredDocs')}>
            <table className="w-full text-sm">
              <tbody>
                {requirementRows.map(r => {
                  const attached = (docs.data ?? []).filter(d => d.doc_type === r.doc_type)
                  const available = (personDocs.data ?? []).filter(d => d.doc_type === r.doc_type && !attached.some(x => x.document_id === d.id))
                  return (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="py-2 pr-2 font-medium">{r.label}</td>
                      <td className="py-2">
                        {attached.map(d => (
                          <div key={d.id} className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-slate-600">{d.document?.file_name}</span>
                            <Badge tone={d.check_status === 'ok' ? 'green' : d.check_status === 'problem' ? 'red' : 'gray'}>{d.check_status === 'ok' ? t('licenses.checkOk') : d.check_status === 'problem' ? t('licenses.checkProblem') : t('licenses.attached')}{d.checked_by ? ` · ${t('apply.aiHuman')}` : ''}</Badge>
                            {(() => { const c = lastCheck(d.document_id); if (!c || c.status === 'skipped') return null
                              const aiTone = c.status === 'ok' ? 'green' : c.status === 'problem' ? 'red' : 'amber'
                              const disagree = d.checked_by && ((c.status === 'ok') !== (d.check_status === 'ok'))
                              return <span className="flex flex-wrap items-center gap-1" data-ai-check={c.status} title={(c.issues ?? []).join(' · ')}>
                                <Badge tone={aiTone}>{c.status === 'ok' ? t('apply.aiOk') : c.status === 'problem' ? t('apply.aiProblem') : t('apply.aiUncertain')}{c.confidence != null ? ` ${Math.round(Number(c.confidence) * 100)}%` : ''}</Badge>
                                {disagree && <Badge tone="purple">{t('apply.aiDisagree', { ai: c.status === 'ok' ? '✓' : '✗', human: d.check_status === 'ok' ? '✓' : '✗' })}</Badge>}
                              </span> })()}
                            {isHandlerStaff && ['submitted', 'under_review'].includes(l.status) && d.check_status !== 'ok' && <Button size="sm" variant="ghost" onClick={async () => { await licenses.checkDoc(d.id, 'ok'); inv() }}>✓</Button>}
                            {isHandlerStaff && ['submitted', 'under_review'].includes(l.status) && d.check_status !== 'problem' && <Button size="sm" variant="ghost" onClick={async () => { const n = prompt(t('licenses.checkProblem')) ?? ''; await licenses.checkDoc(d.id, 'problem', n); inv() }}>✗</Button>}
                            {editable && <Button size="sm" variant="ghost" onClick={async () => { await licenses.detach(d.id); inv() }}>×</Button>}
                            {(() => { const c = lastCheck(d.document_id); return c && c.issues?.length ? <div className="basis-full text-xs text-red-700">{t('apply.aiIssues')} {c.issues.join(' · ')}</div> : null })()}
                          </div>
                        ))}
                        {attached.length === 0 && <span className="text-xs text-red-700">{t('licenses.missing')}</span>}
                        {editable && available.length > 0 && (
                          <div className="mt-1 flex gap-1">{available.map(d => <Button key={d.id} size="sm" variant="outline" onClick={async () => { await licenses.attach(l.id, d.id, d.doc_type); inv() }}>{t('licenses.attach')}: {d.file_name}</Button>)}</div>
                        )}
                        {editable && attached.length === 0 && available.length === 0 && <Link className="text-xs text-brand-700 underline" to={`/persons/${l.person_id}`}>{t('docs.upload')} →</Link>}
                      </td>
                    </tr>
                  )
                })}
                {requirementRows.length === 0 && <tr><td className="py-2 text-slate-500">—</td></tr>}
              </tbody>
            </table>
            {(missing.data?.length ?? 0) > 0 && <p className="mt-2 text-xs text-amber-700">{t('licenses.missing')}: {missing.data!.map(m => t(`docs.${m}`)).join(', ')}</p>}
          </Card>

          <Card title={t('common.actions')}>
            <div className="flex flex-wrap gap-2">
              {editable && <Button loading={busy} data-action="submit" onClick={() => act('submit')}>{viaAthlete ? t('apply.confirmSubmit') : l.status === 'rejected' ? t('licenses.actions.resubmit') : t('licenses.actions.submit')}</Button>}
              {editable && viaAthlete && <Button variant="outline" onClick={() => setRet(true)}>{t('apply.returnToApplicant')}</Button>}
              {(isHandlerStaff || (isClub && editable)) && (docs.data?.length ?? 0) > 0 && !['issued', 'revoked', 'expired'].includes(l.status) && <Button variant="outline" loading={aiBusy} data-action="ai" onClick={runAi}>{t('apply.aiRun')}</Button>}
              {isHandlerStaff && l.status === 'submitted' && <Button variant="outline" loading={busy} onClick={() => act('start_review')}>{t('licenses.actions.start_review')}</Button>}
              {isHandlerStaff && ['submitted', 'under_review'].includes(l.status) && <Button loading={busy} onClick={() => act('approve')}>{t('licenses.actions.approve')}</Button>}
              {isHandlerStaff && ['submitted', 'under_review', 'approved'].includes(l.status) && <Button variant="danger" onClick={() => setReject(true)}>{t('licenses.actions.reject')}</Button>}
              {isIssuerStaff && l.status === 'approved' && <Button loading={busy} onClick={() => act('issue')}>{t('licenses.actions.issue')}</Button>}
              {isIssuerStaff && a.isAdmin && l.status === 'issued' && <Button variant="danger" onClick={() => { const n = prompt(t('licenses.actions.revoke')); if (n) act('revoke', n) }}>{t('licenses.actions.revoke')}</Button>}
              {!editable && !isHandlerStaff && !isIssuerStaff && <span className="text-sm text-slate-500">{t('common.readOnly')}</span>}
            </div>
            {l.status === 'approved' && !isIssuerStaff && isHandlerStaff && <p className="mt-2 text-xs text-slate-500">{t('licenses.issuer')}: {l.issuer?.name}</p>}
          </Card>

          <Card title={t('licenses.timeline')}>
            <ol className="space-y-2 text-sm">
              {(history.data ?? []).map((h: { id: number; from_status: string | null; to_status: string; at: string; note: string | null; actor?: { full_name: string } | null }) => (
                <li key={h.id} className="flex gap-3"><span className="w-32 shrink-0 text-xs text-slate-500">{fmtDateTime(h.at)}</span><span><Badge tone={statusTone(h.to_status)}>{t(`licenses.status.${h.to_status}`)}</Badge> <span className="text-xs text-slate-500">{h.actor?.full_name ?? ''}</span>{h.note && <div className="text-xs text-slate-600">{h.note}</div>}</span></li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={t('common.details')}>
            <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
              <dt className="text-slate-500">{t('apply.via')}</dt><dd>{t(`apply.viaLabel.${l.submitted_via ?? 'club'}`)}</dd>
              <dt className="text-slate-500">{t('licenses.type')}</dt><dd>{l.license_type === 'renewal' ? t('licenses.renewal') : t('licenses.new_type')}</dd>
              <dt className="text-slate-500">{t('licenses.handledBy')}</dt><dd>{l.handler?.name}</dd>
              <dt className="text-slate-500">{t('licenses.issuer')}</dt><dd>{l.issuer?.name}</dd>
              <dt className="text-slate-500">{t('licenses.validFrom')}</dt><dd>{fmtDate(l.valid_from)}</dd>
              <dt className="text-slate-500">{t('licenses.validTo')}</dt><dd>{fmtDate(l.valid_to)}</dd>
              <dt className="text-slate-500">{t('persons.legacyNo')}</dt><dd>{l.legacy_no ?? '—'}</dd>
              <dt className="text-slate-500">{t('persons.birthDate')}</dt><dd>{fmtDate(l.person?.birth_date)} {isMinor(l.person?.birth_date) && <Badge tone="amber">{t('persons.minor')}</Badge>}</dd>
            </dl>
          </Card>
          {trackUrl && (
            <Card title={t('apply.trackLink')}>
              <a href={trackUrl} target="_blank" rel="noreferrer" className="break-all text-xs text-brand-700 underline">{trackUrl}</a>
              <div className="mt-2"><Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(trackUrl); toast(t('common.copied')) }}>{t('common.copyLink')}</Button></div>
            </Card>
          )}
          {(mails.data?.length ?? 0) > 0 && (
            <Card title={t('apply.emails')}>
              <ul className="space-y-1 text-xs">{mails.data!.map(m => <li key={m.id} className="flex items-center justify-between gap-2"><span className="min-w-0 truncate">{t(`apply.tpl.${m.template}`, { defaultValue: m.template })} → {m.to_email}</span><Badge tone={m.status === 'sent' ? 'green' : m.status === 'failed' ? 'red' : 'gray'}>{t(`apply.emailStatus.${m.status}`)}</Badge></li>)}</ul>
            </Card>
          )}
          {verifyUrl && (
            <Card title={t('licenses.qr')}>
              <div className="flex flex-col items-center gap-2">
                <QRCodeSVG value={verifyUrl} size={140} />
                <a href={verifyUrl} target="_blank" rel="noreferrer" className="break-all text-center text-xs text-brand-700 underline">{verifyUrl}</a>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(verifyUrl); toast(t('common.copied')) }}>{t('common.copyLink')}</Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      <Modal open={ret} onClose={() => setRet(false)} title={t('apply.returnToApplicant')}>
        <Field label={t('apply.returnNote')} required><Textarea rows={3} value={retNote} onChange={e => setRetNote(e.target.value)} /></Field>
        <div className="mt-3 flex justify-end gap-2"><Button variant="outline" onClick={() => setRet(false)}>{t('common.cancel')}</Button><Button disabled={!retNote.trim()} loading={busy} onClick={returnToApplicant}>{t('apply.returnToApplicant')}</Button></div>
      </Modal>
      <Modal open={reject} onClose={() => setReject(false)} title={t('licenses.actions.reject')}>
        <Field label={t('licenses.rejectReason')} required><Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} /></Field>
        <div className="mt-3 flex justify-end gap-2"><Button variant="outline" onClick={() => setReject(false)}>{t('common.cancel')}</Button><Button variant="danger" disabled={!reason.trim()} loading={busy} onClick={() => act('reject', reason)}>{t('licenses.actions.reject')}</Button></div>
      </Modal>
    </>
  )
}
