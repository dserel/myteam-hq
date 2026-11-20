import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Card, Field, Input } from '@/components/ui'
import { supabase, DEV_AUTH, devLogin } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useQuery } from '@tanstack/react-query'

// Demo accounts, grouped by federation so a presenter jumps straight to the right one.
const DEMO_GROUPS: { title: string; users: [string, string][] }[] = [
  { title: 'Ζίου-Ζίτσου · Ε.Φ.Ε.Ο.Ζ-Ζ.', users: [
    ['admin@eozz-demo.gr', 'Διαχειριστής ομοσπονδίας'], ['secretary@eozz-demo.gr', 'Γραμματεία'],
    ['club@jj-athens-demo.gr', 'Σωματείο — Α.Σ. Τάλως Αθηνών'], ['club@jj-piraeus-demo.gr', 'Σωματείο — Γ.Σ. Μαχητικών Τεχνών Πειραιώς'],
  ] },
  { title: 'Αισθητική Ομαδική Γυμναστική · Ε.Ο.Α.Ο.Γ.', users: [
    ['admin@eoaog-demo.gr', 'Διαχειριστής ομοσπονδίας'], ['club@aog-larisa-demo.gr', 'Σωματείο — Α.Γ.Σ. Αρμονία Λάρισας'],
  ] },
  { title: 'Μπάσκετ · ΟΚΔ με ενώσεις ΕΣΝΑ / ΕΣΒΑ', users: [
    ['admin@okd-demo.gr', 'Διαχειριστής ομοσπονδίας (ΟΚΔ)'], ['admin@esna-demo.gr', 'Διαχειριστής ένωσης (ΕΣΝΑ)'], ['admin@esba-demo.gr', 'Διαχειριστής ένωσης (ΕΣΒΑ)'],
    ['secretary@esna-demo.gr', 'Γραμματεία ΕΣΝΑ'], ['treasurer@esna-demo.gr', 'Ταμίας ΕΣΝΑ'], ['secretary@esba-demo.gr', 'Γραμματεία ΕΣΒΑ'], ['treasurer@esba-demo.gr', 'Ταμίας ΕΣΒΑ'],
    ['viewer@esba-demo.gr', 'Μόνο ανάγνωση (ΕΣΒΑ)'], ['club@glyfada-demo.gr', 'Σωματείο — Α.Ο. Γλυφάδας'], ['club@psychiko-demo.gr', 'Πολυαθλητικό σωματείο — Π.Ο. Ψυχικού'],
  ] },
  { title: 'Στίβος · ΟΣΔ', users: [['admin@osd-demo.gr', 'Διαχειριστής ομοσπονδίας (ΟΣΔ)']] },
]


