import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { finance } from '@/api'
import { Spinner } from '@/components/ui'
import { money, fmtDate } from '@/lib/format'

/** Printable receipt (browser print → PDF). */
export default function Receipt() {
  const { id } = useParams<{ id: string }>()
  const p = useQuery({ queryKey: ['payment', id], queryFn: () => finance.payment(id!) })
  if (p.isLoading || !p.data) return <Spinner />
  const P = p.data
  const org = P.account?.org; const club = P.account?.club
  return (
    <div className="min-h-screen bg-slate-100 p-8 print:bg-white print:p-0">
      <style>{`@media print { @page { size: A5; margin: 12mm } }`}</style>
      <div className="mx-auto max-w-lg rounded-lg border border-slate-300 bg-white p-8 shadow print:border-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div><div className="text-lg font-bold text-brand-700">{org?.name}</div><div className="text-xs text-slate-500">ΑΦΜ {org?.vat_number} · {org?.address_city}</div></div>
          <div className="text-right"><div className="text-xs uppercase tracking-wide text-slate-500">Απόδειξη είσπραξης</div><div className="text-lg font-bold tabular-nums">{P.receipt_no}</div><div className="text-xs text-slate-500">{fmtDate(P.paid_on)}</div></div>
        </div>
        <dl className="mt-4 grid grid-cols-[140px_1fr] gap-y-1.5 text-sm">
          <dt className="text-slate-500">Από</dt><dd className="font-medium">{club?.name}</dd>
          <dt className="text-slate-500">ΑΦΜ</dt><dd>{club?.vat_number ?? '—'}</dd>
          <dt className="text-slate-500">Καταθέτης</dt><dd>{P.payer_name ?? '—'}</dd>
          <dt className="text-slate-500">Μέθοδος</dt><dd>{{ bank_transfer: 'Κατάθεση', cash: 'Μετρητά', other: 'Άλλο', online: 'Online' }[P.method as string]} {P.reference_no && `· ${P.reference_no}`}</dd>
          {P.notes && <><dt className="text-slate-500">Σημειώσεις</dt><dd>{P.notes}</dd></>}
        </dl>
        <table className="mt-6 w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500"><th className="py-1">Έναντι χρέωσης</th><th className="py-1 text-right">Ποσό</th></tr></thead>
          <tbody>
            {(P.allocations ?? []).map((al: { id: string; amount: number; charge?: { description: string } }) => <tr key={al.id} className="border-b border-slate-100"><td className="py-1">{al.charge?.description}</td><td className="py-1 text-right tabular-nums">{money(al.amount)}</td></tr>)}
            {(P.allocations ?? []).length === 0 && <tr><td className="py-1 text-slate-500">Γενική πίστωση</td><td className="py-1 text-right">{money(P.amount)}</td></tr>}
          </tbody>
          <tfoot><tr className="font-bold"><td className="pt-2">Σύνολο</td><td className="pt-2 text-right tabular-nums">{money(P.amount)}</td></tr></tfoot>
        </table>
        {P.status === 'reversed' && <div className="mt-4 rounded bg-red-50 px-3 py-2 text-center text-sm font-semibold text-red-700">ΑΚΥΡΩΘΗΚΕ (ΑΝΤΙΛΟΓΙΣΜΟΣ)</div>}
        <div className="mt-10 flex justify-between text-xs text-slate-500"><span>Ο ταμίας</span><span>Σφραγίδα</span></div>
      </div>
      <div className="mx-auto mt-4 max-w-lg text-center print:hidden"><button onClick={() => window.print()} className="rounded bg-brand-600 px-4 py-2 text-sm text-white">Εκτύπωση / PDF</button></div>
    </div>
  )
}
