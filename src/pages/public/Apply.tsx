import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { applications, ai } from '@/api'
import { Badge, Button, Field, Input, Select, Spinner } from '@/components/ui'
import { errorMessage, isMinor } from '@/lib/format'
import { PublicShell } from './PublicOrg'

type Req = { doc_type: string; label: string; applies_to: string; required: boolean }
type Ctx = { valid: boolean; reason?: string; org: { name: string; short_name: string | null }; issuer: { name: string }; club: { id: string; name: string }; sport: { name_el: string }; season: { name: string }; section: string | null; requirements: Req[]; require_health_card: boolean; consent_text: string; consent_version: string; person: { first_name: string; last_name: string; father_name: string | null; birth_date: string | null; gender: string | null; minor: boolean; has_guardian: boolean } | null }
type Doc = { doc_type: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number; check?: { status: string; issues: string[] } | null }

const TOTAL = 5

/** Αίτηση δελτίου από γονέα/αθλητή χωρίς login — 5 βήματα, κινητό-πρώτα */
export default function Apply() {
  const { token } = useParams<{ token: string }>()
  const { t } = useTranslation()
  const ctx = useQuery({ queryKey: ['apply-ctx', token], queryFn: () => applications.context(token!) as Promise<Ctx> })
  const [step, setStep] = useState(1)
  const [who, setWho] = useState<'self' | 'guardian'>('guardian')
  const [p, setP] = useState({ first_name: '', last_name: '', father_name: '', birth_date: '', gender: '', id_document_type: 'id_card', id_document_no: '', email: '', phone: '' })
  const [g, setG] = useState({ first_name: '', last_name: '', email: '', phone: '', relation: 'parent' })
  const [docs, setDocs] = useState<Doc[]>([])
  const [uploading, setUploading] = useState<string | null>(null)
  const [checking, setChecking] = useState<Set<string>>(new Set())
  const [hc, setHc] = useState({ issued_on: '', expires_on: '', issuer_name: '' })
  const [consent, setConsent] = useState(false); const [photoPublic, setPhotoPublic] = useState(false)
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ track_token: string } | null>(null)

  useEffect(() => {
    const c = ctx.data; if (!c?.valid || !c.person) return
    setP(x => ({ ...x, first_name: c.person!.first_name, last_name: c.person!.last_name, father_name: c.person!.father_name ?? '', birth_date: c.person!.birth_date ?? '', gender: c.person!.gender ?? '' }))
    setWho(c.person.minor ? 'guardian' : 'self')
  }, [ctx.data])

  if (ctx.isLoading) return <PublicShell title={t('apply.wizard.intro')}><Spinner /></PublicShell>
  const C = ctx.data
  if (!C?.valid) return <PublicShell title={t('apply.wizard.intro')}><div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{C?.reason ?? t('apply.wizard.invalid')}</div></PublicShell>

  const minor = isMinor(p.birth_date)
  const reqs = C.requirements.filter(r => r.applies_to === 'all' || (r.applies_to === 'minors') === minor)
  const requiredMissing = reqs.filter(r => r.required && !docs.some(d => d.doc_type === r.doc_type))
  const trackUrl = done ? `${window.location.origin}/my/${done.track_token}` : ''

  async function upload(docType: string, file: File) {
    setErr(null); setUploading(docType)
    try {
      const path = await applications.upload(token!, docType, file)
      setDocs(d => [...d.filter(x => x.doc_type !== docType), { doc_type: docType, storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size }])
      // άμεσος AI έλεγχος (αν είναι ενεργός στον φορέα) — δεν μπλοκάρει ποτέ τη συνέχεια
      setChecking(c => new Set(c).add(docType))
      try {
        const c = await ai.precheck(token!, path, docType, p, who === 'guardian' ? g : null)
        if (c && c.status !== 'skipped') setDocs(d => d.map(x => x.doc_type === docType ? { ...x, check: c } : x))
      } catch { /* ο έλεγχος είναι προαιρετικός */ } finally { setChecking(c => { const n = new Set(c); n.delete(docType); return n }) }
    } catch (e) { setErr(errorMessage(e)) } finally { setUploading(null) }
  }
  async function submit() {
    setBusy(true); setErr(null)
    try {
      const r = await applications.submit(token!, { applicant: who, person: p, guardian: who === 'guardian' ? g : null, documents: docs, health_card: hc.expires_on ? hc : null, consent: { accepted: consent, version: C!.consent_version, photo_public: photoPublic } })
      setDone(r)
    } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }
  const next = () => { setErr(null); setStep(s => Math.min(TOTAL, s + 1)) }
  const canNext = step === 1 ? true : step === 2 ? (!!p.first_name && !!p.last_name && !!p.birth_date && (who !== 'guardian' || (!!g.first_name && !!g.last_name))) : step === 3 ? requiredMissing.length === 0 : step === 4 ? (!C.require_health_card || !!hc.expires_on) : consent

  if (done) return (
    <PublicShell title={t('apply.wizard.sent')} subtitle={<span>{C.club.name} · {C.sport.name_el} · {C.season.name}</span>}>
      <div className="mx-auto max-w-md rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900" data-apply-done>
        <p>{t('apply.wizard.sentHint')}</p>
        <a href={trackUrl} className="mt-3 block break-all font-semibold text-brand-700 underline">{trackUrl}</a>
        <div className="mt-3"><Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(trackUrl)}>{t('common.copyLink')}</Button></div>
      </div>
    </PublicShell>
  )

  return (
    <PublicShell title={t('apply.wizard.intro')} subtitle={<span>{t('apply.wizard.for')} <b>{C.club.name}</b> · {C.sport.name_el} · {C.season.name}{C.section ? ' · ' + C.section : ''}</span>}>
      <div className="mx-auto max-w-md" data-apply-step={step}>
        <div className="mb-3 flex items-center justify-between text-xs text-slate-500"><span>{t('apply.wizard.step', { n: step, total: TOTAL })}</span><span>{C.issuer.name}</span></div>
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-brand-600 transition-all" style={{ width: `${(step / TOTAL) * 100}%` }} /></div>
        {err && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {step === 1 && (<>
            <h2 className="mb-3 font-display text-lg font-bold">{t('apply.wizard.who')}</h2>
            <div className="grid gap-2">
              {(['guardian', 'self'] as const).map(w => (
                <label key={w} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-sm ${who === w ? 'border-brand-600 bg-brand-50' : 'border-slate-200'}`}><input type="radio" name="who" checked={who === w} onChange={() => setWho(w)} /> {t(`apply.wizard.${w}`)}</label>
              ))}
            </div>
          </>)}

          {step === 2 && (<>
            <h2 className="mb-3 font-display text-lg font-bold">{t('apply.wizard.athlete')}</h2>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('persons.lastName')} required><Input required value={p.last_name} onChange={e => setP({ ...p, last_name: e.target.value })} /></Field>
                <Field label={t('persons.firstName')} required><Input required value={p.first_name} onChange={e => setP({ ...p, first_name: e.target.value })} /></Field>
                <Field label={t('persons.fatherName')}><Input value={p.father_name} onChange={e => setP({ ...p, father_name: e.target.value })} /></Field>
                <Field label={t('persons.birthDate')} required><Input type="date" required value={p.birth_date} onChange={e => setP({ ...p, birth_date: e.target.value })} /></Field>
                <Field label={t('persons.gender')}><Select value={p.gender} onChange={e => setP({ ...p, gender: e.target.value })}><option value="">—</option><option value="M">{t('persons.M')}</option><option value="F">{t('persons.F')}</option></Select></Field>
                <Field label={t('persons.idType')}><Select value={p.id_document_type} onChange={e => setP({ ...p, id_document_type: e.target.value })}><option value="id_card">{t('persons.id_card')}</option><option value="passport">{t('persons.passport')}</option></Select></Field>
                <Field label={t('persons.idNo')} className="col-span-2"><Input value={p.id_document_no} onChange={e => setP({ ...p, id_document_no: e.target.value })} /></Field>
                {who === 'self' && <><Field label={t('common.email')}><Input type="email" value={p.email} onChange={e => setP({ ...p, email: e.target.value })} /></Field><Field label={t('common.phone')}><Input value={p.phone} onChange={e => setP({ ...p, phone: e.target.value })} /></Field></>}
              </div>
              {who === 'guardian' && (<>
                <h3 className="mt-2 font-semibold">{t('apply.wizard.guardianData')}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('persons.lastName')} required><Input required value={g.last_name} onChange={e => setG({ ...g, last_name: e.target.value })} /></Field>
                  <Field label={t('persons.firstName')} required><Input required value={g.first_name} onChange={e => setG({ ...g, first_name: e.target.value })} /></Field>
                  <Field label={t('common.email')} required><Input type="email" required value={g.email} onChange={e => setG({ ...g, email: e.target.value })} /></Field>
                  <Field label={t('common.phone')}><Input value={g.phone} onChange={e => setG({ ...g, phone: e.target.value })} /></Field>
                  <Field label={t('apply.wizard.relation')}><Select value={g.relation} onChange={e => setG({ ...g, relation: e.target.value })}>{['parent', 'legal_guardian', 'other'].map(r => <option key={r} value={r}>{t(`apply.wizard.${r}`)}</option>)}</Select></Field>
                </div>
              </>)}
              {p.birth_date && !minor && who === 'guardian' && <p className="text-xs text-amber-700">{t('apply.wizard.self')}?</p>}
              {p.birth_date && minor && who === 'self' && <p className="text-xs text-red-700">{t('apply.wizard.guardian')}</p>}
            </div>
          </>)}

          {step === 3 && (<>
            <h2 className="mb-1 font-display text-lg font-bold">{t('apply.wizard.docs')}</h2>
            <p className="mb-3 text-xs text-slate-500">{t('apply.wizard.docsHint')}</p>
            <ul className="divide-y divide-slate-100">
              {reqs.map(r => { const d = docs.find(x => x.doc_type === r.doc_type); return (
                <li key={r.doc_type} className="flex items-center justify-between gap-3 py-3" data-doc={r.doc_type}>
                  <div><div className="text-sm font-medium">{r.label}{r.required && <span className="text-red-500"> *</span>}</div>{d && <div className="text-xs text-emerald-700">✓ {t('apply.wizard.uploaded')} · {d.file_name}</div>}{checking.has(r.doc_type) && <div className="text-xs text-slate-500">{t('apply.aiChecking')}</div>}{d?.check && d.check.status === 'ok' && <div className="text-xs text-emerald-700">✓ {t('apply.aiFine')}</div>}{d?.check && d.check.status !== 'ok' && <div className="text-xs text-red-700" data-ai-issue>{t('apply.aiIssues')} {d.check.issues.join(' · ')} <span className="text-slate-500">{t('apply.aiRetake')}</span></div>}</div>
                  <label className="shrink-0 cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold hover:border-brand-500">
                    {uploading === r.doc_type ? t('apply.wizard.uploading') : d ? t('common.edit') : t('apply.wizard.take')}
                    <input type="file" className="hidden" accept={r.doc_type === 'photo' ? 'image/*' : 'image/*,application/pdf'} capture={r.doc_type === 'photo' ? 'user' : undefined} onChange={e => { const f = e.target.files?.[0]; if (f) upload(r.doc_type, f) }} />
                  </label>
                </li>) })}
            </ul>
          </>)}

          {step === 4 && (<>
            <h2 className="mb-1 font-display text-lg font-bold">{t('apply.wizard.health')}</h2>
            <p className="mb-3 text-xs text-slate-500">{t('apply.wizard.healthHint')}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('health.issuedOn')}><Input type="date" value={hc.issued_on} onChange={e => setHc({ ...hc, issued_on: e.target.value })} /></Field>
              <Field label={t('health.expiresOn')} required={C.require_health_card}><Input type="date" value={hc.expires_on} onChange={e => setHc({ ...hc, expires_on: e.target.value })} /></Field>
              <Field label={t('health.issuer')} className="col-span-2"><Input value={hc.issuer_name} onChange={e => setHc({ ...hc, issuer_name: e.target.value })} placeholder="Ιατρός / φορέας" /></Field>
            </div>
          </>)}

          {step === 5 && (<>
            <h2 className="mb-3 font-display text-lg font-bold">{t('apply.wizard.consent')}</h2>
            <div className="mb-3 max-h-48 overflow-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">{C.consent_text}</div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={consent} onChange={e => setConsent(e.target.checked)} /> <span>{who === 'guardian' ? 'Ως κηδεμόνας, ' : ''}αποδέχομαι τα παραπάνω ({C.consent_version})</span></label>
            <label className="mt-2 flex items-start gap-2 text-sm text-slate-600"><input type="checkbox" className="mt-1" checked={photoPublic} onChange={e => setPhotoPublic(e.target.checked)} /> <span>{t('apply.wizard.photoPublic')}</span></label>
            <div className="mt-4 rounded-md border border-slate-200 p-3 text-xs text-slate-600">
              <div><b>{p.last_name} {p.first_name}</b> · {p.birth_date} {minor && <Badge tone="amber">{t('persons.minor')}</Badge>}</div>
              <div>{docs.length} {t('apply.wizard.docs').toLowerCase()} · {hc.expires_on ? `${t('apply.wizard.health')}: ${hc.expires_on}` : ''}</div>
            </div>
          </>)}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Button variant="outline" disabled={step === 1} onClick={() => setStep(s => s - 1)}>{t('apply.wizard.back')}</Button>
          {step < TOTAL ? <Button disabled={!canNext} onClick={next}>{t('apply.wizard.next')}</Button> : <Button disabled={!canNext} loading={busy} onClick={submit}>{t('apply.wizard.send')}</Button>}
        </div>
        <p className="mt-6 text-center text-xs text-slate-400"><Link to={`/f/${''}`} className="hidden" />{C.org.name}</p>
      </div>
    </PublicShell>
  )
}

/** «Το δελτίο σου»: παρακολούθηση από τον αιτούντα με το track token */
export function TrackLicense() {
  const { token } = useParams<{ token: string }>()
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['track', token], queryFn: () => applications.track(token!), refetchInterval: 60000 })
  if (q.isLoading) return <PublicShell title={t('apply.track.title')}><Spinner /></PublicShell>
  const L = q.data as null | { status: string; license_no: string | null; valid_to: string | null; issued_at: string | null; rejection_reason: string | null; applicant_note: string | null; qr_token: string | null; person: { first_name: string; last_name: string; birth_date: string }; club: string; sport: string; season: string; issuer: string; documents: { doc_type: string; check_status: string; check_note: string | null; file_name: string }[]; history: { to_status: string; note: string | null; at: string }[] }
  if (!L) return <PublicShell title={t('apply.track.title')}><div className="text-sm text-slate-600">{t('apply.track.notFound')}</div></PublicShell>
  const tone = L.status === 'issued' ? 'green' : L.status === 'rejected' ? 'red' : L.status === 'draft' ? 'amber' : 'blue'
  return (
    <PublicShell title={t('apply.track.title')} subtitle={<span>{L.person.last_name} {L.person.first_name} · {L.club} · {L.sport} · {L.season}</span>}>
      <div className="mx-auto max-w-md space-y-4" data-track-status={L.status}>
        <div className={`rounded-xl border p-4 ${tone === 'green' ? 'border-emerald-200 bg-emerald-50' : tone === 'red' ? 'border-red-200 bg-red-50' : tone === 'amber' ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}>
          <div className="text-xs uppercase tracking-wide text-slate-500">{t('common.status')}</div>
          <div className="font-display text-xl font-bold">{t(`apply.track.status.${L.status}`)}</div>
          {L.license_no && <div className="mt-1 text-sm">{t('apply.track.number')}: <b className="tabular-nums">{L.license_no}</b> · {t('licenses.validTo')} {L.valid_to}</div>}
          {L.rejection_reason && <div className="mt-2 text-sm text-red-800"><b>{t('licenses.rejectionShown')}:</b> {L.rejection_reason}</div>}
          {L.applicant_note && L.status === 'draft' && <div className="mt-2 text-sm text-amber-900"><b>{t('apply.track.fix')}:</b> {L.applicant_note}</div>}
          {L.qr_token && <a className="mt-2 inline-block text-sm font-semibold text-brand-700 underline" href={`/v/${L.qr_token}`}>{t('apply.track.viewCard')} →</a>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold">{t('apply.track.docs')}</h3>
          <ul className="divide-y divide-slate-100 text-sm">{L.documents.map((d, i) => <li key={i} className="flex items-center justify-between py-1.5"><span>{t(`docs.${d.doc_type}`)}<span className="ml-1 text-xs text-slate-400">{d.file_name}</span></span><Badge tone={d.check_status === 'ok' ? 'green' : d.check_status === 'problem' ? 'red' : 'gray'}>{d.check_status === 'ok' ? t('licenses.checkOk') : d.check_status === 'problem' ? (d.check_note || t('licenses.checkProblem')) : '…'}</Badge></li>)}</ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold">{t('apply.track.timeline')}</h3>
          <ol className="space-y-1.5 text-sm">{L.history.map((h, i) => <li key={i} className="flex gap-3"><span className="w-28 shrink-0 text-xs text-slate-500">{new Date(h.at).toLocaleDateString('el-GR')}</span><span>{t(`apply.track.status.${h.to_status}`)}{h.note && <div className="text-xs text-slate-500">{h.note}</div>}</span></li>)}</ol>
        </div>
        <p className="text-center text-xs text-slate-400">{L.issuer}</p>
      </div>
    </PublicShell>
  )
}
