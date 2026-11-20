import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { members } from '@/api'
import { useAuth } from '@/lib/auth'
import { Button, Card, ErrorBox } from '@/components/ui'
import { errorMessage } from '@/lib/format'

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>()
  const { t } = useTranslation()
  const a = useAuth(); const nav = useNavigate()
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function accept() {
    setBusy(true); setErr(null)
    try { await members.accept(token!); await a.reload(); nav('/') } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card title={t('members.acceptTitle')} className="w-full max-w-md">
        {!a.user ? <p className="text-sm">{t('login.title')}: <Link className="text-brand-700 underline" to="/login" state={{ from: { pathname: `/invite/${token}` } }}>{t('login.submit')}</Link></p> : (
          <div className="space-y-3 text-sm">
            <p>{a.user.email}</p>
            {err && <ErrorBox error={err} />}
            <Button loading={busy} onClick={accept}>{t('members.accept')}</Button>
          </div>
        )}
      </Card>
    </div>
  )
}
