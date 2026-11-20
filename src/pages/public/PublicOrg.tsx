import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { pub } from '@/api'
import { Spinner, Empty, Badge, statusTone, PoweredBy } from '@/components/ui'

export function PublicShell({ title, subtitle, children }: { title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-nav text-white"><div className="mx-auto max-w-5xl px-4 py-6"><h1 className="font-display text-2xl font-extrabold tracking-tight">{title}</h1>{subtitle && <p className="mt-1 text-sm text-nav-text [&_a]:text-white">{subtitle}</p>}</div></header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-5xl px-4 py-6 text-center text-xs"><PoweredBy /></footer>
    </div>
  )
}

export default function PublicOrg() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const { t, i18n } = useTranslation()
  const org = useQuery({ queryKey: ['pub-org', orgSlug], queryFn: () => pub.org(orgSlug!) })
  const comps = useQuery({ queryKey: ['pub-comps', org.data?.id], enabled: !!org.data, queryFn: () => pub.competitions(org.data!.id) })
  if (org.isLoading) return <Spinner />
  if (!org.data) return <PublicShell title="404">{t('common.empty')}</PublicShell>
  const O = org.data
  return (
    <PublicShell title={O.name} subtitle={<span>{t(`orgType.${O.type}`)} · {O.city ?? ''}</span>}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{t('public.competitions')}</h2>
      {comps.isLoading ? <Spinner /> : (comps.data ?? []).length === 0 ? <Empty>{t('public.noPublic')}</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(comps.data ?? []).map(c => (
            <Link key={c.id} to={`/f/${orgSlug}/c/${c.slug}`} className="rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-500">
              <div className="font-medium text-brand-700">{c.name}</div>
              <div className="mt-1 text-xs text-slate-500">{c.season_name} · {i18n.language === 'en' ? c.sport_name_en : c.sport_name_el} {c.category_name ? '· ' + c.category_name : ''}</div>
              <div className="mt-2"><Badge tone={statusTone(c.status)}>{t(`comp.status.${c.status}`)}</Badge></div>
            </Link>
          ))}
        </div>
      )}
    </PublicShell>
  )
}
