import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { transfers, orgs } from '@/api'
import { useAuth } from '@/lib/auth'
import { Button, Card, ErrorBox, Field, Input, PageHeader, Select, Textarea } from '@/components/ui'
import { errorMessage } from '@/lib/format'
import { useToast } from '@/lib/toast'

type Found = Awaited<ReturnType<typeof transfers.find>>[number]

export default function TransferNew() {
  const { t } = useTranslation()
  const a = useAuth(); const orgId = a.orgId!
  const nav = useNavigate(); const toast = useToast()
  const [no, setNo] = useState('')
  const [found, setFound] = useState<Found[] | null>(null)
  const [toClub, setToClub] = useState(a.clubId ?? '')
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const clubs = useQuery({ queryKey: ['clubs', orgId], enabled: !a.clubId, queryFn: () => orgs.clubsOf(orgId) })

  async function search() {
    setBusy(true); setErr(null); setFound(null)
    try { setFound(await transfers.find(orgId, no.trim(), toClub || null)) }
    catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }
  async function create(licenseId: string) {
    setBusy(true); setErr(null)
    try {
      const r = await transfers.create(licenseId, toClub, note || undefined) as { id: string }
      toast(t('transfers.created')); nav(`/transfers/${r.id}`)
    } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title={t('transfers.new')} subtitle={t('transfers.newHint')} />
      {err && <ErrorBox error={err} />}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('transfers.findAthlete')}>
          <div className="grid gap-3">
            {!a.clubId && (
              <Field label={t('transfers.toClub')}>
                <Select value={toClub} onChange={e => setToClub(e.target.value)} data-to-club>
                  <option value="">{t('transfers.selectClub')}</option>
                  {(clubs.data ?? []).map(c => <option key={c.id} value={(c.club as { id: string }).id}>{(c.club as { name: string }).name}</option>)}
                </Select>
              </Field>
            )}
            <Field label={t('transfers.licenseNo')} hint={t('transfers.licenseNoHint')}>
              <div className="flex gap-2">
                <Input value={no} onChange={e => setNo(e.target.value)} data-license-no
                  onKeyDown={e => { if (e.key === 'Enter') search() }} />
                <Button onClick={search} loading={busy} disabled={!no.trim()} data-action="search">{t('common.search')}</Button>
              </div>
            </Field>
            <Field label={t('transfers.releaseNote')} hint={t('transfers.releaseNoteHint')}>
              <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} />
            </Field>
          </div>
        </Card>

        <Card title={t('transfers.result')}>
          {found === null && <p className="text-sm text-slate-500">{t('transfers.searchFirst')}</p>}
          {found?.length === 0 && <p className="text-sm text-red-700" data-not-found>{t('transfers.notFound')}</p>}
          {(found ?? []).map(f => (
            <div key={f.license_id} className="rounded-md border p-3" data-found>
              <div className="font-medium">{f.last_name} {f.first_name} <span className="text-xs text-slate-500">({f.birth_year})</span></div>
              <div className="text-sm text-slate-600">{f.sport_name} · {t('transfers.currentClub')}: <span className="font-medium">{f.club_name}</span></div>
              {toClub && f.club_org_id === toClub
                ? <p className="mt-2 text-sm text-slate-500">{t('transfers.sameClub')}</p>
                : !f.can_transfer
                  ? <p className="mt-2 text-sm text-red-700" data-blocked>{f.reason}</p>
                  : <Button className="mt-2" loading={busy} disabled={!toClub} data-action="create"
                      onClick={() => create(f.license_id)}>{t('transfers.createFor', { club: f.club_name })}</Button>}
            </div>
          ))}
          <p className="mt-3 text-xs text-slate-500">{t('transfers.privacyNote')}</p>
        </Card>
      </div>
    </>
  )
}
