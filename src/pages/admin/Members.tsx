import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { members, orgs } from '@/api'
import { useAuth, type Role } from '@/lib/auth'
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, ErrorBox } from '@/components/ui'
import { errorMessage, fmtDate } from '@/lib/format'
import { useToast } from '@/lib/toast'

const ROLES: Role[] = ['union_admin', 'secretary', 'treasurer', 'club_manager', 'viewer']

export default function Members() {
  const { t } = useTranslation()
  const a = useAuth(); const orgId = a.orgId!
  const qc = useQueryClient(); const toast = useToast()
  const list = useQuery({ queryKey: ['members', orgId], queryFn: () => members.list(orgId) })
  const inv = useQuery({ queryKey: ['invitations', orgId], queryFn: () => members.invitations(orgId) })
  const clubs = useQuery({ queryKey: ['clubs', orgId], queryFn: () => orgs.clubsOf(orgId) })
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ email: '', role: 'club_manager' as Role, club_org_id: '' })
  const [err, setErr] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const canInvite = a.isStaff && a.role !== 'treasurer'
  const allowedRoles = a.isAdmin ? (a.isFederation ? ['federation_admin', ...ROLES] : ROLES) : ['club_manager']
  const refresh = () => { qc.invalidateQueries({ queryKey: ['members', orgId] }); qc.invalidateQueries({ queryKey: ['invitations', orgId] }) }

  async function invite(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    try {
      const r = await members.invite({ org_id: orgId, email: f.email, role: f.role, club_org_id: f.role === 'club_manager' ? f.club_org_id : null })
      setLink(`${window.location.origin}/invite/${r.token}`); refresh(); toast(t('members.sent'))
    } catch (e) { setErr(errorMessage(e)) }
  }

  return (
    <>
      <PageHeader title={t('members.title')} subtitle={a.current?.org.name} actions={canInvite && <Button onClick={() => { setLink(null); setOpen(true) }}>{t('members.invite')}</Button>} />
      {list.isLoading ? <Spinner /> : (
        <Table>
          <thead><tr><Th>{t('common.name')}</Th><Th>{t('members.role')}</Th><Th>{t('common.club')}</Th><Th>{t('common.status')}</Th><Th>{t('members.sensitive')}</Th><Th /></tr></thead>
          <tbody>{(list.data ?? []).map(m => (
            <tr key={m.id}>
              <Td>{m.profile?.full_name ?? m.user_id.slice(0, 8)}</Td><Td>{t(`roles.${m.role}`)}</Td><Td>{m.club?.name ?? '—'}</Td>
              <Td><Badge tone={m.status === 'active' ? 'green' : 'gray'}>{m.status === 'active' ? t('common.active') : t('common.inactive')}</Badge></Td>
              <Td>{m.can_access_sensitive ? t('common.yes') : t('common.no')}</Td>
              <Td right>{a.isAdmin && m.user_id !== a.user?.id && <Button size="sm" variant="ghost" onClick={async () => { try { await members.update(m.id, { status: m.status === 'active' ? 'disabled' : 'active' }); refresh() } catch (e) { toast(errorMessage(e)) } }}>{m.status === 'active' ? t('members.disable') : t('members.enable')}</Button>}</Td>
            </tr>))}</tbody>
        </Table>
      )}
      {(inv.data ?? []).length > 0 && (
        <Card title={t('members.pending')} className="mt-4">
          <Table><thead><tr><Th>{t('common.email')}</Th><Th>{t('members.role')}</Th><Th>{t('common.club')}</Th><Th>{t('members.expires')}</Th><Th /></tr></thead>
            <tbody>{(inv.data ?? []).map(i => (
              <tr key={i.id}><Td>{i.email}</Td><Td>{t(`roles.${i.role}`)}</Td><Td>{i.club?.name ?? '—'}</Td><Td>{fmtDate(i.expires_at)}</Td>
                <Td right><Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/invite/${i.token}`); toast(t('common.copied')) }}>{t('members.inviteLink')}</Button>{a.isAdmin && <Button size="sm" variant="ghost" onClick={async () => { await members.revoke(i.id); refresh() }}>{t('common.delete')}</Button>}</Td></tr>
            ))}</tbody></Table>
        </Card>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={t('members.invite')}>
        {link ? (
          <div className="space-y-3 text-sm">
            <p>{t('members.sent')}. {t('members.emailHint')}</p>
            <Input readOnly value={link} onFocus={e => e.target.select()} />
            <div className="flex justify-end"><Button onClick={() => { navigator.clipboard.writeText(link); toast(t('common.copied')) }}>{t('common.copyLink')}</Button></div>
          </div>
        ) : (
          <form onSubmit={invite} className="grid gap-3">
            <Field label={t('common.email')} required><Input type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
            <Field label={t('members.role')}><Select value={f.role} onChange={e => setF({ ...f, role: e.target.value as Role })}>{allowedRoles.map(r => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}</Select></Field>
            {f.role === 'club_manager' && <Field label={t('members.club')} required><Select required value={f.club_org_id} onChange={e => setF({ ...f, club_org_id: e.target.value })}><option value="">{t('common.select')}</option>{(clubs.data ?? []).map(c => <option key={c.id} value={(c.club as { id: string }).id}>{(c.club as { name: string }).name}</option>)}</Select></Field>}
            {err && <ErrorBox error={err} />}
            <div className="flex justify-end"><Button type="submit">{t('members.invite')}</Button></div>
          </form>
        )}
      </Modal>
    </>
  )
}
