import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { pub } from '@/api'
import { Spinner } from '@/components/ui'
import { fmtDate } from '@/lib/format'

/** Public license verification — shows the minimum: number, name, club, sport, status, validity. */
export default function Verify() {
  const { token } = useParams<{ token: string }>()
  const { t, i18n } = useTranslation()
  const r = useQuery({ queryKey: ['verify', token], queryFn: () => pub.verify(token!) })
  if (r.isLoading) return <Spinner />
  const L = (r.data as Array<{ license_no: string; full_name: string; club_name: string; sport_name_el: string; sport_name_en: string; issuer_name: string; status: string; valid_from: string; valid_to: string; photo_path: string | null; season_name: string }> | null)?.[0]
  const tone = L?.status === 'valid' ? 'bg-emerald-600' : 'bg-red-600'
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow">
        <div className={`px-5 py-4 text-white ${L ? tone : 'bg-slate-500'}`}>
          <div className="text-xs uppercase tracking-wide opacity-80">{t('public.verifyTitle')}</div>
          <div className="text-2xl font-bold">{L ? t(`public.${L.status}`) : '—'}</div>
        </div>
        <div className="p-5">
          {!L ? <p className="text-sm text-slate-600">{t('public.notFound')}</p> : (
            <>
              {L.photo_path && <img src={L.photo_path} alt="" className="mb-3 h-28 w-24 rounded object-cover" />}
              <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
                <dt className="text-slate-500">{t('licenses.number')}</dt><dd className="font-mono font-semibold">{L.license_no}</dd>
                <dt className="text-slate-500">{t('common.name')}</dt><dd className="font-medium">{L.full_name}</dd>
                <dt className="text-slate-500">{t('common.club')}</dt><dd>{L.club_name}</dd>
                <dt className="text-slate-500">{t('common.sport')}</dt><dd>{i18n.language === 'en' ? L.sport_name_en : L.sport_name_el}</dd>
                <dt className="text-slate-500">{t('common.season')}</dt><dd>{L.season_name}</dd>
                <dt className="text-slate-500">{t('licenses.validTo')}</dt><dd>{fmtDate(L.valid_to)}</dd>
                <dt className="text-slate-500">{t('public.issuedBy')}</dt><dd>{L.issuer_name}</dd>
              </dl>
            </>
          )}
        </div>
        <div className="border-t border-slate-100 px-5 py-2 text-center text-[10px] text-slate-400">{t('public.poweredBy')}</div>
      </div>
    </div>
  )
}
