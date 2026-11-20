import { clsx } from 'clsx'
import { X } from 'lucide-react'
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { useTranslation } from 'react-i18next'

export function cn(...a: (string | false | null | undefined)[]) { return clsx(a) }

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'official'
export function Button({ variant = 'primary', size = 'md', className, loading, children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }) {
  const v: Record<Variant, string> = {
    primary: 'bg-hq-navy text-white hover:bg-hq-navy-2 shadow-xs',
    // myTeam HQ: gold = official federation acts (issue licence, approve transfer). Text always navy.
    official: 'bg-hq-gold text-hq-navy hover:bg-hq-gold-hover shadow-xs',
    secondary: 'bg-brand-600 text-white hover:bg-brand-700',
    outline: 'border border-line bg-white text-ink-800 hover:bg-slate-50',
    ghost: 'text-ink-600 hover:bg-slate-100',
    danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
  }
  return (
    <button {...rest} disabled={rest.disabled || loading}
      className={cn('inline-flex items-center gap-1.5 rounded-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm', v[variant], className)}>
      {loading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {children}
    </button>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn('w-full rounded-md border border-[#8b8ea8] bg-white px-3 py-2 text-sm shadow-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50', className)} />
}
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cn('w-full rounded-md border border-[#8b8ea8] bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100', className)} />
}
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={cn('w-full rounded-md border border-[#8b8ea8] bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100', className)}>{children}</select>
}
export function Field({ label, children, hint, required, className }: { label: ReactNode; children: ReactNode; hint?: ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}{required && <span className="text-red-500"> *</span>}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cn('rounded-2xl border border-line bg-white', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="font-display text-[15px] font-bold text-ink-900">{title}</h3>
          <div className="flex gap-2">{actions}</div>
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">{eyebrow}</div>}
        <h1 className="font-display text-[26px] font-extrabold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

const tones: Record<string, string> = {
  gray: 'bg-slate-100 text-ink-600', green: 'bg-emerald-50 text-emerald-800', red: 'bg-red-50 text-red-800',
  amber: 'bg-amber-50 text-amber-800', blue: 'bg-info-bg text-info-ink', purple: 'bg-violet-50 text-violet-800',
}
export function Badge({ tone = 'gray', children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', tones[tone], className)}>{children}</span>
}

export const statusTone = (s: string): keyof typeof tones => ({
  draft: 'gray', submitted: 'blue', under_review: 'amber', approved: 'purple', rejected: 'red', issued: 'green', expired: 'gray', revoked: 'red',
  valid: 'green', active: 'green', inactive: 'gray', scheduled: 'gray', played: 'green', postponed: 'amber', cancelled: 'red', forfeit_home: 'red', forfeit_away: 'red',
  pending: 'amber', confirmed: 'green', withdrawn: 'gray', recorded: 'green', reversed: 'red', open: 'blue', in_progress: 'green', completed: 'gray', archived: 'gray',
} as Record<string, keyof typeof tones>)[s] ?? 'gray'

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('overflow-x-auto rounded-xl border border-line bg-white', className)}><table className="w-full text-sm">{children}</table></div>
}
export function Th({ children, className, right }: { children?: ReactNode; className?: string; right?: boolean }) {
  return <th className={cn('bg-canvas px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500', right && 'text-right', className)}>{children}</th>
}
export function Td({ children, className, right, colSpan }: { children?: ReactNode; className?: string; right?: boolean; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn('border-t border-line/70 px-3 py-2.5 align-middle', right && 'text-right tabular-nums', className)}>{children}</td>
}

export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useTranslation()
  return <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children ?? t('common.empty')}</div>
}
export function Spinner() { const { t } = useTranslation(); return <div className="p-6 text-sm text-slate-500">{t('common.loading')}</div> }
export function ErrorBox({ error }: { error: unknown }) {
  const m = (error as { message?: string })?.message ?? String(error)
  return <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{m}</div>
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8" onMouseDown={onClose}>
      <div role="dialog" className={cn('w-full rounded-lg bg-white shadow-xl', wide ? 'max-w-4xl' : 'max-w-lg')} onMouseDown={e => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={16} /></button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm', value === t.id ? 'border-brand-600 font-semibold text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-800')}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Stat({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: 'red' | 'green' | 'amber' }) {
  return (
    <div className="rounded-xl border border-line bg-white px-5 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">{label}</div>
      <div className={cn('mt-1 font-display text-[30px] font-extrabold tracking-tight tabular-nums text-ink-900', tone === 'red' && 'text-red-700', tone === 'green' && 'text-emerald-700', tone === 'amber' && 'text-amber-700')}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-500">{hint}</div>}
    </div>
  )
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <div className="fixed bottom-4 right-4 z-50 rounded-[10px] bg-hq-navy px-4 py-2 text-sm text-white shadow-lg">{msg}</div>
}

/** "Powered by myTeam HQ" — footer mark for public pages and printed licences. */
export function PoweredBy({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <a href="https://my-team.co" target="_blank" rel="noreferrer" className={cn('inline-flex items-center gap-1.5 text-ink-500 hover:text-ink-800', className)}>
      <img src="/favicon.svg" alt="" className="h-4 w-4 rounded-[4px]" />
      <span>{t('public.poweredBy')}</span>
    </a>
  )
}
