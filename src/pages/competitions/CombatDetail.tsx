import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { combat, competitions } from '@/api'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Card, Field, Input, Modal, Spinner, Table, Td, Th, Tabs, Empty, ErrorBox } from '@/components/ui'
import { fullName, age, errorMessage } from '@/lib/format'
import { useToast } from '@/lib/toast'
import { Bracket, type BracketMatch } from './Bracket'

type Cat = {
  id: string; name: string; sort_order: number; weigh_in_required: boolean
  category: { id: string; name: string; code: string; gender: string; weight_min_kg: number | null; weight_max_kg: number | null; belt_min: string | null; belt_max: string | null } | null
  groups: { id: string; name: string }[]
}
type Athlete = { id: string; status: string; ineligible_reason: string | null; weigh_in_kg: number | null; license: { id: string; license_no: string | null; metadata: Record<string, unknown> | null } | null }
type Entry = {
  id: string; seed: number | null; status: string; display_name: string; person_id: string | null; club_org_id: string | null
  person: { id: string; first_name: string; last_name: string; birth_date: string | null; gender: string | null } | null
  club: { id: string; name: string } | null
  athlete: Athlete[]
}
type Cand = { person_id: string; license_no: string | null; metadata: Record<string, unknown> | null; club_org_id: string; person: { id: string; first_name: string; last_name: string; birth_date: string | null; gender: string | null }; club: { id: string; name: string } | null }
type Match = { id: string; group_id: string; round: { round_no: number; name: string } | null; home: { id: string; display_name: string } | null; away: { id: string; display_name: string } | null; status: string; home_score: number | null; away_score: number | null; bracket_pos: number | null; winner_entry_id: string | null; scheduled_at: string | null; score_detail: Record<string, unknown> | null }

const beltOf = (a: Athlete | undefined) => (a?.license?.metadata as { belt?: string } | null)?.belt ?? null
const MEDAL = ['', '🥇', '🥈', '🥉']

