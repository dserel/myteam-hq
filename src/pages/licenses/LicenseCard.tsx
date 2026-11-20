import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { licenses } from '@/api'
import { Spinner } from '@/components/ui'
import { fmtDate } from '@/lib/format'

/** Printable athlete license (ID-card format). Print → Save as PDF gives the PDF export.
 *  myTeam HQ branding: issuing body on top (it is THEIR licence), navy band, gold "issued"
 *  seal, "Powered by myTeam HQ" at the foot. */
export default function LicenseCard() {
  const { id } = useParams<{ id: string }>()
  const lic = useQuery({ queryKey: ['license', id], queryFn: () => licenses.get(id!) })
  if (lic.isLoading || !lic.data) return <Spinner />
  const l = lic.data
  const url = `${window.location.origin}/v/${l.qr_token}`
  return (
    <div className="min-h-screen bg-canvas p-8 print:bg-white print:p-0">
      <style>{`@media print { @page { size: 86mm 54mm; margin: 0 } body { background: white } * { -webkit-print-color-adjust: exact; print-color-adjust: exact } }`}</style>
      <div className="mx-auto flex w-[86mm] flex-col overflow-hidden rounded-xl border border-line bg-white shadow print:rounded-none print:border-0 print:shadow-none" style={{ height: '54mm' }}>
        <div className="flex items-center justify-between gap-2 bg-hq-navy px-3 py-[5px] text-white">
          <div className="line-clamp-2 text-[7.5px] font-semibold uppercase leading-[1.25] tracking-wide">{l.issuer?.name}</div>
          <div className="shrink-0 rounded-[3px] bg-hq-gold px-1.5 py-[1px] text-[7px] font-bold uppercase tracking-wide text-hq-navy">Δελτιο αθλητη</div>
        </div>
        <div className="flex min-h-0 flex-1 gap-3 px-3 pt-2">
          <div className="flex w-[21mm] flex-col items-center justify-between pb-1">
            <div className="flex h-[24mm] w-[19mm] items-center justify-center overflow-hidden rounded bg-canvas text-[8px] text-ink-500">{l.person?.photo_path ? <img src={l.person.photo_path} className="h-full w-full object-cover" /> : 'ΦΩΤΟ'}</div>
            <QRCodeSVG value={url} size={52} fgColor="#131429" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-between pb-1">
            <div>
              <div className="text-[8.5px] font-medium text-ink-500">{l.sport?.name_el}</div>
              <div className="mt-1 text-[13px] font-bold leading-tight text-ink-900">{l.person?.last_name}<br />{l.person?.first_name}</div>
              <div className="text-[9.5px] text-ink-600">{fmtDate(l.person?.birth_date)}</div>
              <div className="mt-1 line-clamp-2 text-[9px] font-medium leading-snug text-ink-800">{l.club?.name}</div>
            </div>
            <div className="flex items-end justify-between">
              <div><div className="text-[7px] font-semibold uppercase tracking-wide text-ink-500">Αριθμος</div><div className="text-[12.5px] font-bold tabular-nums text-ink-900">{l.license_no}</div></div>
              <div className="text-right"><div className="text-[7px] font-semibold uppercase tracking-wide text-ink-500">Ισχυς εως</div><div className="text-[10.5px] font-semibold text-ink-900">{fmtDate(l.valid_to)}</div><div className="text-[7.5px] text-ink-500">{l.season?.name}</div></div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-1 border-t border-line py-[3px] text-[6.5px] text-ink-500">
          <img src="/favicon.svg" alt="" className="h-[9px] w-[9px] rounded-[2px]" /> Powered by myTeam HQ
        </div>
      </div>
      <div className="mx-auto mt-4 w-[86mm] text-center print:hidden"><button onClick={() => window.print()} className="rounded-[10px] bg-hq-navy px-4 py-2 text-sm font-semibold text-white hover:bg-hq-navy-2">Εκτύπωση / PDF</button></div>
    </div>
  )
}
