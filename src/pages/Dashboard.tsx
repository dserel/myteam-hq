import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { el, enUS } from 'date-fns/locale'
import { dashboard, orgs, finance, licenses, competitions } from '@/api'
import { useAuth } from '@/lib/auth'
import { Button, Card, PageHeader, Spinner, Stat, Badge, statusTone, Empty } from '@/components/ui'
import { money, fullName, isMinor } from '@/lib/format'

export default function Dashboard() {
  const { t, i18n } = useTranslation()
  const a = useAuth()
  const orgId = a.orgId!
  const root = useQuery({ queryKey: ['root', orgId], queryFn: () => orgs.rootOf(orgId) })
  const counts = useQuery({ queryKey: ['dash', orgId, root.data], enabled: !!root.data, queryFn: () => dashboard.counts(orgId, root.data!) })
  const queue = useQuery({ queryKey: ['licenses', 'queue-preview', orgId, root.data], enabled: !!root.data && a.role !== 'club_manager', queryFn: () => licenses.list({ orgId, issuerId: root.data!, status: ['submitted', 'under_review', 'approved'], limit: 6 }) })
  const balances = useQuery({ queryKey: ['balances', orgId], enabled: a.role !== 'club_manager', queryFn: () => finance.balances(orgId) })
  const comps = useQuery({ queryKey: ['competitions', orgId], queryFn: () => competitions.list(orgId) })
  // Η κάρτα «τρέχουσα διοργάνωση» δείχνει βαθμολογία, άρα διαλέγουμε διοργάνωση με όμιλο round-robin.
  // Σε νοκ-άουτ (κύπελλο, μαχητικά) δεν υπάρχει βαθμολογία και η κάρτα αποκρύπτεται.
  const liveComps = useMemo(() => (comps.data ?? []).filter(c => c.status === 'in_progress'), [comps.data])
  const liveGroups = useQuery({ queryKey: ['groups-many', liveComps.map(c => c.id).join(',')], enabled: liveComps.length > 0, queryFn: () => competitions.groupsOfMany(liveComps.map(c => c.id)) })
  const rrGroup = (liveGroups.data ?? []).find(g => g.stage?.kind === 'round_robin')
  const live = rrGroup ? liveComps.find(c => c.id === rrGroup.stage.competition_id) : undefined
  const standings = useQuery({ queryKey: ['standings', rrGroup?.id], enabled: !!rrGroup, queryFn: () => competitions.standings(rrGroup!.id) })
  const clubBal = useQuery({ queryKey: ['club-balances', a.clubId], enabled: !!a.clubId, queryFn: () => finance.balancesOfClub(a.clubId!) })
  const clubLic = useQuery({ queryKey: ['club-lic', a.clubId], enabled: !!a.clubId, queryFn: () => licenses.list({ orgId, clubId: a.clubId, limit: 10 }) })
  const seasons = useQuery({ queryKey: ['seasons', orgId], queryFn: () => orgs.seasons(orgId) })
  const season = seasons.data?.find(s => s.is_current)?.name
  const firstName = (a.user?.full_name ?? '').split(' ')[0]
  const today = format(new Date(), 'EEEE d MMMM', { locale: i18n.language === 'en' ? enUS : el })
  const greet = i18n.language === 'en' ? `Hello${firstName ? ', ' + firstName : ''}` : 'Καλημέρα'

  if (a.role === 'club_manager') {
    return (
      <>
        <PageHeader eyebrow={a.current?.org.name} title={a.current?.club?.name} subtitle={today} />
        <div className="grid gap-3 sm:grid-cols-3">
          {(clubBal.data ?? []).map(b => (
            <Stat key={b.account_id} label={b.org_name} value={money(b.balance)} tone={Number(b.balance) > 0 ? 'red' : 'green'} hint={t('finance.balance')} />
          ))}
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card title={t('dashboard.quick')}>
            <div className="flex flex-wrap gap-2">
              <Link to="/licenses/new"><Button>{t('licenses.new')}</Button></Link>
              <Link to="/persons"><Button variant="outline">{t('nav.persons')}</Button></Link>
              <Link to="/finance"><Button variant="outline">{t('nav.myAccount')}</Button></Link>
              <Link to="/competitions"><Button variant="outline">{t('nav.competitions')}</Button></Link>
            </div>
          </Card>
          <Card title={t('licenses.title')}>
            {clubLic.isLoading ? <Spinner /> : (
              <ul className="divide-y divide-slate-100 text-sm">
                {(clubLic.data?.rows ?? []).map(l => (
                  <li key={l.id} className="flex items-center justify-between py-2">
                    <Link to={`/licenses/${l.id}`} className="font-medium text-brand-700 hover:underline">{fullName(l.person)}</Link>
                    <Badge tone={statusTone(l.status)}>{t(`licenses.status.${l.status}`)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </>
    )
  }

  const c = counts.data
  const debtors = (balances.data ?? []).filter(b => Number(b.balance) > 0).slice(0, 5)
  return (
    <>
      <PageHeader eyebrow={season ? `${t('common.season')} ${season}` : a.current?.org.name} title={greet}
        subtitle={<span className="capitalize">{today}</span>}
        actions={<>
          {a.isStaff && a.role !== 'treasurer' && <Link to="/import"><Button variant="outline">{t('nav.import')}</Button></Link>}
          <Link to="/licenses?status=queue"><Button>{t('dashboard.viewQueue')}</Button></Link>
        </>} />
      {counts.isLoading || !c ? <Spinner /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t('dashboard.pendingLicenses')} value={c.pending} tone={c.pending > 0 ? 'amber' : undefined} />
          <Stat label={t('dashboard.openBalance')} value={money(c.openBalance)} tone={c.openBalance > 0 ? 'red' : 'green'} hint={`${c.debtors} ${t('dashboard.viewDebtors').toLowerCase()}`} />
          <Stat label={t('dashboard.issuedLicenses')} value={c.issued} hint={`${c.clubs} ${t('dashboard.clubs').toLowerCase()} · ${c.athletes} ${t('dashboard.athletes').toLowerCase()}`} />
          <Stat label={t('dashboard.expiringHealth')} value={c.expiring} tone={c.expiring > 0 ? 'amber' : undefined} />
        </div>
      )}
      <div className="mt-5 grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7" title={t('licenses.queue')} actions={<Link to="/licenses?status=queue" className="text-sm font-semibold text-brand-700 hover:underline">{t('common.all')} ({c?.pending ?? 0}) →</Link>}>
          {queue.isLoading ? <Spinner /> : (queue.data?.rows ?? []).length === 0 ? <Empty>{t('licenses.noPending')}</Empty> : (
            <ul className="-mx-4 -mb-4 divide-y divide-[#f0f2f7]">
              {(queue.data?.rows ?? []).map(l => (
                <li key={l.id} className="grid grid-cols-[2fr_1.4fr_1fr] items-center gap-2 px-4 py-2.5 text-sm">
                  <Link to={`/licenses/${l.id}`} className="font-semibold text-ink-900 hover:text-brand-700">{fullName(l.person)}{isMinor(l.person?.birth_date) && <span className="ml-1 text-xs font-medium text-amber-700">· {t('persons.minor').toLowerCase()}</span>}</Link>
                  <span className="text-ink-600">{l.club?.name}</span>
                  <span><Badge tone={statusTone(l.status)}>{t(`licenses.status.${l.status}`)}</Badge></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="flex flex-col gap-4 lg:col-span-5">
          <Card title={t('dashboard.viewDebtors')} actions={<Link to="/finance?debtors=1" className="text-sm font-semibold text-brand-700 hover:underline">{t('nav.finance')} →</Link>}>
            {debtors.length === 0 ? <Empty /> : (
              <ul className="-my-1 divide-y divide-[#f0f2f7] text-sm">
                {debtors.map(b => <li key={b.account_id} className="flex items-center justify-between py-2"><Link to={`/finance/accounts/${b.account_id}`} className="hover:text-brand-700">{b.club_name}</Link><span className="font-display font-bold text-red-700">{money(b.balance)}</span></li>)}
              </ul>
            )}
          </Card>
          {live && rrGroup && (
            <section className="rounded-xl bg-nav p-4 text-white">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-[15px] font-bold">{live.name}</h3>
                <Link to={`/competitions/${live.id}`} className="text-sm font-semibold text-nav-text hover:text-white">{t('comp.standings')} →</Link>
              </div>
              <ol className="space-y-1.5 text-sm">
                {(standings.data ?? []).slice(0, 5).map(s => (
                  <li key={s.entry_id} className="grid grid-cols-[22px_1fr_36px_40px] items-center gap-2"><span className="text-nav-muted">{s.rank}</span><span className="font-semibold">{s.entry?.display_name}</span><span className="text-right text-nav-text">{s.played}</span><span className="text-right font-display font-extrabold">{s.points}</span></li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </>
  )
}
