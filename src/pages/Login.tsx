import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Card, Field, Input } from '@/components/ui'
import { supabase, DEV_AUTH, devLogin } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useQuery } from '@tanstack/react-query'

const DEMO_USERS = [
  ['admin@okd-demo.gr', 'Διαχειριστής Ομοσπονδίας (ΟΚΔ)'], ['admin@esna-demo.gr', 'Διαχειριστής Ένωσης (ΕΣΝΑ)'], ['admin@esba-demo.gr', 'Διαχειριστής Ένωσης (ΕΣΒΑ)'],
  ['secretary@esna-demo.gr', 'Γραμματεία ΕΣΝΑ'], ['treasurer@esna-demo.gr', 'Ταμίας ΕΣΝΑ'], ['secretary@esba-demo.gr', 'Γραμματεία ΕΣΒΑ'], ['treasurer@esba-demo.gr', 'Ταμίας ΕΣΒΑ'],
  ['viewer@esba-demo.gr', 'Μόνο ανάγνωση (ΕΣΒΑ)'], ['club@glyfada-demo.gr', 'Υπεύθυνος συλλόγου — Α.Ο. Γλυφάδας'], ['club@psychiko-demo.gr', 'Υπεύθυνος πολυαθλητικού — Π.Ο. Ψυχικού'],
  ['admin@osd-demo.gr', 'Διαχειριστής Ομοσπονδίας Στίβου (ΟΣΔ)'],
  ['admin@eozz-demo.gr', 'Πρόεδρος Ομοσπονδίας Ζίου-Ζίτσου (ΕΟΖΖ)'], ['secretary@eozz-demo.gr', 'Γραμματεία ΕΟΖΖ'],
  ['club@jj-athens-demo.gr', 'Έφορος συλλόγου — Α.Σ. Ζ-Ζ Αθηνών'],
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-brand-700">{t('app.name')}</h1>
          <p className="text-sm text-slate-500">{t('app.tagline')}</p>
        </div>
        {!DEV_AUTH && (
          <Card title={t('login.title')}>
            <form onSubmit={submit} className="space-y-3">
              <p className="text-sm text-slate-500">{t('login.subtitle')}</p>
              <Field label={t('common.email')}><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus /></Field>
              <Field label={t('login.password')}><Input type="password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
              {err && <div className="text-sm text-red-600">{err}</div>}
              {sent && <div className="text-sm text-emerald-700">{t('login.magicSent')}</div>}
              <div className="flex gap-2">
                <Button type="submit" loading={busy}>{t('login.submit')}</Button>
                <Button type="button" variant="outline" onClick={magic} disabled={!email || busy}>{t('login.magic')}</Button>
              </div>
            </form>
          </Card>
        )}
        {!DEV_AUTH && DEMO_PICKER && (
          <Card title={t('login.demoTitle')}>
            <p className="mb-3 text-sm text-slate-500">{t('login.demoHint')}</p>
            <div className="grid gap-1.5">
              {DEMO_USERS.map(([em, label]) => (
                <button key={em} onClick={() => { setEmail(em); setPassword(import.meta.env.VITE_DEMO_PASSWORD ?? ''); void signIn(em, import.meta.env.VITE_DEMO_PASSWORD ?? '') }} disabled={busy} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:border-brand-500 hover:bg-brand-50">
                  <span>{label}</span><span className="text-xs text-slate-400">{em}</span>
                </button>
              ))}
            </div>
          </Card>
        )}
        {DEV_AUTH && (
          <Card title={t('login.devTitle')}>
            <p className="mb-3 text-sm text-slate-500">{t('login.devHint')}</p>
            <div className="grid gap-1.5">
              {DEMO_USERS.map(([em, label]) => (
                <button key={em} onClick={() => dev(em)} disabled={!ids.data} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:border-brand-500 hover:bg-brand-50">
                  <span>{label}</span><span className="text-xs text-slate-400">{em}</span>
                </button>
              ))}
            </div>
          </Card>
        )}
        <p className="text-center text-xs text-slate-400">Sports Payments S.A.</p>
      </div>
    </div>
  )
}
