import { useEffect, useMemo, useState } from 'react'
import { Bracket } from '@/pages/competitions/Bracket'
import { fmtResult } from '@/lib/format'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { pub } from '@/api'
import { Spinner, Empty, Tabs, Badge, statusTone, Button } from '@/components/ui'
import { fmtDateTime, fmtDate } from '@/lib/format'
import { StandingsTable } from './StandingsTable'
import { PublicShell } from './PublicOrg'

type PM = { id: string; group_id: string; round_no: number; round_name: string; scheduled_on: string | null; scheduled_at: string | null; status: string; home_score: number | null; away_score: number | null; home_name: string | null; away_name: string | null; venue_name: string | null; bracket_pos: number | null; home_entry_id: string | null; away_entry_id: string | null; winner_entry_id: string | null }

type PEv = { id: string; name: string; result_type: string; unit: string; status: string; category_name: string | null; entries: number }
type PRes = { id: string; event_id: string; group_id: string; group_name: string; heat_kind: string; group_order: number; lane: number | null; value: number | string | null; status: string; rank: number | null; overall_rank: number | null; wind: number | null; display_name: string; club_name: string | null }

/** Δημόσια αποτελέσματα αγώνα με αγωνίσματα */
function MeetBody({ competitionId, compact }: { competitionId: string; compact?: boolean }) {
  const { t } = useTranslation()
  const evs = useQuery({ queryKey: ['pub-events', competitionId], queryFn: () => pub.events(competitionId) as Promise<PEv[]> })
  const res = useQuery({ queryKey: ['pub-results', competitionId], queryFn: () => pub.results(competitionId) as Promise<PRes[]> })
  const [evId, setEvId] = useState('')
  const eid = evId || evs.data?.[0]?.id || ''
  const ev = (evs.data ?? []).find(e => e.id === eid)
  if (evs.isLoading || res.isLoading) return <Spinner />
  if (!ev) return <Empty />
  const rows = (res.data ?? []).filter(r => r.event_id === eid)
  const groups = [...new Map(rows.map(r => [r.group_id, { id: r.group_id, name: r.group_name, kind: r.heat_kind, order: r.group_order }])).values()].sort((a, b) => a.order - b.order)
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5">{(evs.data ?? []).map(e => <button key={e.id} onClick={() => setEvId(e.id)} className={`rounded-full px-3 py-1 text-sm ${e.id === eid ? 'bg-nav text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>{e.name}{e.category_name ? ' · ' + e.category_name : ''}</button>)}</div>
      {groups.length === 0 ? <Empty /> : groups.map(g => {
        const gr = rows.filter(r => r.group_id === g.id).sort((x, y) => (g.kind === 'heat' ? (x.rank ?? 99) - (y.rank ?? 99) : (x.overall_rank ?? 99) - (y.overall_rank ?? 99)))
        return (
          <div key={g.id} className="mb-3 rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-600"><span>{g.name}</span><span>{t(`events.${g.kind === 'heat' ? 'heat' : 'final'}`)}</span></div>
            <table className={`w-full ${compact ? 'text-xs' : 'text-sm'}`}><tbody>{gr.map(r => (
              <tr key={r.id} className="border-t border-slate-50">
                <td className="w-10 px-3 py-1.5 text-center font-display font-bold tabular-nums">{g.kind === 'heat' ? r.rank ?? '' : r.overall_rank ?? ''}</td>
                <td className="px-2 py-1.5 font-medium">{r.display_name}</td>
                <td className="hidden px-2 py-1.5 text-xs text-slate-500 sm:table-cell">{r.club_name ?? ''}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.status === 'ok' ? fmtResult(r.value, ev.result_type, ev.unit) : <span className="text-xs text-slate-400" title={t(`events.rstatusLong.${r.status}`)}>{t(`events.rstatus.${r.status}`)}</span>}</td>
                {ev.result_type === 'time' && <td className="hidden w-16 px-2 py-1.5 text-right text-xs text-slate-400 md:table-cell">{r.wind !== null ? (r.wind > 0 ? '+' : '') + r.wind : ''}</td>}
              </tr>))}</tbody></table>
          </div>)
      })}
    </>
  )
}