/** Μαχητικά (Jiu Jitsu, τζούντο, πάλη): κατηγορία βάρους → ζύγιση → ταμπλό → μετάλλια */
export function CombatDetail({ competitionId, orgId, sportId, canEdit }: { competitionId: string; orgId: string; sportId: string; canEdit: boolean }) {
  const { t } = useTranslation()
  const a = useAuth(); const qc = useQueryClient(); const toast = useToast()
  const cats = useQuery({ queryKey: ['combat-cats', competitionId], queryFn: () => combat.categories(competitionId) as Promise<Cat[]> })
  const [catId, setCatId] = useState('')
  const cat = (cats.data ?? []).find(c => c.id === catId) ?? cats.data?.[0]
  const grp = cat?.groups?.[0]?.id ?? ''
  const [tab, setTab] = useState<'entries' | 'bracket' | 'medals'>('entries')
  const entries = useQuery({ queryKey: ['combat-entries', grp], enabled: !!grp, queryFn: () => combat.entries(grp) as Promise<Entry[]> })
  const matches = useQuery({ queryKey: ['combat-matches', competitionId], queryFn: () => competitions.matches(competitionId) as Promise<Match[]> })
  const places = useQuery({ queryKey: ['combat-places', grp], enabled: !!grp, queryFn: () => combat.placements(grp) })
  const [declOpen, setDecl] = useState(false); const [sel, setSel] = useState<Record<string, boolean>>({})
  const cands = useQuery({ queryKey: ['combat-cands', sportId, a.clubId], enabled: declOpen, queryFn: () => combat.candidates(orgId, sportId, a.role === 'club_manager' ? a.clubId : null) as Promise<Cand[]> })
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null)
  const [editMatch, setEditMatch] = useState<Match | null>(null)
  const [mf, setMf] = useState({ home_score: '', away_score: '', status: 'played', winner: '' })
  const canDeclare = canEdit || a.role === 'club_manager'

  const inv = () => ['combat-cats', 'combat-entries', 'combat-matches', 'combat-places'].forEach(k => qc.invalidateQueries({ queryKey: [k] }))
  if (cats.isLoading) return <Spinner />
  if ((cats.data ?? []).length === 0) return <Empty>{t('combat.noCategories')}</Empty>

  const rows = entries.data ?? []
  const groupMatches = (matches.data ?? []).filter(m => m.group_id === grp)
  const eligible = rows.filter(r => r.athlete?.[0]?.status === 'eligible')
  const drawn = groupMatches.length > 0
  const bracketRows: BracketMatch[] = groupMatches.map(m => ({
    id: m.id, round_no: m.round?.round_no ?? 0, round_name: m.round?.name ?? '', bracket_pos: m.bracket_pos,
    home_name: m.home?.display_name ?? null, away_name: m.away?.display_name ?? null,
    home_entry_id: m.home?.id ?? null, away_entry_id: m.away?.id ?? null,
    home_score: m.home_score, away_score: m.away_score, status: m.status, winner_entry_id: m.winner_entry_id, scheduled_at: m.scheduled_at,
  }))

  async function weigh(entryId: string, v: string) {
    setErr(null)
    try { await combat.weighIn(entryId, v === '' ? null : Number(v)); qc.invalidateQueries({ queryKey: ['combat-entries', grp] }) }
    catch (e) { setErr(errorMessage(e)) }
  }
  async function declare() {
    if (!grp || !cat) return
    setBusy(true); setErr(null)
    try {
      const chosen = (cands.data ?? []).filter(c => sel[c.person_id])
      await combat.addEntries(chosen.map(c => ({
        competition_id: competitionId, org_id: orgId, club_org_id: c.club_org_id, person_id: c.person_id,
        group_id: grp, display_name: `${c.person.last_name} ${c.person.first_name}`, status: 'confirmed',
      })))
      setSel({}); setDecl(false); inv(); toast(t('combat.declared', { n: chosen.length }))
    } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }
  async function draw() {
    if (!grp) return
    setBusy(true); setErr(null)
    try {
      await competitions.generateKnockout(grp, eligible.map(e => e.id), null, 0)
      inv(); setTab('bracket'); toast(t('combat.drawDone'))
    } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }
  async function saveMatch() {
    if (!editMatch) return
    setBusy(true); setErr(null)
    try {
      const patch: Record<string, unknown> = { status: mf.status, home_score: mf.home_score === '' ? null : Number(mf.home_score), away_score: mf.away_score === '' ? null : Number(mf.away_score) }
      if (mf.status === 'played' && patch.home_score === patch.away_score) {
        if (!mf.winner) { setErr(t('comp.drawNeedsWinner')); setBusy(false); return }
        patch.score_detail = { ...(editMatch.score_detail ?? {}), winner_entry_id: mf.winner }
      }
      await competitions.updateMatch(editMatch.id, patch); setEditMatch(null); inv()
    } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }
  const openMatch = (m: BracketMatch) => {
    const full = groupMatches.find(x => x.id === m.id); if (!full || !canEdit) return
    setEditMatch(full); setMf({ home_score: full.home_score?.toString() ?? '', away_score: full.away_score?.toString() ?? '', status: full.status === 'scheduled' ? 'played' : full.status, winner: String((full.score_detail as { winner_entry_id?: string } | null)?.winner_entry_id ?? '') })
  }

  const limits = cat?.category
    ? [cat.category.weight_min_kg ? `${cat.category.weight_min_kg}+` : null, cat.category.weight_max_kg ? `έως ${cat.category.weight_max_kg} kg` : null].filter(Boolean).join(' ')
    : ''

  return (
    <div className="space-y-4">
      {err && <ErrorBox error={err} />}
      {/* Κατηγορίες βάρους */}
      <div className="flex flex-wrap gap-2" data-combat-cats>
        {(cats.data ?? []).map(c => {
          const g = c.groups?.[0]?.id
          const done = (matches.data ?? []).some(m => m.group_id === g)
          return (
            <button key={c.id} data-combat-cat={c.id} onClick={() => { setCatId(c.id); setTab('entries') }}
              className={`rounded-lg border px-3 py-2 text-sm transition ${c.id === cat?.id ? 'border-brand-600 bg-brand-50 font-semibold text-brand-800' : 'border-slate-200 hover:border-brand-400'}`}>
              {c.name}{!done && <span className="ml-1.5 text-[11px] text-amber-600">• {t('combat.notDrawn')}</span>}
            </button>
          )
        })}
      </div>

      {cat && (
        <Card title={cat.name} actions={<span className="text-xs text-slate-500">{limits}{cat.category?.belt_min ? ` · ${t('combat.belts')}: ${cat.category.belt_min}–${cat.category.belt_max}` : ''}</span>}>
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: 'entries' as const, label: t('combat.entries'), count: rows.length },
            { id: 'bracket' as const, label: t('combat.bracket') },
            { id: 'medals' as const, label: t('combat.medals') },
          ]} />

          {tab === 'entries' && (<>
            <div className="mb-3 mt-3 flex flex-wrap items-center gap-2">
              {canDeclare && <Button size="sm" variant="outline" onClick={() => setDecl(true)}>{t('combat.declare')}</Button>}
              {canEdit && !drawn && <Button size="sm" loading={busy} disabled={eligible.length < 2} onClick={draw} data-action="draw">{t('combat.draw')} ({eligible.length})</Button>}
              {drawn && <Badge tone="green">{t('combat.drawnBadge')}</Badge>}
              <span className="ml-auto text-xs text-slate-500">{t('combat.eligibleCount', { n: eligible.length, total: rows.length })}</span>
            </div>
            {entries.isLoading ? <Spinner /> : rows.length === 0 ? <Empty>{t('combat.noEntries')}</Empty> : (
              <Table>
                <thead><tr><Th>{t('common.name')}</Th><Th>{t('common.club')}</Th><Th>{t('combat.belt')}</Th><Th>{t('persons.age')}</Th><Th>{t('combat.weighIn')}</Th><Th>{t('common.status')}</Th></tr></thead>
                <tbody>
                  {rows.map(r => {
                    const at = r.athlete?.[0]
                    return (
                      <tr key={r.id} data-entry={r.id} className="hover:bg-slate-50">
                        <Td className="font-medium">{r.person ? fullName(r.person) : r.display_name}</Td>
                        <Td>{r.club?.name}</Td>
                        <Td>{beltOf(at) ? <Badge tone="purple">{beltOf(at)}</Badge> : '—'}</Td>
                        <Td>{r.person?.birth_date ? age(r.person.birth_date) : '—'}</Td>
                        <Td>
                          {canEdit ? (
                            <Input type="number" step="0.1" className="w-24" defaultValue={at?.weigh_in_kg ?? ''} data-weigh={r.id}
                              onBlur={e => { const v = e.target.value; if (v !== String(at?.weigh_in_kg ?? '')) weigh(r.id, v) }} />
                          ) : (at?.weigh_in_kg != null ? `${at.weigh_in_kg} kg` : '—')}
                        </Td>
                        <Td>
                          {at?.status === 'eligible' ? <Badge tone="green">{t('roster.eligible')}</Badge> : <Badge tone="red">{t('roster.ineligible')}</Badge>}
                          {at?.ineligible_reason && <div className="text-xs text-red-700">{at.ineligible_reason}</div>}
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            )}
          </>)}

          {tab === 'bracket' && (<div className="mt-3">
            {!drawn ? <Empty>{t('combat.notDrawnYet')}</Empty> : <Bracket matches={bracketRows} onPick={canEdit ? openMatch : undefined} />}
          </div>)}

          {tab === 'medals' && (<div className="mt-3">
            {(places.data ?? []).length === 0 ? <Empty>{t('combat.noMedals')}</Empty> : (
              <Table>
                <thead><tr><Th className="w-16">{t('combat.place')}</Th><Th>{t('common.name')}</Th></tr></thead>
                <tbody>{(places.data ?? []).map((p, i) => (
                  <tr key={`${p.entry_id}-${i}`} data-place={p.place}>
                    <Td className="text-lg">{MEDAL[p.place] ?? p.place}</Td>
                    <Td className="font-medium">{p.display_name}</Td>
                  </tr>
                ))}</tbody>
              </Table>
            )}
          </div>)}
        </Card>
      )}

      <Modal open={declOpen} onClose={() => setDecl(false)} title={t('combat.declare')}>
        <p className="mb-2 text-xs text-slate-500">{t('combat.declareHint')}</p>
        <div className="max-h-80 overflow-auto rounded-md border border-slate-200">
          <Table>
            <thead><tr><Th className="w-8" /><Th>{t('common.name')}</Th><Th>{t('combat.belt')}</Th><Th>{t('common.club')}</Th></tr></thead>
            <tbody>{(cands.data ?? []).filter(c => !rows.some(r => r.person_id === c.person_id)).map(c => (
              <tr key={c.person_id}>
                <Td><input type="checkbox" checked={!!sel[c.person_id]} onChange={e => setSel({ ...sel, [c.person_id]: e.target.checked })} /></Td>
                <Td>{fullName(c.person)}</Td>
                <Td>{(c.metadata as { belt?: string } | null)?.belt ?? '—'}</Td>
                <Td className="text-xs text-slate-500">{c.club?.name}</Td>
              </tr>
            ))}</tbody>
          </Table>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDecl(false)}>{t('common.cancel')}</Button>
          <Button loading={busy} disabled={Object.values(sel).every(v => !v)} onClick={declare}>{t('combat.declare')}</Button>
        </div>
      </Modal>

      <Modal open={!!editMatch} onClose={() => setEditMatch(null)} title={t('combat.result')}>
        {editMatch && (<>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <Field label={editMatch.home?.display_name ?? '—'}><Input type="number" value={mf.home_score} onChange={e => setMf({ ...mf, home_score: e.target.value })} /></Field>
            <Field label={editMatch.away?.display_name ?? '—'}><Input type="number" value={mf.away_score} onChange={e => setMf({ ...mf, away_score: e.target.value })} /></Field>
          </div>
          {mf.status === 'played' && mf.home_score !== '' && mf.home_score === mf.away_score && (
            <Field label={t('comp.winner')} required>
              <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={mf.winner} onChange={e => setMf({ ...mf, winner: e.target.value })}>
                <option value="">—</option>
                <option value={editMatch.home?.id ?? ''}>{editMatch.home?.display_name}</option>
                <option value={editMatch.away?.id ?? ''}>{editMatch.away?.display_name}</option>
              </select>
            </Field>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditMatch(null)}>{t('common.cancel')}</Button>
            <Button loading={busy} onClick={saveMatch}>{t('common.save')}</Button>
          </div>
        </>)}
      </Modal>
    </div>
  )
}
