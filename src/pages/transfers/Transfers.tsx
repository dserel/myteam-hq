import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { transfers, orgs } from '@/api'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Input, PageHeader, Select, Spinner, Table, Td, Th, Empty, statusTone } from '@/components/ui'
import { fmtDate } from '@/lib/format'

const QUEUE = ['submitted', 'under_review']
const ALL = ['draft', 'submitted', 'under_review', 'approved', 'completed', 'rejected', 'cancelled']

export default function Transfers() {
  const { t } = useTranslation()
  const a = useAuth(); const orgId = a.orgId!
  const [sp, setSp] = useSearchParams()
  const statusParam = sp.get('status') ?? (a.isStaff ? 'queue' : 'all')
  const [search, setSearch] = useState('')
  const root = useQuery({ queryKey: ['root', orgId], queryFn: () => orgs.rootOf(orgId) })
  const windows = useQuery({ queryKey: ['tw', orgId, root.data], enabled: !!root.data, queryFn: () => transfers.windows([orgId, root.data!]) })
  const statuses = statusParam === 'queue' ? QUEUE : statusParam === 'all' ? undefined : [statusParam]
  const list = useQuery({
    queryKey: ['transfers', orgId, a.clubId, statusParam],
    queryFn: () => transfers.queue({ orgId, clubId: a.clubId ?? null, status: statuses }),
  })
  const rows = useMemo(() => (list.data ?? []).filter(r => !search ||
    `${r.last_name} ${r.first_name}`.toLowerCase().includes(search.toLowerCase()) ||
    (r.license_no ?? '').includes(search)), [list.data, search])

  // η ανοιχτή περίοδος: το πρώτο πράγμα που θέλει να ξέρει η γραμματεία
  const today = new Date().toISOString().slice(0, 10)
  const openWin = (windows.data ?? []).find(w => w.active && w.opens_on <= today && w.closes_on >= today)

  return (
    <>
      <PageHeader title={t('transfers.title')} subtitle={`${rows.length}`}
        actions={a.canWrite && a.role !== 'treasurer' &&
          <Link to="/transfers/new"><Button data-action="new">{t('transfers.new')}</Button></Link>} />
      <div className="mb-3 rounded-md border px-3 py-2 text-sm" data-window>
        {openWin
          ? <span className="text-emerald-700">● {t('transfers.windowOpen', { name: openWin.name, to: fmtDate(openWin.closes_on) })}</span>
          : <span className="text-slate-500">○ {t('transfers.windowClosed')}</span>}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select className="w-auto" value={statusParam} onChange={e => setSp({ status: e.target.value })}>
          <option value="queue">{t('transfers.queue')}</option><option value="all">{t('common.all')}</option>
          {ALL.map(s => <option key={s} value={s}>{t(`transfers.status.${s}`)}</option>)}
        </Select>
        <Input className="max-w-xs" placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {list.isLoading ? <Spinner /> : rows.length === 0 ? <Empty>{t('transfers.none')}</Empty> : (
        <Table>
          <thead><tr>
            <Th>{t('licenses.number')}</Th><Th>{t('common.person')}</Th><Th>{t('transfers.fromClub')}</Th>
            <Th>{t('transfers.toClub')}</Th><Th>{t('common.sport')}</Th><Th>{t('transfers.docs')}</Th><Th>{t('common.status')}</Th>
          </tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id} className="hover:bg-slate-50" data-transfer={r.id}>
              <Td className="tabular-nums">{r.license_no ?? <span className="text-slate-400">—</span>}</Td>
              <Td><Link className="font-medium text-brand-700 hover:underline" to={`/transfers/${r.id}`}>{r.last_name} {r.first_name}</Link></Td>
              <Td>{r.from_club_name}</Td>
              <Td className="font-medium">{r.to_club_name}</Td>
              <Td>{r.sport_name}</Td>
              <Td>{r.documents}{r.problems > 0 && <Badge tone="red" className="ml-1">{r.problems}</Badge>}</Td>
              <Td><Badge tone={statusTone(r.status)}>{t(`transfers.status.${r.status}`)}</Badge></Td>
            </tr>))}</tbody>
        </Table>
      )}
    </>
  )
}