export function CompetitionBody({ competitionId, compact }: { competitionId: string; compact?: boolean }) {
  const { t } = useTranslation()
  const evsProbe = useQuery({ queryKey: ['pub-events', competitionId], queryFn: () => pub.events(competitionId) as Promise<PEv[]> })
  const [tab, setTab] = useState<'standings' | 'schedule' | 'results'>('standings')
  const groups = useQuery({ queryKey: ['pub-groups', competitionId], queryFn: () => pub.groups(competitionId) })
  const matches = useQuery({ queryKey: ['pub-matches', competitionId], queryFn: () => pub.matches(competitionId) as Promise<PM[]> })
  const standings = useQuery({ queryKey: ['pub-standings', competitionId], queryFn: () => pub.standings(competitionId) })
  const byRound = useMemo(() => { const m = new Map<number, PM[]>(); for (const x of (matches.data ?? [])) m.set(x.round_no, [...(m.get(x.round_no) ?? []), x]); return [...m.entries()].sort((p, q) => p[0] - q[0]) }, [matches.data])
  const isResult = (m: PM) => ['played', 'forfeit_home', 'forfeit_away'].includes(m.status)
  const nextRound = byRound.find(([, ms]) => ms.some(m => !isResult(m) && m.status !== 'cancelled'))?.[0]
  if ((evsProbe.data ?? []).length > 0) return <MeetBody competitionId={competitionId} compact={compact} />
  return (
    <>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'standings', label: t('public.standings') }, { id: 'schedule', label: t('public.schedule') }, { id: 'results', label: t('public.results') }]} />
      {tab === 'standings' && (groups.data ?? []).filter(g => g.kind === 'knockout').map(g => {
        const ms = (matches.data ?? []).filter(m => m.group_id === g.id)
        if (ms.length === 0) return null
        return <div key={g.id} className="mb-4"><h3 className="mb-2 text-sm font-semibold">{g.stage_name}{g.stage_name !== g.name ? ' · ' + g.name : ''}</h3><Bracket compact={compact} matches={ms.map(m => ({ id: m.id, round_no: m.round_no, round_name: m.round_name, bracket_pos: m.bracket_pos, home_name: m.home_name, away_name: m.away_name, home_entry_id: m.home_entry_id, away_entry_id: m.away_entry_id, home_score: m.home_score, away_score: m.away_score, status: m.status, winner_entry_id: m.winner_entry_id, scheduled_at: m.scheduled_at }))} /></div>
      })}
      {tab === 'standings' && (standings.isLoading ? <Spinner /> : (standings.data ?? []).length === 0 ? ((groups.data ?? []).some(g => g.kind === 'knockout') ? null : <Empty />) : (groups.data ?? []).filter(g => g.kind !== 'knockout').map(g => {
        const rows = (standings.data ?? []).filter(s => s.group_id === g.id)
        if (rows.length === 0) return null
        return <div key={g.id} className="mb-4">{(groups.data?.length ?? 0) > 1 && <h3 className="mb-1 text-sm font-semibold">{g.name}</h3>}<StandingsTable rows={rows} compact={compact} /><div className="mt-1 text-right text-[10px] text-slate-400">{t('public.updated')}: {fmtDateTime(rows[0].computed_at)}</div></div>
      }))}
      {(tab === 'schedule' || tab === 'results') && (matches.isLoading ? <Spinner /> : byRound.length === 0 ? <Empty /> : byRound.map(([rn, ms]) => {
        const shown = tab === 'results' ? ms.filter(isResult) : ms
        if (shown.length === 0) return null
        return (
          <div key={rn} className={`mb-3 rounded-lg border bg-white ${rn === nextRound && tab === 'schedule' ? 'border-brand-500' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-600"><span>{ms[0].round_name}</span><span>{fmtDate(ms[0].scheduled_on)}</span></div>
            <table className={`w-full ${compact ? 'text-xs' : 'text-sm'}`}><tbody>{shown.map(m => (
              <tr key={m.id} className="border-t border-slate-50">
                <td className="hidden w-32 px-3 py-1.5 text-xs text-slate-500 sm:table-cell">{m.scheduled_at ? fmtDateTime(m.scheduled_at).slice(11) : ''}</td>
                <td className="px-2 py-1.5 text-right font-medium">{m.home_name}</td>
                <td className="w-20 px-1 py-1.5 text-center tabular-nums">{m.home_score !== null && m.away_score !== null ? <b>{m.home_score}–{m.away_score}</b> : <span className="text-slate-300">–</span>}</td>
                <td className="px-2 py-1.5 font-medium">{m.away_name}</td>
                <td className="hidden px-2 py-1.5 text-xs text-slate-400 md:table-cell">{m.venue_name ?? ''}</td>
                <td className="px-2 py-1.5 text-right">{m.status !== 'scheduled' && m.status !== 'played' && <Badge tone={statusTone(m.status)}>{t(`comp.matchStatus.${m.status}`)}</Badge>}</td>
              </tr>))}</tbody></table>
          </div>)
      }))}
    </>
  )
}

export default function PublicCompetition() {
  const { orgSlug, slug } = useParams<{ orgSlug: string; slug: string }>()
  const { t, i18n } = useTranslation()
  const comp = useQuery({ queryKey: ['pub-comp', orgSlug, slug], queryFn: () => pub.competition(orgSlug!, slug!) })
  useEffect(() => { if (comp.data) document.title = `${comp.data.name} — ${comp.data.org_name}` }, [comp.data])
  if (comp.isLoading) return <Spinner />
  if (!comp.data) return <PublicShell title="404"><Empty /></PublicShell>
  const C = comp.data
  return (
    <PublicShell title={C.name} subtitle={<span><Link className="text-brand-700 hover:underline" to={`/f/${orgSlug}`}>{C.org_name}</Link> · {C.season_name} · {i18n.language === 'en' ? C.sport_name_en : C.sport_name_el} {C.category_name ? '· ' + C.category_name : ''}</span>}>
      <div className="mb-4 flex gap-2"><Button size="sm" variant="outline" onClick={() => navigator.share ? navigator.share({ title: C.name, url: window.location.href }) : navigator.clipboard.writeText(window.location.href)}>{t('comp.share')}</Button><a href={`/share/${C.id}`} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">{t('comp.shareImage')}</Button></a></div>
      <CompetitionBody competitionId={C.id} />
    </PublicShell>
  )
}
