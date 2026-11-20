import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { licenses } from '@/api'
import { Spinner } from '@/components/ui'
import { fmtDate } from '@/lib/format'

/** Printable athlete license (ID-card format). Print → Save as PDF gives the PDF export. */
export default function LicenseCard() {
  const { id } = useParams<{ id: string }>()
  const lic = useQuery({ queryKey: ['license', id], queryFn: () => licenses.get(id!) })
  if (lic.isLoading || !lic.data) return <Spinner />
  const l = lic.data
  const url = `${window.location.origin}/v/${l.qr_token}`
  return (
    <div className="min-h-screen bg-slate-100 p-8 print:bg-white print:p-0">
      <style>{`@media print { @page { size: 86mm 54mm; margin: 0 } body { background: white } }`}</style>
      <div className="mx-auto w-[86mm] rounded-xl border border-slate-300 bg-white p-4 shadow print:rounded-none print:border-0 print:shadow-none" style={{ height: '54mm' }}>
        <div className="flex h-full gap-3">
          <div className="flex w-[22mm] flex-col items-center justify-between">
            <div className="flex h-[26mm] w-[22mm] items-center justify-center rounded bg-slate-200 text-[9px] text-slate-500">{l.person?.photo_path ? <img src={l.person.photo_path} className="h-full w-full object-cover" /> : 'ΦΩΤΟ'}</div>
            <QRCodeSVG value={url} size={60} />
          </div>
          <div className="flex flex-1 flex-col justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-brand-700">{l.issuer?.name}</div>
              <div className="text-[9px] text-slate-500">ΔΕΛΤΙΟ ΑΘΛΗΤΗ · {l.sport?.name_el}</div>
              <div className="mt-2 text-sm font-bold leading-tight">{l.person?.last_name}<br />{l.person?.first_name}</div>
              <div className="text-[10px] text-slate-600">{fmtDate(l.person?.birth_date)}</div>
              <div className="mt-1 text-[10px] font-medium">{l.club?.name}</div>
            </div>
            <div className="flex items-end justify-between">
              <div><div className="text-[8px] text-slate-500">ΑΡΙΘΜΟΣ</div><div className="text-sm font-bold tabular-nums">{l.license_no}</div></div>
              <div className="text-right"><div className="text-[8px] text-slate-500">ΙΣΧΥΣ ΕΩΣ</div><div className="text-[11px] font-semibold">{fmtDate(l.valid_to)}</div><div className="text-[8px] text-slate-500">{l.season?.name}</div></div>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-4 w-[86mm] text-center print:hidden"><button onClick={() => window.print()} className="rounded bg-brand-600 px-4 py-2 text-sm text-white">Εκτύπωση / PDF</button></div>
    </div>
  )
}
