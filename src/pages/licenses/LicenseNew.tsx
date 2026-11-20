import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { licenses, orgs, registry } from '@/api'
import { useAuth } from '@/lib/auth'
import { Button, Card, Field, Input, PageHeader, Select, ErrorBox } from '@/components/ui'
import { errorMessage, fmtDate, fullName } from '@/lib/format'

export default function LicenseNew() {
  const { t } = useTranslation()
  const a = useAuth(); const orgId = a.orgId!
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const [club, setClub] = useState(sp.get('club') || a.clubId || '')
  const [personId, setPersonId] = useState(sp.get('person') || '')
  const [search, setSearch] = useState('')
  const [sport, setSport] = useState('')
  const [season, setSeason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const root = useQuery({ queryKey: ['root', orgId], queryFn: () => orgs.rootOf(orgId) })
  const clubs = useQuery({ queryKey: ['clubs', orgId], enabled: !a.clubId, queryFn: () => orgs.clubsOf(orgId) })
  const sports = useQuery({ queryKey: ['sports'], queryFn: orgs.sports })
  const seasons = useQuery({ queryKey: ['seasons-root', root.data], enabled: !!root.data, queryFn: () => orgs.seasons(root.data!) })
  const cand = useQuery({ queryKey: ['persons-search', orgId, search, club], enabled: !!club && search.length >= 2, queryFn: () => registry.persons({ orgId, clubId: club, search, limit: 20 }) })
  const person = useQuery({ queryKey: ['person', personId], enabled: !!personId, queryFn: () => registry.person(personId) })
  // Ο φορέας που «χειρίζεται» την αίτηση είναι η ένωση του συλλόγου (D-004). Όταν ο χρήστης είναι ομοσπονδία, βρίσκουμε την ένωση από την affiliation.
  const bodyOrgId = (clubs.data ?? []).find(c => (c.club as { id: string }).id === club)?.body_org_id ?? orgId
  const block = useQuery({ queryKey: ['can-submit', club, bodyOrgId], enabled: !!club, queryFn: () => licenses.canSubmit(club, bodyOrgId) })
  const blocked = block.data && block.data[0] && !block.data[0].allowed

  async function create() {
    setErr(null)
    try {
      const sid = season || seasons.data?.find(s => s.is_current)?.id
      if (!sid) { setErr('Δεν βρέθηκε τρέχουσα περίοδος για την ομοσπονδία — ορίστε την στις Ρυθμίσεις'); return }
      const r = await licenses.create({ org_id: bodyOrgId, club_org_id: club, person_id: personId, sport_id: sport, season_id: sid })
      nav(`/licenses/${r.id}`)
    } catch (e) { setErr(errorMessage(e)) }
  }

  return (
    <>
      <PageHeader title={t('licenses.new')} />
      <Card className="max-w-2xl">
        <div className="grid gap-4">
          {!a.clubId && <Field label={t('common.club')} required><Select value={club} onChange={e => { setClub(e.target.value); setPersonId('') }}><option value="">{t('common.select')}</option>{(clubs.data ?? []).map(c => <option key={c.id} value={(c.club as { id: string }).id}>{(c.club as { name: string }).name}</option>)}</Select></Field>}
          {blocked && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{t('licenses.debtBlocked')}: {block.data![0].reason}</div>}
          <Field label={t('common.person')} required>
            {person.data ? (
              <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"><span>{fullName(person.data)} · {fmtDate(person.data.birth_date)}</span><Button size="sm" variant="ghost" onClick={() => setPersonId('')}>{t('common.edit')}</Button></div>
            ) : (
              <>
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('common.search')} disabled={!club} />
                <ul className="mt-1 max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200 text-sm empty:hidden">
                  {(cand.data?.rows ?? []).map(p => <li key={p.id}><button type="button" className="flex w-full justify-between px-3 py-1.5 text-left hover:bg-slate-50" onClick={() => setPersonId(p.id)}><span>{fullName(p)}</span><span className="text-xs text-slate-500">{fmtDate(p.birth_date)}</span></button></li>)}
                </ul>
              </>
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('common.sport')} required><Select value={sport} onChange={e => setSport(e.target.value)}><option value="">{t('common.select')}</option>{(sports.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name_el}</option>)}</Select></Field>
            <Field label={t('common.season')}><Select value={season} onChange={e => setSeason(e.target.value)}><option value="">{t('settings.current')}</option>{(seasons.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          </div>
          {err && <ErrorBox error={err} />}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => nav(-1)}>{t('common.cancel')}</Button><Button disabled={!club || !personId || !sport} onClick={create}>{t('common.create')}</Button></div>
        </div>
      </Card>
    </>
  )
}
