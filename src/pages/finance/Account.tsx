import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import * as XLSX from 'xlsx'
import { finance, orgs } from '@/api'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, Textarea, ErrorBox, Stat } from '@/components/ui'
import { money, fmtDate, fmtDateTime, errorMessage } from '@/lib/format'
import { useToast } from '@/lib/toast'

export default function Account() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const a = useAuth(); const orgId = a.orgId!
  const qc = useQueryClient(); const toast = useToast()
  const acc = useQuery({ queryKey: ['account', id], queryFn: () => finance.account(id!) })
  const entries = useQuery({ queryKey: ['entries', id], queryFn: () => finance.entries(id!) })
  const open = useQuery({ queryKey: ['open-charges', id], queryFn: () => finance.openCharges(id!) })
  const payments = useQuery({ queryKey: ['payments', id], queryFn: () => finance.payments(id!) })
  const reminders = useQuery({ queryKey: ['reminders', id], queryFn: () => finance.reminders(id!) })
  const exemptions = useQuery({ queryKey: ['exemptions', id], queryFn: () => finance.exemptions(id!) })
  const feeTypes = useQuery({ queryKey: ['fee-types', acc.data?.org_id], enabled: !!acc.data, queryFn: () => finance.feeTypes(acc.data!.org_id) })
  const seasons = useQuery({ queryKey: ['seasons', acc.data?.org_id], enabled: !!acc.data, queryFn: () => orgs.seasons(acc.data!.org_id) })
  const [payOpen, setPay] = useState(false); const [chargeOpen, setCharge] = useState(false); const [exOpen, setEx] = useState(false)
  const [pay, setPayForm] = useState({ amount: '', method: 'bank_transfer', paid_on: new Date().toISOString().slice(0, 10), reference_no: '', payer_name: '', notes: '', auto: true, alloc: {} as Record<string, string> })
  const [charge, setChargeForm] = useState({ fee_type_id: '', amount: '', description: '', due_on: '' })
  const [ex, setExForm] = useState({ reason: '', until_date: '' })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inv = () => ['account', 'entries', 'open-charges', 'payments', 'reminders', 'exemptions'].forEach(k => qc.invalidateQueries({ queryKey: [k, id] }))
  const canWrite = a.isTreasurer && acc.data?.org_id === orgId  // direct staff only (federation reads unions read-only)

  const rows = useMemo(() => { let run = 0; return (entries.data ?? []).map(e => { run += Number(e.amount); return { ...e, run } }) }, [entries.data])
  if (acc.isLoading || !acc.data) return <Spinner />
  const A = acc.data

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    try {
      const allocations = pay.auto ? null : Object.entries(pay.alloc).filter(([, v]) => Number(v) > 0).map(([k, v]) => ({ charge_entry_id: k, amount: Number(v) }))
      await finance.recordPayment({ orgId: A.org_id, clubId: A.club_org_id, amount: Number(pay.amount), method: pay.method, paidOn: pay.paid_on, referenceNo: pay.reference_no || undefined, payer: pay.payer_name || undefined, notes: pay.notes || undefined, allocations })
      setPay(false); inv(); toast(t('finance.paymentRecorded'))
    } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }
  async function postCharge(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    try {
      await finance.postCharge({ orgId: A.org_id, clubId: A.club_org_id, feeTypeId: charge.fee_type_id, amount: charge.amount ? Number(charge.amount) : null, description: charge.description || undefined, dueOn: charge.due_on || undefined, seasonId: seasons.data?.find(s => s.is_current)?.id })
      setCharge(false); inv(); toast(t('common.saved'))
    } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }
  async function reverse(entryId: string) {
    const reason = prompt(t('finance.reverseReason')); if (!reason) return
    try { await finance.reverse(entryId, reason); inv(); toast(t('common.saved')) } catch (e) { toast(errorMessage(e)) }
  }
  async function remind() {
    const contacts = await finance.clubContacts(A.club_org_id)
    const to = contacts.find(c => c.is_primary && c.email)?.email ?? contacts.find(c => c.email)?.email ?? prompt(t('common.email')) ?? ''
    if (!to) return
    const openList = (open.data ?? []).map(c => `• ${c.description}: ${money(c.open_amount)}`).join('\n')
    await finance.addReminder({ account_id: id, org_id: orgId, balance_at_send: A.balance, to_email: to, subject: `Υπενθύμιση οφειλής ${money(A.balance)} — ${A.org_name}`, body_snapshot: `Αγαπητοί,\n\nτο υπόλοιπο του σωματείου ${A.club_name} προς ${A.org_name} είναι ${money(A.balance)}.\n\nΑνοιχτές χρεώσεις:\n${openList}\n\nΜε εκτίμηση,\n${A.org_name}` })
    inv(); toast(t('finance.reminderSent', { n: 1 }))
  }
  async function addExemption(e: React.FormEvent) {
    e.preventDefault(); await finance.addExemption({ account_id: id, org_id: A.org_id, ...ex }); setEx(false); inv()
  }
  function exportXlsx() {
    const ws = XLSX.utils.json_to_sheet(rows.map(e => ({ 'Ημερομηνία': e.posted_at?.slice(0, 10), 'Τύπος': t(`finance.${e.entry_type}`), 'Περιγραφή': e.description, 'Χρέωση': Number(e.amount) > 0 ? Number(e.amount) : '', 'Πίστωση': Number(e.amount) < 0 ? -Number(e.amount) : '', 'Υπόλοιπο': e.run })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Καρτέλα'); XLSX.writeFile(wb, `account-${A.club_name}.xlsx`)
  }
  const allocSum = Object.values(pay.alloc).reduce((s, v) => s + (Number(v) || 0), 0)
  const activeEx = (exemptions.data ?? []).find(x => x.until_date >= new Date().toISOString().slice(0, 10))

  return (
    <>
      <PageHeader title={<span>{A.club_name} <span className="text-slate-400">→</span> {A.org_name}</span>} subtitle={t('finance.account')}
        actions={<>
          <Button variant="outline" onClick={exportXlsx}>{t('common.export')}</Button>
          {canWrite && <Button variant="outline" onClick={remind} disabled={Number(A.balance) <= 0}>{t('finance.sendReminder')}</Button>}
          {canWrite && <Button variant="outline" onClick={() => setCharge(true)}>{t('finance.newCharge')}</Button>}
          {canWrite && <Button onClick={() => setPay(true)}>{t('finance.recordPayment')}</Button>}
        </>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label={t('finance.balance')} value={money(A.balance)} tone={Number(A.balance) > 0 ? 'red' : 'green'} />
        <Stat label={t('finance.aging.b0')} value={money(A.aging_0_30)} />
        <Stat label={`${t('finance.aging.b31')} / ${t('finance.aging.b61')}`} value={money(Number(A.aging_31_60) + Number(A.aging_61_90))} tone="amber" />
        <Stat label={t('finance.aging.b90')} value={money(A.aging_90_plus)} tone="red" hint={activeEx ? `${t('finance.exemption')} → ${fmtDate(activeEx.until_date)}` : undefined} />
      </div>

      <div className="grid gap-4">
        <Card title={t('finance.entries')}>
          <p className="mb-2 text-xs text-slate-500">{t('finance.immutable')}</p>
          <Table>
            <thead><tr><Th>{t('common.date')}</Th><Th>{t('finance.description')}</Th><Th right>{t('finance.charge')}</Th><Th right>{t('finance.payment')}</Th><Th right>{t('finance.runningBalance')}</Th><Th /></tr></thead>
            <tbody>{rows.map(e => {
              const reversed = (entries.data ?? []).some(x => x.reversal_of_id === e.id)
              return (
                <tr key={e.id} className={reversed || e.entry_type === 'reversal' ? 'text-slate-400 line-through decoration-slate-300' : ''}>
                  <Td className="whitespace-nowrap text-xs">{fmtDate(e.posted_at)}</Td>
                  <Td><span className="no-underline">{e.description}</span> {e.fee_type && <span className="text-xs text-slate-400">· {e.fee_type.code}</span>}{e.due_on && Number(e.amount) > 0 && <span className="text-xs text-slate-400"> · {t('finance.dueOn')} {fmtDate(e.due_on)}</span>}</Td>
                  <Td right>{Number(e.amount) > 0 ? money(e.amount) : ''}</Td><Td right>{Number(e.amount) < 0 ? money(-Number(e.amount)) : ''}</Td>
                  <Td right className="font-medium">{money(e.run)}</Td>
                  <Td right>{canWrite && !reversed && e.entry_type !== 'reversal' && <button className="text-xs text-red-600" onClick={() => reverse(e.id)}>{t('finance.reverse')}</button>}</Td>
                </tr>)
            })}</tbody>
          </Table>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('finance.payment')}>
            <ul className="divide-y divide-slate-100 text-sm">{(payments.data ?? []).map(p => (
              <li key={p.id} className="flex items-center justify-between py-1.5">
                <span>{fmtDate(p.paid_on)} · {money(p.amount)} <span className="text-xs text-slate-500">{t(`finance.${p.method}`)}</span> {p.status === 'reversed' && <Badge tone="red">{t('finance.reversed')}</Badge>}</span>
                <Link to={`/print/receipt/${p.id}`} target="_blank" className="text-xs text-brand-700 underline">{p.receipt_no}</Link>
              </li>))}</ul>
            {(payments.data ?? []).length === 0 && <div className="text-sm text-slate-500">—</div>}
          </Card>
          <Card title={t('finance.reminders')} actions={canWrite && a.isAdmin && <Button size="sm" variant="ghost" onClick={() => setEx(true)}>{t('finance.addExemption')}</Button>}>
            <ul className="space-y-1 text-xs text-slate-600">{(reminders.data ?? []).map(r => <li key={r.id}>{fmtDateTime(r.sent_at)} → {r.to_email} ({money(r.balance_at_send)}) <Badge tone={r.delivery_status === 'sent' ? 'green' : 'gray'}>{r.delivery_status}</Badge></li>)}</ul>
            {(exemptions.data ?? []).length > 0 && <div className="mt-2 text-xs"><b>{t('finance.exemption')}:</b> {(exemptions.data ?? []).map(x => <div key={x.id}>{x.reason} → {fmtDate(x.until_date)}</div>)}</div>}
          </Card>
        </div>
      </div>

      <Modal open={payOpen} onClose={() => setPay(false)} title={t('finance.recordPayment')} wide>
        <form onSubmit={recordPayment} className="grid gap-3 sm:grid-cols-3">
          <Field label={t('common.amount')} required><Input type="number" step="0.01" min="0.01" required value={pay.amount} onChange={e => setPayForm({ ...pay, amount: e.target.value })} /></Field>
          <Field label={t('finance.method')}><Select value={pay.method} onChange={e => setPayForm({ ...pay, method: e.target.value })}><option value="bank_transfer">{t('finance.bank_transfer')}</option><option value="cash">{t('finance.cash')}</option><option value="other">{t('finance.other')}</option></Select></Field>
          <Field label={t('common.date')}><Input type="date" value={pay.paid_on} onChange={e => setPayForm({ ...pay, paid_on: e.target.value })} /></Field>
          <Field label={t('finance.referenceNo')}><Input value={pay.reference_no} onChange={e => setPayForm({ ...pay, reference_no: e.target.value })} /></Field>
          <Field label={t('finance.payer')} className="sm:col-span-2"><Input value={pay.payer_name} onChange={e => setPayForm({ ...pay, payer_name: e.target.value })} placeholder={A.club_name} /></Field>
          <Field label={t('common.notes')} className="sm:col-span-3"><Textarea rows={2} value={pay.notes} onChange={e => setPayForm({ ...pay, notes: e.target.value })} /></Field>
          <div className="sm:col-span-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pay.auto} onChange={e => setPayForm({ ...pay, auto: e.target.checked })} /> {t('finance.autoAllocate')}</label>
            {!pay.auto && (
              <Table className="mt-2"><thead><tr><Th>{t('finance.description')}</Th><Th right>{t('finance.openAmount')}</Th><Th right>{t('finance.allocate')}</Th></tr></thead>
                <tbody>{(open.data ?? []).map(c => (
                  <tr key={c.charge_entry_id}><Td>{c.description}</Td><Td right>{money(c.open_amount)}</Td><Td right><Input type="number" step="0.01" min="0" max={c.open_amount} className="w-28 text-right" value={pay.alloc[c.charge_entry_id] ?? ''} onChange={e => setPayForm({ ...pay, alloc: { ...pay.alloc, [c.charge_entry_id]: e.target.value } })} /></Td></tr>
                ))}<tr className="font-medium"><Td colSpan={2}>{t('common.total')}</Td><Td right className={allocSum > Number(pay.amount) ? 'text-red-600' : ''}>{money(allocSum)}</Td></tr></tbody></Table>
            )}
          </div>
          {err && <div className="sm:col-span-3"><ErrorBox error={err} /></div>}
          <div className="flex justify-end gap-2 sm:col-span-3"><Button type="button" variant="outline" onClick={() => setPay(false)}>{t('common.cancel')}</Button><Button type="submit" loading={busy} disabled={!pay.auto && allocSum > Number(pay.amount)}>{t('common.save')}</Button></div>
        </form>
      </Modal>
      <Modal open={chargeOpen} onClose={() => setCharge(false)} title={t('finance.newCharge')}>
        <form onSubmit={postCharge} className="grid gap-3">
          <Field label={t('finance.feeType')} required><Select required value={charge.fee_type_id} onChange={e => setChargeForm({ ...charge, fee_type_id: e.target.value })}><option value="">{t('common.select')}</option>{(feeTypes.data ?? []).filter(f => f.active).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
          <Field label={t('common.amount')} hint={t('finance.noPrice')}><Input type="number" step="0.01" min="0" value={charge.amount} onChange={e => setChargeForm({ ...charge, amount: e.target.value })} /></Field>
          <Field label={t('finance.description')}><Input value={charge.description} onChange={e => setChargeForm({ ...charge, description: e.target.value })} /></Field>
          <Field label={t('finance.dueOn')}><Input type="date" value={charge.due_on} onChange={e => setChargeForm({ ...charge, due_on: e.target.value })} /></Field>
          {err && <ErrorBox error={err} />}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCharge(false)}>{t('common.cancel')}</Button><Button type="submit" loading={busy}>{t('common.save')}</Button></div>
        </form>
      </Modal>
      <Modal open={exOpen} onClose={() => setEx(false)} title={t('finance.addExemption')}>
        <form onSubmit={addExemption} className="grid gap-3">
          <Field label={t('finance.reason')} required><Input required value={ex.reason} onChange={e => setExForm({ ...ex, reason: e.target.value })} /></Field>
          <Field label={t('finance.until')} required><Input type="date" required value={ex.until_date} onChange={e => setExForm({ ...ex, until_date: e.target.value })} /></Field>
          <div className="flex justify-end"><Button type="submit">{t('common.save')}</Button></div>
        </form>
      </Modal>
    </>
  )
}
