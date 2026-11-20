import { Fragment, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { competitions, orgs, registry } from '@/api'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, Tabs, Empty, ErrorBox, statusTone } from '@/components/ui'
import { fmtDateTime, errorMessage } from '@/lib/format'
import { useToast } from '@/lib/toast'
import { StandingsTable } from '@/pages/public/StandingsTable'
import { RosterPanel } from './Roster'
import { Bracket, type BracketMatch } from './Bracket'
import { MeetDetail } from './MeetDetail'
import { CombatDetail } from './CombatDetail'

type Match = { id: string; round_id: string; round: { round_no: number; name: string; scheduled_on: string | null } | null; home: { id: string; display_name: string } | null; away: { id: string; display_name: string } | null; venue: { id: string; name: string } | null; scheduled_at: string | null; status: string; home_score: number | null; away_score: number | null; manually_edited: boolean; group_id: string; bracket_pos: number | null; winner_entry_id: string | null; score_detail: Record<string, unknown> | null }

export default function CompetitionDetail() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const a = useAuth(); const orgId = a.orgId!
  const qc = useQueryClient(); const toast = useToast()
  const comp = useQuery({ queryKey: ['competition', id], queryFn: () => competitions.get(id!) })
  const groups = useQuery({ queryKey: ['groups', id], queryFn: () => competitions.groups(id!) })
  const entries = useQuery({ queryKey: ['entries', id], queryFn: () => competitions.entries(id!) })
  const matches = useQuery({ queryKey: ['matches', id], queryFn: () => competitions.matches(id!) as Promise<Match[]> })
  const venues = useQuery({ queryKey: ['venues', orgId], queryFn: () => competitions.venues(orgId) })
  const clubs = useQuery({ queryKey: ['clubs', orgId], queryFn: () => orgs.clubsOf(orgId) })
  const [tab, setTab] = useState<'standings' | 'bracket' | 'schedule' | 'results' | 'entries' | 'share'>('standings')
  const [groupId, setGroupId] = useState<string>('')
  const gid = groupId || groups.data?.[0]?.id || ''
  const group = (groups.data ?? []).find(g => g.id === gid)
  const isKO = group?.stage?.kind === 'knockout'
  const rrGroups = (groups.data ?? []).filter(g => g.stage?.kind === 'round_robin')
  const [koOpen, setKo] = useState(false); const [ko, setKoForm] = useState({ mode: 'seed' as 'seed' | 'standings', source: '', top: 4, start: '', days: 7, ids: {} as Record<string, boolean> })
  const [stageOpen, setStage] = useState(false); const [stageForm, setStageForm] = useState({ name: '', kind: 'knockout' as 'knockout' | 'round_robin' })
  const standings = useQuery({ queryKey: ['standings', gid], enabled: !!gid, queryFn: () => competitions.standings(gid) })
  const [genOpen, setGen] = useState(false); const [gen, setGenForm] = useState({ legs: 2, start: '', days: 7 })
  const [entryOpen, setEntry] = useState(false); const [entry, setEntryForm] = useState({ club_org_id: '', section_id: '', display_name: '' })
  const sections = useQuery({ queryKey: ['sections', orgId, entry.club_org_id], enabled: !!entry.club_org_id, queryFn: () => registry.sections(orgId, entry.club_org_id) })
  const [editMatch, setEditMatch] = useState<Match | null>(null); const [mf, setMf] = useState({ home_score: '', away_score: '', status: 'played', scheduled_at: '', venue_id: '', winner: '' })
  const [venueOpen, setVenue] = useState(false); const [vf, setVf] = useState({ name: '', address: '', city: '' })
  const [err, setErr] = useState<string | null>(null)
  const canEdit = a.isStaff && a.role !== 'treasurer'
  const [openRoster, setOpenRoster] = useState<string | null>(a.role === 'club_manager' ? 'mine' : null)
  const canDeclareFor = (clubId: string | null) => canEdit || (a.role === 'club_manager' && !!clubId && a.clubId === clubId)
  const inv = () => { ['competition', 'groups', 'entries', 'matches'].forEach(k => qc.invalidateQueries({ queryKey: [k, id] })); qc.invalidateQueries({ queryKey: ['standings'] }) }
  const byRound = useMemo(() => { const m = new Map<number, Match[]>(); for (const x of (matches.data ?? []).filter(x => !gid || x.group_id === gid)) { const r = x.round?.round_no ?? 0; m.set(r, [...(m.get(r) ?? []), x]) } return [...m.entries()].sort((p, q) => p[0] - q[0]) }, [matches.data, gid])
  const played = (matches.data ?? []).filter(m => (!gid || m.group_id === gid) && ['played', 'forfeit_home', 'forfeit_away'].includes(m.status))

  if (comp.isLoading || !comp.data) return <Spinner />
  const C = comp.data
  const groupMatches = (matches.data ?? []).filter(m => m.group_id === gid)
  const bracketRows: BracketMatch[] = groupMatches.map(m => ({ id: m.id, round_no: m.round?.round_no ?? 0, round_name: m.round?.name ?? '', bracket_pos: m.bracket_pos, home_name: m.home?.display_name ?? null, away_name: m.away?.display_name ?? null, home_entry_id: m.home?.id ?? null, away_entry_id: m.away?.id ?? null, home_score: m.home_score, away_score: m.away_score, status: m.status, winner_entry_id: m.winner_entry_id, scheduled_at: m.scheduled_at }))
  const effTab = tab === 'standings' && isKO ? 'bracket' : tab === 'bracket' && !isKO ? 'standings' : tab
  const publicUrl = `${window.location.origin}/f/${C.org?.slug}/c/${C.slug}`
  const embedCode = `<iframe src="${window.location.origin}/embed/${C.id}" style="width:100%;border:0;min-height:600px" loading="lazy" title="${C.name}"></iframe>`

  async function generate() {
    setErr(null)
    try { const n = await competitions.generate(gid, gen.legs, gen.start || null, gen.days); toast(t('comp.generated', { n })); setGen(false); inv() } catch (e) { setErr(errorMessage(e)) }
  }
  async function generateKO() {
    setErr(null)
    try {
      const n = ko.mode === 'standings'
        ? await competitions.knockoutFromStandings(gid, ko.source || rrGroups[0]?.id, ko.top, ko.start || null, ko.days)
        : await competitions.generateKnockout(gid, (entries.data ?? []).filter(e => ko.ids[e.id]).sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99)).map(e => e.id), ko.start || null, ko.days)
      toast(t('comp.bracketGenerated', { n })); setKo(false); inv(); setTab('bracket')
    } catch (e) { setErr(errorMessage(e)) }
  }
  async function addStage(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    try { await competitions.addStage(C.id, orgId, stageForm.name, stageForm.kind, (groups.data?.length ?? 0) + 1); setStage(false); inv() } catch (e) { setErr(errorMessage(e)) }
  }
  async function addEntry(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    try {
      const clubName = (clubs.data ?? []).find(c => (c.club as { id: string }).id === entry.club_org_id)?.club as { name: string } | undefined
      await competitions.addEntry({ competition_id: id, org_id: orgId, group_id: gid || null, club_org_id: entry.club_org_id, section_id: entry.section_id || null, display_name: entry.display_name || clubName?.name, status: 'pending', seed: (entries.data?.length ?? 0) + 1 })
      setEntry(false); inv()
    } catch (e) { setErr(errorMessage(e)) }
  }
  async function saveMatch(e: React.FormEvent) {
    e.preventDefault(); if (!editMatch) return; setErr(null)
    try {
      const patch: Record<string, unknown> = { status: mf.status, venue_id: mf.venue_id || null, scheduled_at: mf.scheduled_at ? new Date(mf.scheduled_at).toISOString() : null }
      if (mf.status === 'played') {
        patch.home_score = Number(mf.home_score); patch.away_score = Number(mf.away_score)
        if (isKO && patch.home_score === patch.away_score) { if (!mf.winner) { setErr(t('comp.drawNeedsWinner')); return } patch.score_detail = { ...(editMatch.score_detail ?? {}), winner_entry_id: mf.winner } }
      }
      else if (mf.status.startsWith('forfeit')) { patch.home_score = mf.status === 'forfeit_home' ? 0 : 20; patch.away_score = mf.status === 'forfeit_away' ? 0 : 20 }
      else { patch.home_score = null; patch.away_score = null }
      await competitions.updateMatch(editMatch.id, patch); setEditMatch(null); inv()
    } catch (e) { setErr(errorMessage(e)) }
  }
  const openMatch = (m: Match) => { setEditMatch(m); setMf({ home_score: m.home_score?.toString() ?? '', away_score: m.away_score?.toString() ?? '', status: m.status === 'scheduled' ? 'played' : m.status, scheduled_at: m.scheduled_at ? m.scheduled_at.slice(0, 16) : '', venue_id: m.venue?.id ?? '', winner: String((m.score_detail as Record<string, unknown> | null)?.winner_entry_id ?? '') }) }

  return (
    <>
      <PageHeader title={C.name} subtitle={<span>{C.season?.name} · {C.sport?.name_el}{C.category?.name ? ` · ${C.category.name}` : ''} · <Badge tone={statusTone(C.status)}>{t(`comp.status.${C.status}`)}</Badge> {C.is_public && <Badge tone="blue">{t('comp.public')}</Badge>}</span>}
        actions={canEdit && <>
          <Select className="w-auto" value={C.status} onChange={async e => { await competitions.update(C.id, { status: e.target.value }); inv() }}>{['draft', 'open', 'in_progress', 'completed', 'archived'].map(s => <option key={s} value={s}>{t(`comp.status.${s}`)}</option>)}</Select>
          <Button variant="outline" onClick={async () => { await competitions.update(C.id, { is_public: !C.is_public }); inv() }}>{C.is_public ? t('comp.private') : t('comp.public')}</Button>
        </>} />
      {err && <div className="mb-3"><ErrorBox error={err} /></div>}
      {C.sport?.kind === 'performance' ? <MeetDetail competitionId={C.id} orgId={orgId} sportId={C.sport_id} categoryId={C.category_id} canEdit={canEdit} />
       : C.sport?.kind === 'combat' ? <CombatDetail competitionId={C.id} orgId={orgId} sportId={C.sport_id} canEdit={canEdit} /> : <>
      <Tabs value={effTab} onChange={setTab} tabs={[isKO ? { id: 'bracket' as const, label: t('comp.bracket') } : { id: 'standings' as const, label: t('comp.standings') }, { id: 'schedule', label: t('comp.schedule'), count: groupMatches.length }, { id: 'results', label: t('comp.results'), count: groupMatches.filter(m => ['played', 'forfeit_home', 'forfeit_away'].includes(m.status)).length }, { id: 'entries', label: t('comp.entries'), count: entries.data?.length }, { id: 'share', label: t('comp.share') }]} />
      {((groups.data?.length ?? 0) > 1 || canEdit) && <div className="mb-3 flex flex-wrap items-center gap-2">
        {(groups.data?.length ?? 0) > 1 && <Select className="w-auto" value={gid} onChange={e => setGroupId(e.target.value)}>{(groups.data ?? []).map(g => <option key={g.id} value={g.id}>{g.stage?.name}{g.stage?.name !== g.name ? ' · ' + g.name : ''}</option>)}</Select>}
        {canEdit && <Button size="sm" variant="ghost" onClick={() => { setStageForm({ name: '', kind: 'knockout' }); setStage(true) }}>{t('comp.addStage')}</Button>}
      </div>}

      {effTab === 'bracket' && (
        <>
          {canEdit && <div className="mb-3 flex gap-2"><Button variant="outline" onClick={() => setKo(true)} disabled={groupMatches.some(m => ['played', 'forfeit_home', 'forfeit_away'].includes(m.status))}>{t('comp.generateBracket')}</Button></div>}
          {bracketRows.length === 0 ? <Empty>{t('comp.noBracket')}</Empty> : <Bracket matches={bracketRows} onPick={canEdit ? m => { const full = groupMatches.find(x => x.id === m.id); if (full && full.home && full.away) openMatch(full) } : undefined} />}
        </>
      )}

      {effTab === 'standings' && (standings.isLoading ? <Spinner /> : (standings.data ?? []).length === 0 ? <Empty /> : (
        <StandingsTable rows={(standings.data ?? []).map(s => ({ rank: s.rank, display_name: s.entry?.display_name, played: s.played, won: s.won, drawn: s.drawn, lost: s.lost, score_for: s.score_for, score_against: s.score_against, points: s.points, tiebreak_trace: s.tiebreak_trace }))} showTiebreak />
      ))}

      {(effTab === 'schedule' || effTab === 'results') && (
        <>
          {canEdit && effTab === 'schedule' && <div className="mb-3 flex gap-2"><Button variant="outline" onClick={() => isKO ? setKo(true) : setGen(true)} disabled={played.length > 0}>{isKO ? t('comp.generateBracket') : t('comp.generate')}</Button><Button variant="ghost" onClick={() => setVenue(true)}>{t('comp.newVenue')}</Button>{played.length > 0 && <span className="self-center text-xs text-slate-500">{t('comp.regenerateBlocked')}</span>}</div>}
          {byRound.length === 0 ? <Empty /> : byRound.map(([rn, ms]) => {
            const shown = effTab === 'results' ? ms.filter(m => ['played', 'forfeit_home', 'forfeit_away'].includes(m.status)) : ms
            if (shown.length === 0) return null
            return (
              <Card key={rn} title={`${ms[0].round?.name ?? rn} ${ms[0].round?.scheduled_on ? '· ' + ms[0].round.scheduled_on : ''}`} className="mb-3">
                <Table><tbody>{shown.map(m => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <Td className="w-36 text-xs text-slate-500">{fmtDateTime(m.scheduled_at)}</Td>
                    <Td className="text-right font-medium">{m.home?.display_name}</Td>
                    <Td className="w-24 text-center tabular-nums">{m.home_score !== null && m.away_score !== null ? <b>{m.home_score} – {m.away_score}</b> : <span className="text-slate-400">–</span>}</Td>
                    <Td className="font-medium">{m.away?.display_name}</Td>
                    <Td className="text-xs text-slate-500">{m.venue?.name ?? ''}</Td>
                    <Td><Badge tone={statusTone(m.status)}>{t(`comp.matchStatus.${m.status}`)}</Badge>{m.manually_edited && <span className="ml-1 text-xs text-slate-400" title={t('comp.manualEdited')}>✎</span>}</Td>
                    <Td right>{canEdit && <Button size="sm" variant="outline" onClick={() => openMatch(m)}>{m.status === 'scheduled' ? t('comp.enterResult') : t('common.edit')}</Button>}</Td>
                  </tr>))}</tbody></Table>
              </Card>)
          })}
        </>
      )}

      {effTab === 'entries' && (
        <>
          {canEdit && <div className="mb-3"><Button onClick={() => setEntry(true)}>{t('comp.addEntry')}</Button></div>}
          <Table><thead><tr><Th>#</Th><Th>{t('common.name')}</Th><Th>{t('common.club')}</Th><Th>{t('sections.title')}</Th><Th>{t('common.status')}</Th><Th>{t('roster.title')}</Th><Th /></tr></thead>
            <tbody>{(entries.data ?? []).map(e => {
              const open = openRoster === e.id || (openRoster === 'mine' && a.clubId === e.club_org_id)
              return (<Fragment key={e.id}>
              <tr data-entry={e.id}><Td>{e.seed}</Td><Td className="font-medium">{e.display_name}</Td><Td>{e.club?.name}</Td><Td>{e.section?.name ?? '—'}</Td><Td><Badge tone={statusTone(e.status)}>{t(`comp.${e.status}`)}</Badge></Td>
                <Td>{e.club_org_id && <Button size="sm" variant={open ? 'primary' : 'outline'} onClick={() => setOpenRoster(open ? null : e.id)}>{t('roster.title')}</Button>}</Td>
                <Td right>{canEdit && e.status === 'pending' && <Button size="sm" onClick={async () => { await competitions.updateEntry(e.id, { status: 'confirmed', group_id: e.group_id ?? gid }); inv() }}>{t('comp.confirm')}</Button>}{canEdit && e.status === 'confirmed' && played.length === 0 && <Button size="sm" variant="ghost" onClick={async () => { await competitions.updateEntry(e.id, { status: 'withdrawn' }); inv() }}>{t('comp.withdraw')}</Button>}</Td></tr>
              {open && e.club_org_id && <tr><td colSpan={7} className="bg-slate-50 px-4 py-3"><RosterPanel entryId={e.id} orgId={orgId} clubId={e.club_org_id} sportId={C.sport_id} canDeclare={canDeclareFor(e.club_org_id) && !['completed', 'archived'].includes(C.status)} canOverride={canEdit} /></td></tr>}
              </Fragment>)
            })}</tbody></Table>
        </>
      )}

      {effTab === 'share' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('common.copyLink')}>
            {C.is_public ? <><a className="break-all text-sm text-brand-700 underline" href={publicUrl} target="_blank" rel="noreferrer">{publicUrl}</a><div className="mt-2"><Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(publicUrl); toast(t('common.copied')) }}>{t('common.copyLink')}</Button></div></> : <span className="text-sm text-amber-700">{t('comp.private')}</span>}
          </Card>
          <Card title={t('comp.shareImage')}>
            <a className="text-sm text-brand-700 underline" href={`/share/${C.id}`} target="_blank" rel="noreferrer">{t('comp.shareImage')} →</a>
          </Card>
          <Card title={t('comp.embed')} className="lg:col-span-2">
            <p className="mb-2 text-xs text-slate-500">{t('comp.embedHint')}</p>
            <textarea readOnly className="w-full rounded border border-slate-200 bg-slate-50 p-2 font-mono text-xs" rows={3} value={embedCode} onFocus={e => e.target.select()} />
            <div className="mt-2"><Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(embedCode); toast(t('common.copied')) }}>{t('common.copyLink')}</Button></div>
          </Card>
        </div>
      )}

      </>}
      <Modal open={genOpen} onClose={() => setGen(false)} title={t('comp.generate')}>
        <div className="grid gap-3">
          <Field label={t('comp.legs')}><Select value={gen.legs} onChange={e => setGenForm({ ...gen, legs: Number(e.target.value) })}><option value={1}>{t('comp.single')}</option><option value={2}>{t('comp.double')}</option></Select></Field>
          <Field label={t('comp.startDate')}><Input type="date" value={gen.start} onChange={e => setGenForm({ ...gen, start: e.target.value })} /></Field>
          <Field label={t('comp.daysBetween')}><Input type="number" min={1} value={gen.days} onChange={e => setGenForm({ ...gen, days: Number(e.target.value) })} /></Field>
          <p className="text-xs text-slate-500">{(entries.data ?? []).filter(e => e.status === 'confirmed').length} {t('comp.confirmed').toLowerCase()} · {t('comp.roundRobin')}</p>
          <div className="flex justify-end"><Button onClick={generate}>{t('comp.generate')}</Button></div>
        </div>
      </Modal>
      <Modal open={koOpen} onClose={() => setKo(false)} title={t('comp.generateBracket')}>
        <div className="grid gap-3">
          <Field label={t('comp.bracketSource')}><Select value={ko.mode} onChange={e => setKoForm({ ...ko, mode: e.target.value as 'seed' | 'standings' })}><option value="seed">{t('comp.bracketBySeed')}</option>{rrGroups.length > 0 && <option value="standings">{t('comp.bracketFromStandings')}</option>}</Select></Field>
          {ko.mode === 'standings' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('comp.groups')}><Select value={ko.source || rrGroups[0]?.id || ''} onChange={e => setKoForm({ ...ko, source: e.target.value })}>{rrGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
              <Field label={t('comp.topN')}><Select value={ko.top} onChange={e => setKoForm({ ...ko, top: Number(e.target.value) })}>{[2, 4, 8, 16].map(n => <option key={n} value={n}>{n}</option>)}</Select></Field>
            </div>
          ) : (
            <div className="max-h-64 overflow-auto rounded border border-slate-200 text-sm">
              {(entries.data ?? []).filter(e => e.status === 'confirmed').sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99)).map(e => (
                <label key={e.id} className="flex items-center gap-2 border-b border-slate-100 px-3 py-1.5"><input type="checkbox" checked={!!ko.ids[e.id]} onChange={ev => setKoForm({ ...ko, ids: { ...ko.ids, [e.id]: ev.target.checked } })} /><span className="w-6 text-xs text-slate-400">{e.seed}</span>{e.display_name}</label>
              ))}
              <div className="px-3 py-1.5"><button type="button" className="text-xs text-brand-700" onClick={() => { const all: Record<string, boolean> = {}; for (const e of (entries.data ?? []).filter(e => e.status === 'confirmed')) all[e.id] = true; setKoForm({ ...ko, ids: all }) }}>{t('common.all')}</button></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('comp.startDate')}><Input type="date" value={ko.start} onChange={e => setKoForm({ ...ko, start: e.target.value })} /></Field>
            <Field label={t('comp.daysBetween')}><Input type="number" min={1} value={ko.days} onChange={e => setKoForm({ ...ko, days: Number(e.target.value) })} /></Field>
          </div>
          {err && <ErrorBox error={err} />}
          <div className="flex justify-end"><Button onClick={generateKO}>{t('comp.generateBracket')}</Button></div>
        </div>
      </Modal>
      <Modal open={stageOpen} onClose={() => setStage(false)} title={t('comp.addStage')}>
        <form onSubmit={addStage} className="grid gap-3">
          <Field label={t('common.name')} required><Input required value={stageForm.name} onChange={e => setStageForm({ ...stageForm, name: e.target.value })} placeholder="Playoffs / Ταμπλό / Όμιλος Β" /></Field>
          <Field label={t('comp.format')}><Select value={stageForm.kind} onChange={e => setStageForm({ ...stageForm, kind: e.target.value as 'knockout' | 'round_robin' })}><option value="knockout">{t('comp.formats.cup')}</option><option value="round_robin">{t('comp.formats.league')}</option></Select></Field>
          <div className="flex justify-end"><Button type="submit">{t('common.create')}</Button></div>
        </form>
      </Modal>
      <Modal open={entryOpen} onClose={() => setEntry(false)} title={t('comp.addEntry')}>
        <form onSubmit={addEntry} className="grid gap-3">
          <Field label={t('common.club')} required><Select required value={entry.club_org_id} onChange={e => setEntryForm({ ...entry, club_org_id: e.target.value, section_id: '' })}><option value="">{t('common.select')}</option>{(clubs.data ?? []).map(c => <option key={c.id} value={(c.club as { id: string }).id}>{(c.club as { name: string }).name}</option>)}</Select></Field>
          <Field label={t('sections.title')}><Select value={entry.section_id} onChange={e => setEntryForm({ ...entry, section_id: e.target.value })}><option value="">—</option>{(sections.data ?? []).filter(s => s.sport_id === C.sport_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label={t('common.name')}><Input value={entry.display_name} onChange={e => setEntryForm({ ...entry, display_name: e.target.value })} /></Field>
          <div className="flex justify-end"><Button type="submit">{t('common.save')}</Button></div>
        </form>
      </Modal>
      <Modal open={!!editMatch} onClose={() => setEditMatch(null)} title={`${editMatch?.home?.display_name} – ${editMatch?.away?.display_name}`}>
        <form onSubmit={saveMatch} className="grid gap-3">
          <Field label={t('common.status')}><Select value={mf.status} onChange={e => setMf({ ...mf, status: e.target.value })}>{['played', 'scheduled', 'postponed', 'cancelled', 'forfeit_home', 'forfeit_away'].map(s => <option key={s} value={s}>{t(`comp.matchStatus.${s}`)}</option>)}</Select></Field>
          {mf.status === 'played' && <div className="grid grid-cols-2 gap-3"><Field label={editMatch?.home?.display_name}><Input type="number" min={0} required value={mf.home_score} onChange={e => setMf({ ...mf, home_score: e.target.value })} /></Field><Field label={editMatch?.away?.display_name}><Input type="number" min={0} required value={mf.away_score} onChange={e => setMf({ ...mf, away_score: e.target.value })} /></Field></div>}
          {isKO && mf.status === 'played' && mf.home_score !== '' && mf.home_score === mf.away_score && (
            <Field label={t('comp.winner')} required hint={t('comp.drawNeedsWinner')}><Select required value={mf.winner} onChange={e => setMf({ ...mf, winner: e.target.value })}><option value="">{t('common.select')}</option><option value={editMatch?.home?.id}>{editMatch?.home?.display_name}</option><option value={editMatch?.away?.id}>{editMatch?.away?.display_name}</option></Select></Field>
          )}
          <Field label={t('common.date')}><Input type="datetime-local" value={mf.scheduled_at} onChange={e => setMf({ ...mf, scheduled_at: e.target.value })} /></Field>
          <Field label={t('comp.venue')}><Select value={mf.venue_id} onChange={e => setMf({ ...mf, venue_id: e.target.value })}><option value="">—</option>{(venues.data ?? []).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
          <div className="flex justify-end"><Button type="submit">{t('common.save')}</Button></div>
        </form>
      </Modal>
      <Modal open={venueOpen} onClose={() => setVenue(false)} title={t('comp.newVenue')}>
        <form onSubmit={async e => { e.preventDefault(); await competitions.addVenue({ org_id: orgId, ...vf }); qc.invalidateQueries({ queryKey: ['venues', orgId] }); setVenue(false) }} className="grid gap-3">
          <Field label={t('common.name')} required><Input required value={vf.name} onChange={e => setVf({ ...vf, name: e.target.value })} /></Field>
          <Field label={t('clubs.address')}><Input value={vf.address} onChange={e => setVf({ ...vf, address: e.target.value })} /></Field>
          <Field label={t('common.city')}><Input value={vf.city} onChange={e => setVf({ ...vf, city: e.target.value })} /></Field>
          <div className="flex justify-end"><Button type="submit">{t('common.save')}</Button></div>
        </form>
      </Modal>
    </>
  )
}
