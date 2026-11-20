import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import * as XLSX from 'xlsx'
import { finance } from '@/api'
import { useAuth } from '@/lib/auth'
import { Button, PageHeader, Spinner, Table, Td, Th, Empty, Stat } from '@/components/ui'
import { money, fmtDate } from '@/lib/format'
import { useToast } from '@/lib/toast'

export default function FinanceOverview() {
  const { t } = useTranslation()
  const a = useAuth(); const orgId = a.orgId!
  const toast = useToast()
  const [sp] = useSearchParams()
  const [debtors, setDebtors] = useState(sp.get('debtors') === '1')
  const bal = useQuery({ queryKey: ['balances', orgId], queryFn: () => finance.balances(orgId) })
  const clubBal = useQuery({ queryKey: ['club-balances', a.clubId], enabled: !!a.clubId, queryFn: () => finance.balancesOfClub(a.clubId!) })
  const [busy, setBusy] = useState(false)

  if (a.role === 'club_manager') {
    const rows = clubBal.data ?? []
    if (rows.length === 1) return <Navigate to={`/finance/accounts/${rows[0].account_id}`} replace />
    return (
      <>
        <PageHeader title={t('nav.myAccount')} />
        <div className="grid gap-3 sm:grid-cols-2">{rows.map(b => <Link key={b.account_id} to={`/finance/accounts/${b.account_id}`}><Stat label={b.org_name} value={money(b.balance)} tone={Number(b.balance) > 0 ? 'red' : 'green'} /></Link>)}</div>
      </>
    )
  }

  const rows = (bal.data ?? []).filter(b => !debtors || Number(b.balance) > 0)
  const total = rows.reduce((s, b) => s + Number(b.balance), 0)
  const canRemind = a.isTreasurer && !a.isFederation || (a.isFederation && a.isTreasurer)

  async function remindAll() {
    setBusy(true)
    try {
      let n = 0
      for (const b of (bal.data ?? []).filter(x => Number(x.balance) > 0)) {
        const contacts = await finance.clubContacts(b.club_org_id)
        const to = contacts.find(c => c.is_primary && c.email)?.email ?? contacts.find(c => c.email)?.email
        if (!to) continue
        await finance.addReminder({ account_id: b.account_id, org_id: orgId, balance_at_send: b.balance, to_email: to, subject: `Υπενθύμιση οφειλής ${money(b.balance)} — ${b.org_name}`, body_snapshot: `Αγαπητοί, το υπόλοιπο του σωματείου ${b.club_name} προς ${b.org_name} είναι ${money(b.balance)}.`, delivery_status: 'queued' })
        n++
      }
      toast(t('finance.reminderSent', { n }))
    } finally { setBusy(false) }
  }
  function exportXlsx() {
    const ws = XLSX.utils.json_to_sheet(rows.map(b => ({ 'Σύλλογος': b.club_name, 'Υπόλοιπο': Number(b.balance), '0-30': Number(b.aging_0_30), '31-60': Number(b.aging_31_60), '61-90': Number(b.aging_61_90), '90+': Number(b.aging_90_plus), 'Τελευταία πληρωμή': b.last_payment_on })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Υπόλοιπα'); XLSX.writeFile(wb, 'balances.xlsx')
  }

  return (
    <>
      <PageHeader title={t('finance.overview')} subtitle={a.current?.org.name}
        actions={<>
          <Button variant="outline" onClick={exportXlsx}>{t('common.export')}</Button>
          {canRemind && <Button loading={busy} onClick={remindAll}>{t('finance.remindAll')}</Button>}
        </>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label={t('dashboard.openBalance')} value={money((bal.data ?? []).reduce((s, b) => s + Math.max(0, Number(b.balance)), 0))} tone="red" />
        <Stat label={t('dashboard.viewDebtors')} value={(bal.data ?? []).filter(b => Number(b.balance) > 0).length} />
        <Stat label={t('finance.aging.b90')} value={money((bal.data ?? []).reduce((s, b) => s + Number(b.aging_90_plus), 0))} tone="amber" />
      </div>
      <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={debtors} onChange={e => setDebtors(e.target.checked)} /> {t('finance.debtorsOnly')}</label>
      {bal.isLoading ? <Spinner /> : rows.length === 0 ? <Empty /> : (
        <Table>
          <thead><tr><Th>{t('common.club')}</Th><Th right>{t('finance.balance')}</Th><Th right>{t('finance.aging.b0')}</Th><Th right>{t('finance.aging.b31')}</Th><Th right>{t('finance.aging.b61')}</Th><Th right>{t('finance.aging.b90')}</Th><Th>{t('finance.lastPayment')}</Th><Th>{t('finance.oldestDue')}</Th></tr></thead>
          <tbody>
            {rows.map(b => (
              <tr key={b.account_id} className="hover:bg-slate-50">
                <Td><Link className="font-medium text-brand-700 hover:underline" to={`/finance/accounts/${b.account_id}`}>{b.club_name}</Link></Td>
                <Td right className={Number(b.balance) > 0 ? 'font-semibold text-red-700' : 'text-emerald-700'}>{money(b.balance)}</Td>
                <Td right>{Number(b.aging_0_30) ? money(b.aging_0_30) : ''}</Td><Td right>{Number(b.aging_31_60) ? money(b.aging_31_60) : ''}</Td>
                <Td right className="text-amber-700">{Number(b.aging_61_90) ? money(b.aging_61_90) : ''}</Td><Td right className="text-red-700">{Number(b.aging_90_plus) ? money(b.aging_90_plus) : ''}</Td>
                <Td>{fmtDate(b.last_payment_on)}</Td><Td>{fmtDate(b.oldest_open_due)}</Td>
              </tr>))}
            <tr className="bg-slate-50 font-semibold"><Td>{t('common.total')}</Td><Td right>{money(total)}</Td><Td colSpan={6} /></tr>
          </tbody>
        </Table>
      )}
    </>
  )
}
