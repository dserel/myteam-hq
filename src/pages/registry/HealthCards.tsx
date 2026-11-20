import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { registry } from '@/api'
import { useAuth } from '@/lib/auth'
import { Badge, Button, PageHeader, Spinner, Table, Td, Th, Tabs, Empty } from '@/components/ui'
import { fmtDate, daysUntil, fullName } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'

export default function HealthCards() {
  const { t } = useTranslation()
  const a = useAuth(); const orgId = a.orgId!
  const toast = useToast()
  const [tab, setTab] = useState<'expiring' | 'all'>('expiring')
  const exp = useQuery({ queryKey: ['hc-expiring', orgId], queryFn: () => registry.expiringHealthCards(orgId) })
  const all = useQuery({ queryKey: ['hc-all', orgId], queryFn: () => registry.allHealthCards(orgId) })

  async function notify(personIds: string[], clubIds: (string | null)[]) {
    // in-app notification to the org (email goes through the Edge Function in production)
    await supabase.from('notifications').insert({ org_id: orgId, kind: 'health_card_expiring', payload: { person_ids: personIds, club_ids: clubIds } })
    toast(t('finance.reminderSent', { n: personIds.length }))
  }

  return (
    <>
      <PageHeader title={t('health.title')} actions={tab === 'expiring' && a.isStaff && (exp.data?.length ?? 0) > 0 && <Button variant="outline" onClick={() => notify((exp.data ?? []).map(x => x.person_id), (exp.data ?? []).map(x => x.home_club_org_id))}>{t('health.notify')}</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'expiring', label: t('health.expiringList'), count: exp.data?.length }, { id: 'all', label: t('common.all'), count: all.data?.length }]} />
      {tab === 'expiring' && (exp.isLoading ? <Spinner /> : (exp.data ?? []).length === 0 ? <Empty /> : (
        <Table><thead><tr><Th>{t('common.person')}</Th><Th>{t('common.club')}</Th><Th>{t('health.expiresOn')}</Th><Th>{t('common.days')}</Th></tr></thead>
          <tbody>{(exp.data ?? []).map(h => (
            <tr key={h.health_card_id}><Td><Link className="text-brand-700 hover:underline" to={`/persons/${h.person_id}`}>{h.last_name} {h.first_name}</Link></Td><Td>{h.club_name ?? '—'}</Td><Td>{fmtDate(h.expires_on)}</Td><Td><Badge tone={h.days_left < 7 ? 'red' : 'amber'}>{h.days_left}</Badge></Td></tr>
          ))}</tbody></Table>
      ))}
      {tab === 'all' && (all.isLoading ? <Spinner /> : (
        <Table><thead><tr><Th>{t('common.person')}</Th><Th>{t('common.club')}</Th><Th>{t('health.issuedOn')}</Th><Th>{t('health.expiresOn')}</Th><Th>{t('common.status')}</Th></tr></thead>
          <tbody>{(all.data ?? []).map(h => { const d = daysUntil(h.expires_on); const st = h.status !== 'valid' ? h.status : d < 0 ? 'expired' : 'valid'; return (
            <tr key={h.id}><Td><Link className="text-brand-700 hover:underline" to={`/persons/${h.person?.id}`}>{fullName(h.person)}</Link></Td><Td>{h.person?.home_club?.name ?? '—'}</Td><Td>{fmtDate(h.issued_on)}</Td><Td>{fmtDate(h.expires_on)}</Td><Td><Badge tone={st === 'valid' ? (d < 30 ? 'amber' : 'green') : 'red'}>{t(`health.${st}`)}{st === 'valid' && d < 30 ? ` · ${d}` : ''}</Badge></Td></tr>) })}</tbody></Table>
      ))}
    </>
  )
}