export default function Login() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  // dev: resolve user ids by email through a tiny public RPC-less path: we ship the ids in the seed? Not available to anon.
  // Instead we call a dev-only endpoint: PostgREST exposes nothing for auth.users, so we use a static lookup fetched at build time.
  const ids = useQuery({ queryKey: ['dev-users'], enabled: DEV_AUTH, queryFn: async () => (await fetch('/dev-users.json')).json() as Promise<Record<string, string>> })

  const DEMO_PICKER = import.meta.env.VITE_DEMO_ACCOUNTS === '1'  // cloud demo: one-click sign-in with the shared demo password
  async function signIn(em: string, pw: string) {
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email: em, password: pw })
    setBusy(false)
    if (error) { setErr(t('login.invalid')); return }
    await auth.reload(); nav('/')
  }
  async function submit(e: React.FormEvent) { e.preventDefault(); await signIn(email, password) }
  async function magic() {
    setBusy(true); const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } }); setBusy(false)
    if (error) setErr(error.message); else setSent(true)
  }
  async function dev(em: string) {
    const id = ids.data?.[em]; if (!id) return
    await devLogin(id, em); await auth.reload(); nav('/')
  }

  const demoButton = (em: string, label: string, onClick: () => void, disabled: boolean) => (
    <button key={em} onClick={onClick} disabled={disabled}
      className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-line px-3 py-2 text-left text-sm text-ink-800 transition hover:border-brand-500 hover:bg-brand-50 disabled:opacity-60">
      <span className="font-medium">{label}</span><span className="truncate text-xs text-ink-500">{em}</span>
    </button>
  )
  const demoList = (onPick: (em: string) => void, disabled: boolean) => (
    <div className="space-y-4">
      {DEMO_GROUPS.map(g => (
        <div key={g.title}>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">{g.title}</div>
          <div className="grid gap-1.5">{g.users.map(([em, label]) => demoButton(em, label, () => onPick(em), disabled))}</div>
        </div>
      ))}
    </div>
  )
  const demoPassword = import.meta.env.VITE_DEMO_PASSWORD ?? ''

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Brand panel */}
      <aside className="relative flex flex-col justify-between overflow-hidden bg-hq-navy px-6 py-8 text-white sm:px-10 lg:sticky lg:top-0 lg:h-screen lg:px-14 lg:py-12">
        <svg aria-hidden="true" className="pointer-events-none absolute -right-16 -bottom-16 hidden h-[26rem] w-[26rem] lg:block" viewBox="0 0 400 400">
          <circle cx="250" cy="250" r="150" fill="#1e2040" />
          <circle cx="150" cy="120" r="44" fill="#04e0b5" />
          <rect x="226" y="70" width="120" height="56" rx="18" fill="#f4b63f" />
        </svg>
        <img src="/brand/myteam-hq-on-dark.svg" alt={t('app.name')} className="relative h-8 w-auto self-start lg:h-10" />
        <div className="relative mt-10 max-w-md lg:mt-0">
          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-[44px]">{t('app.tagline')}</h1>
          <ul className="mt-6 hidden space-y-2.5 text-[15px] text-nav-text sm:block">
            {(['bullet1', 'bullet2', 'bullet3'] as const).map(k => (
              <li key={k} className="flex items-start gap-3"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-hq-mint" />{t(`login.${k}`)}</li>
            ))}
          </ul>
        </div>
        <p className="relative mt-10 hidden text-xs text-nav-muted lg:block">myTeam · Sports Payments S.A.</p>
      </aside>

      {/* Sign-in */}
      <main className="flex items-start justify-center px-4 py-8 sm:px-8 lg:items-center lg:py-12">
        <div className="w-full max-w-lg space-y-5">
          {!DEV_AUTH && (
            <section className="rounded-2xl border border-line bg-white p-6 shadow-[0_1px_2px_rgba(19,20,41,.06),0_4px_16px_rgba(19,20,41,.06)] sm:p-8">
              <h2 className="font-display text-2xl font-bold text-ink-900">{t('login.title')}</h2>
              <p className="mt-1 text-sm text-ink-500">{t('login.subtitle')}</p>
              <form onSubmit={submit} className="mt-5 space-y-4">
                <Field label={t('common.email')}><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus /></Field>
                <Field label={t('login.password')}><Input type="password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
                {err && <div className="text-sm text-red-700">{err}</div>}
                {sent && <div className="text-sm text-emerald-800">{t('login.magicSent')}</div>}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="submit" loading={busy}>{t('login.submit')}</Button>
                  <Button type="button" variant="outline" onClick={magic} disabled={!email || busy}>{t('login.magic')}</Button>
                </div>
              </form>
            </section>
          )}
          {!DEV_AUTH && DEMO_PICKER && (
            <Card title={t('login.demoTitle')}>
              <p className="mb-4 text-sm text-ink-500">{t('login.demoHint')}</p>
              {demoList(em => { setEmail(em); setPassword(demoPassword); void signIn(em, demoPassword) }, busy)}
            </Card>
          )}
          {DEV_AUTH && (
            <Card title={t('login.devTitle')}>
              <p className="mb-4 text-sm text-ink-500">{t('login.devHint')}</p>
              {demoList(em => { void dev(em) }, !ids.data)}
            </Card>
          )}
          <p className="text-center text-xs text-ink-500 lg:hidden">myTeam · Sports Payments S.A.</p>
        </div>
      </main>
    </div>
  )
}
