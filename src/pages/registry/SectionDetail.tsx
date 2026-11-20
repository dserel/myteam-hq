import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { registry, licenses, applications, orgs } from '@/api'
import { QRCodeSVG } from 'qrcode.react'
import { useToast } from '@/lib/toast'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, Empty } from '@/components/ui'
import { fmtDate, age, fullName, daysUntil, errorMessage } from '@/lib/format'

export default function SectionDetail() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const a = useAuth(); const qc = useQueryClient()
  const sec = useQuery({ queryKey: ['section', id], queryFn: () => registry.section(id!) })
  const members = useQuery({ queryKey: ['section-members', id], queryFn: () => registry.sectionMembers(id!) })
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<'athlete' | 'coach' | 'assistant_coach'>('athlete')
  const cand = useQuery({ queryKey: ['persons-search', a.orgId, search, sec.data?.club_org_id], enabled: open && search.length >= 2, queryFn: () => registry.persons({ orgId: a.orgId!, clubId: sec.data?.club_org_id, search, limit: 20 }) })
  const canEdit = a.canWrite && a.role !== 'treasurer'
  const toast = useToast()
  const readiness = useQuery({ queryKey: ['readiness', id], queryFn: () => registry.sectionReadiness(id!) })
  const root = useQuery({ queryKey: ['root', a.orgId], queryFn: () => orgs.rootOf(a.orgId!) })
  const seasons = useQuery({ queryKey: ['seasons-root', root.data], enabled: !!root.data, queryFn: () => orgs.seasons(root.data!) })
  const settings = useQuery({ queryKey: ['ui-settings', a.orgId], enabled: !!a.orgId, queryFn: () => orgs.uiSettings(a.orgId!) })
  const applyOn = settings.data?.applications_from_athletes !== false   // 07 §4
  const links = useQuery({ queryKey: ['app-links', id], queryFn: async () => (await applications.links(sec.data?.org_id ?? a.orgId!, sec.data?.club_org_id)).filter((l: { section_id: string | null }) => l.section_id === id), enabled: !!sec.data })
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulk] = useState(false); const [bulkSubmit, setBulkSubmit] = useState(false); const [busy, setBusy] = useState(false)
  const [inviteOpen, setInvite] = useState(false); const [newLink, setNewLink] = useState<string | null>(null)
  const [mailTo, setMailTo] = useState(''); const [mailBusy, setMailBusy] = useState(false)
  if (sec.isLoading || !sec.data) return <Spinner />
  const s = sec.data
  const ms = members.data ?? []
  type Readiness = { person_id: string; license_status: string | null; submitted_via: string | null; health_expires_on: string | null; has_guardian: boolean; minor: boolean; docs: string[] | null }
  const rd = new Map<string, Readiness>(((readiness.data ?? []) as Readiness[]).map(r => [r.person_id, r]))
  const currentSeason = seasons.data?.find(x => x.is_current)
  const bodyOrgId = s.org_id
  const linkUrl = (token: string) => `${window.location.origin}/apply/${token}`

  async function bulkApply() {
    setBusy(true)
    try {
      const r = await licenses.createDrafts(bodyOrgId, s.club_org_id, s.sport_id, currentSeason!.id, [...sel], bulkSubmit)
      const ok = r.filter(x => x.ok).length
      toast(t('apply.bulkResult', { ok, failed: r.length - ok }) + (r.length - ok ? ' — ' + r.filter(x => !x.ok).map(x => x.error).slice(0, 2).join('; ') : ''))
      setSel(new Set()); setBulk(false); qc.invalidateQueries({ queryKey: ['readiness', id] }); qc.invalidateQueries({ queryKey: ['licenses'] })
    } catch (e) { toast(errorMessage(e)) } finally { setBusy(false) }
  }
  async function createLink(personId: string | null) {
    try {
      const l = await applications.createLink({ org_id: bodyOrgId, club_org_id: s.club_org_id, sport_id: s.sport_id, season_id: currentSeason!.id, section_id: id, person_id: personId, label: personId ? null : s.name })
      setNewLink(l.token); qc.invalidateQueries({ queryKey: ['app-links', id] }); toast(t('apply.created'))
    } catch (e) { toast(errorMessage(e)) }
  }
  const readinessBadges = (pid: string) => {
    const r = rd.get(pid); if (!r) return null
    const items: { tone: 'green' | 'red' | 'amber' | 'gray' | 'blue'; label: string }[] = []
    if (r.license_status) items.push({ tone: r.license_status === 'issued' ? 'green' : r.license_status === 'rejected' ? 'red' : 'blue', label: t(`licenses.status.${r.license_status}`) + (r.submitted_via === 'athlete' ? ' · ' + t('apply.fromAthlete') : '') })
    else items.push({ tone: 'red', label: t('apply.noLicense') })
    if (!r.health_expires_on || daysUntil(r.health_expires_on) < 0) items.push({ tone: 'red', label: t('apply.noHealth') })
    else if (daysUntil(r.health_expires_on) < 30) items.push({ tone: 'amber', label: t('apply.healthExpiring', { n: daysUntil(r.health_expires_on) }) })
    if (r.minor && !r.has_guardian) items.push({ tone: 'amber', label: t('apply.noGuardian') })
    return <div className="flex flex-wrap gap-1">{items.map((b, i) => <Badge key={i} tone={b.tone}>{b.label}</Badge>)}</div>
  }

  async function add(personId: string) {
    await registry.addSectionMember({ section_id: id, person_id: personId, member_role: role })
    qc.invalidateQueries({ queryKey: ['section-members', id] }); setOpen(false); setSearch('')
  }

  return (
    <>
      <PageHeader title={s.name} subtitle={<span><Link className="text-brand-700 hover:underline" to={`/clubs/${s.club_org_id}`}>{(s.club as { name: string })?.name}</Link> · {(s.sport as { name_el: string })?.name_el} · {(s.category as { name: string })?.name ?? ''}</span>}
        actions={canEdit && <>
          {applyOn && <Button variant="outline" onClick={() => setInvite(true)}>{t('apply.invite')}</Button>}
          <Button variant="outline" disabled={sel.size === 0 || !currentSeason} onClick={() => setBulk(true)}>{t('apply.bulk')}{sel.size > 0 ? ` (${sel.size})` : ''}</Button>
          <Button onClick={() => setOpen(true)}>{t('sections.addMember')}</Button>
        </>} />
      {members.isLoading ? <Spinner /> : ms.length === 0 ? <Empty /> : (
        <Table>
          <thead><tr>{canEdit && <Th className="w-8"><input type="checkbox" checked={sel.size > 0 && sel.size === ms.filter(m => m.member_role === 'athlete').length} onChange={e => setSel(e.target.checked ? new Set(ms.filter(m => m.member_role === 'athlete').map(m => m.person?.id as string)) : new Set())} /></Th>}<Th>{t('common.name')}</Th><Th>{t('sections.role')}</Th><Th>{t('persons.birthDate')}</Th><Th>{t('persons.age')}</Th><Th>{t('apply.readiness')}</Th><Th /></tr></thead>
          <tbody>{[...ms].sort((x, y) => (x.member_role === 'athlete' ? 1 : 0) - (y.member_role === 'athlete' ? 1 : 0) || fullName(x.person).localeCompare(fullName(y.person))).map(m => (
            <tr key={m.id} className="hover:bg-slate-50" data-member={m.person?.id}>
              {canEdit && <Td>{m.member_role === 'athlete' && <input type="checkbox" checked={sel.has(m.person?.id as string)} onChange={e => { const n = new Set(sel); if (e.target.checked) n.add(m.person?.id as string); else n.delete(m.person?.id as string); setSel(n) }} />}</Td>}
              <Td><Link className="font-medium text-brand-700 hover:underline" to={`/persons/${m.person?.id}`}>{fullName(m.person)}</Link></Td>
              <Td><Badge tone={m.member_role === 'athlete' ? 'gray' : 'blue'}>{t(`sections.${m.member_role}`)}</Badge></Td>
              <Td>{fmtDate(m.person?.birth_date)}</Td><Td>{age(m.person?.birth_date) ?? '—'}</Td><Td>{m.member_role === 'athlete' ? readinessBadges(m.person?.id as string) : ''}</Td>
              <Td right>{canEdit && m.member_role === 'athlete' && currentSeason && <button className="mr-2 text-xs text-brand-700" title={t('apply.linkForAthlete')} onClick={() => { createLink(m.person?.id as string); setInvite(true) }}>🔗</button>}{canEdit && <button className="text-xs text-red-600" onClick={async () => { if (confirm(t('common.confirmDelete'))) { await registry.removeSectionMember(m.id); qc.invalidateQueries({ queryKey: ['section-members', id] }) } }}>{t('common.delete')}</button>}</Td>
            </tr>))}</tbody>
        </Table>
      )}
      <Modal open={bulkOpen} onClose={() => setBulk(false)} title={t('apply.bulk')}>
        <div className="grid gap-3 text-sm">
          <p className="text-slate-600">{t('apply.bulkHint')}</p>
          <p>{sel.size} {t('sections.athlete').toLowerCase()} · {s.sport?.name_el} · {currentSeason?.name}</p>
          <label className="flex items-center gap-2"><input type="checkbox" checked={bulkSubmit} onChange={e => setBulkSubmit(e.target.checked)} /> {t('apply.bulkSubmit')}</label>
          <div className="flex justify-end"><Button loading={busy} onClick={bulkApply}>{t('apply.bulk')}</Button></div>
        </div>
      </Modal>
      <Modal open={inviteOpen} onClose={() => { setInvite(false); setNewLink(null) }} title={t('apply.invite')}>
        <div className="grid gap-3 text-sm">
          <p className="text-slate-600">{t('apply.inviteHint')}</p>
          {newLink && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3" data-new-link>
              <div className="flex items-start gap-3">
                <QRCodeSVG value={linkUrl(newLink)} size={96} />
                <div className="min-w-0 flex-1"><a className="break-all text-brand-700 underline" href={linkUrl(newLink)} target="_blank" rel="noreferrer">{linkUrl(newLink)}</a><div className="mt-2"><Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(linkUrl(newLink)); toast(t('common.copied')) }}>{t('common.copyLink')}</Button></div></div>
              </div>
              <form className="mt-3 flex gap-2" onSubmit={async e => { e.preventDefault(); const l = (links.data ?? []).find((x: { token: string }) => x.token === newLink); if (!l || !mailTo) return; setMailBusy(true); try { await applications.sendLinkEmail(l.id, mailTo); toast(t('apply.emailQueued')); setMailTo('') } catch (x) { toast(errorMessage(x)) } finally { setMailBusy(false) } }}>
                <Input type="email" placeholder={t('apply.sendEmailTo')} value={mailTo} onChange={e => setMailTo(e.target.value)} />
                <Button type="submit" size="sm" variant="outline" loading={mailBusy} disabled={!mailTo}>{t('apply.sendEmail')}</Button>
              </form>
            </div>
          )}
          {!newLink && <Button onClick={() => createLink(null)} disabled={!currentSeason}>{t('apply.linkForSection')}</Button>}
          {(links.data ?? []).length > 0 && (
            <div><div className="mb-1 text-xs font-semibold uppercase text-slate-500">{t('apply.activeLinks')}</div>
              <ul className="divide-y divide-slate-100">{(links.data ?? []).map((l: { id: string; token: string; label: string | null; person: { first_name: string; last_name: string } | null; uses: number; expires_at: string }) => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-1.5"><span className="min-w-0 truncate">{l.person ? fullName(l.person) : l.label ?? t('apply.linkForSection')} <span className="text-xs text-slate-400">· {l.uses} {t('apply.uses')} · {t('apply.expires')} {fmtDate(l.expires_at)}</span></span>
                  <span className="flex shrink-0 gap-1"><Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(linkUrl(l.token)); toast(t('common.copied')) }}>{t('common.copyLink')}</Button><Button size="sm" variant="ghost" title={t('apply.sendEmail')} onClick={async () => { const e = prompt(t('apply.sendEmailTo')); if (!e) return; try { await applications.sendLinkEmail(l.id, e); toast(t('apply.emailQueued')) } catch (x) { toast(errorMessage(x)) } }}>✉</Button><button className="text-xs text-red-600" onClick={async () => { await applications.revokeLink(l.id); qc.invalidateQueries({ queryKey: ['app-links', id] }) }}>{t('apply.revoke')}</button></span></li>))}</ul>
            </div>
          )}
        </div>
      </Modal>
      <Modal open={open} onClose={() => setOpen(false)} title={t('sections.addMember')}>
        <div className="grid gap-3">
          <Field label={t('sections.role')}><Select value={role} onChange={e => setRole(e.target.value as typeof role)}><option value="athlete">{t('sections.athlete')}</option><option value="coach">{t('sections.coach')}</option><option value="assistant_coach">{t('sections.assistant_coach')}</option></Select></Field>
          <Field label={t('common.search')}><Input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Επώνυμο…" /></Field>
          <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto text-sm">
            {(cand.data?.rows ?? []).filter(p => !ms.some(m => m.person?.id === p.id)).map(p => (
              <li key={p.id} className="flex items-center justify-between py-1.5"><span>{fullName(p)} <span className="text-xs text-slate-500">{fmtDate(p.birth_date)}</span></span><Button size="sm" variant="outline" onClick={() => add(p.id)}>{t('common.select')}</Button></li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">Ή <Link to={`/persons?new=1&club=${s.club_org_id}&section=${id}`} className="text-brand-700 underline">{t('persons.new')}</Link></p>
        </div>
      </Modal>
    </>
  )
}
