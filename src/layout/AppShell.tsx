import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Building2, Users, ShieldCheck, HeartPulse, Wallet, Trophy, FileSpreadsheet, UserCog, Settings, LayoutDashboard, LogOut, Globe, Menu, Layers, Tag, ArrowLeftRight } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useQuery } from '@tanstack/react-query'
import { dashboard, orgs } from '@/api'
import { setLocale } from '@/i18n'
import { cn } from '@/components/ui'

export default function AppShell() {
  const { t, i18n } = useTranslation()
  const a = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const role = a.role
  const isClub = role === 'club_manager'
  const root = useQuery({ queryKey: ['root', a.orgId], enabled: !!a.orgId, queryFn: () => orgs.rootOf(a.orgId!) })
  // Οι διακόπτες του φορέα (07 §4): τμήματα κρύβονται τελείως όταν δεν χρησιμοποιούνται
  const settings = useQuery({ queryKey: ['ui-settings', a.orgId], enabled: !!a.orgId, queryFn: () => orgs.uiSettings(a.orgId!) })
  const sectionsOn = settings.data?.sections_enabled !== false
  const counts = useQuery({ queryKey: ['dash', a.orgId, root.data], enabled: !!root.data && !isClub, queryFn: () => dashboard.counts(a.orgId!, root.data!) })
  const pending = counts.data?.pending ?? 0

  type Item = { to: string; label: string; icon: React.ElementType; show: boolean }
  const items: Item[] = [
    { to: '/', label: t('nav.dashboard'), icon: LayoutDashboard, show: true },
    { to: '/clubs', label: isClub ? t('nav.myClub') : t('nav.clubs'), icon: Building2, show: true },
    { to: '/sections', label: t('nav.sections'), icon: Layers, show: sectionsOn },
    { to: '/persons', label: t('nav.persons'), icon: Users, show: true },
    { to: '/licenses', label: t('nav.licenses'), icon: ShieldCheck, show: true },
    { to: '/transfers', label: t('nav.transfers'), icon: ArrowLeftRight, show: role !== 'treasurer' },
    { to: '/health-cards', label: t('nav.healthCards'), icon: HeartPulse, show: role !== 'treasurer' },
    { to: '/finance', label: isClub ? t('nav.myAccount') : t('nav.finance'), icon: Wallet, show: true },
    { to: '/finance/price-list', label: t('nav.priceList'), icon: Tag, show: !isClub },
    { to: '/competitions', label: t('nav.competitions'), icon: Trophy, show: true },
    { to: '/import', label: t('nav.import'), icon: FileSpreadsheet, show: a.isStaff && role !== 'treasurer' },
    { to: '/members', label: t('nav.members'), icon: UserCog, show: a.isStaff && role !== 'treasurer' },
    { to: '/settings', label: t('nav.settings'), icon: Settings, show: a.isAdmin || role === 'viewer' || role === 'treasurer' || role === 'secretary' },
  ]

  const orgLabel = a.current ? `${a.current.org.short_name ?? a.current.org.name}${a.current.club ? ' · ' + a.current.club.name : ''}` : ''

  return (
    <div className="flex min-h-screen">
      <aside className={cn('fixed inset-y-0 left-0 z-40 w-60 transform bg-nav text-nav-text transition-transform lg:static lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="border-b border-nav-line px-5 py-5">
          <div className="font-display text-[15px] font-extrabold text-white">{t('app.name')}</div>
          <div className="mt-1.5 truncate text-xs text-nav-muted" title={orgLabel}>{orgLabel}</div>
          {role && <div className="mt-2 inline-block rounded-full bg-[#1e2c4d] px-2 py-0.5 text-[11px] font-semibold text-[#dbe4ff]">{t(`roles.${role}`)}</div>}
          {a.memberships.length > 1 && (
            <select className="mt-2 w-full rounded border border-nav-line bg-[#16223f] px-2 py-1 text-xs text-nav-text" value={a.current?.id ?? ''} onChange={e => { a.setCurrent(e.target.value); nav('/') }} title={t('nav.switchOrg')}>
              {a.memberships.map(m => <option key={m.id} value={m.id}>{m.org.short_name ?? m.org.name}{m.club ? ' · ' + m.club.name : ''} — {t(`roles.${m.role}`)}</option>)}
            </select>
          )}
        </div>
        <nav className="flex flex-col gap-0.5 p-2">
          {items.filter(i => i.show).map(i => (
            <NavLink key={i.to} to={i.to} end={i.to === '/' || i.to === '/finance'} onClick={() => setOpen(false)}
              className={({ isActive }) => cn('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm', isActive ? 'bg-brand-600 font-semibold text-white' : 'text-nav-text hover:bg-[#16223f] hover:text-white')}>
              <i.icon size={16} /> <span className="flex-1">{i.label}</span>{i.to === '/licenses' && pending > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">{pending}</span>}
            </NavLink>
          ))}
          {a.current?.org.slug && (
            <a href={`/f/${a.current.org.slug}`} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-nav-text hover:bg-[#16223f] hover:text-white"><Globe size={16} /> {t('nav.publicPage')}</a>
          )}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t border-nav-line p-3 text-xs">
          <div className="mb-2 truncate text-nav-muted">{a.user?.full_name ?? a.user?.email}</div>
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {(['el', 'en'] as const).map(l => (
                <button key={l} onClick={() => setLocale(l)} className={cn('rounded px-1.5 py-0.5 font-semibold uppercase', i18n.language === l ? 'bg-white text-ink-900' : 'text-nav-muted hover:text-white')}>{l}</button>
              ))}
            </div>
            <button onClick={async () => { await a.signOut(); nav('/login') }} className="flex items-center gap-1 text-nav-muted hover:text-white"><LogOut size={14} /> {t('nav.logout')}</button>
          </div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 bg-nav px-4 py-2.5 text-white lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded p-1 hover:bg-[#16223f]"><Menu size={20} /></button>
          <span className="font-display text-sm font-extrabold">{t('app.name')}</span>
        </header>
        <main className="flex-1 p-4 sm:p-7 lg:px-8"><Outlet /></main>
      </div>
    </div>
  )
}
