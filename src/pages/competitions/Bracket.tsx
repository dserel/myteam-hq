import { useMemo } from 'react'
import { fmtDate } from '@/lib/format'

export type BracketMatch = { id: string; round_no: number; round_name: string; bracket_pos: number | null; home_name: string | null; away_name: string | null; home_entry_id: string | null; away_entry_id: string | null; home_score: number | null; away_score: number | null; status: string; winner_entry_id: string | null; scheduled_at: string | null }

/** Ταμπλό νοκ-άουτ: μία στήλη ανά γύρο, κάρτες κατά bracket_pos. Δουλεύει και σε κινητό (οριζόντια κύλιση). */
export function Bracket({ matches, onPick, compact }: { matches: BracketMatch[]; onPick?: (m: BracketMatch) => void; compact?: boolean }) {
  const rounds = useMemo(() => {
    const m = new Map<number, BracketMatch[]>()
    for (const x of matches) m.set(x.round_no, [...(m.get(x.round_no) ?? []), x])
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([no, ms]) => ({ no, name: ms[0].round_name, ms: ms.sort((a, b) => (a.bracket_pos ?? 0) - (b.bracket_pos ?? 0)) }))
  }, [matches])
  if (rounds.length === 0) return null
  const size = compact ? 'text-xs' : 'text-sm'
  return (
    <div className="overflow-x-auto pb-2" data-bracket>
      <div className="flex min-w-max gap-6">
        {rounds.map((r, ri) => (
          <div key={r.no} className="flex w-52 flex-col" style={{ justifyContent: 'space-around' }}>
            <div className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">{r.name}</div>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {r.ms.map(m => {
                const done = ['played', 'forfeit_home', 'forfeit_away'].includes(m.status)
                const side = (name: string | null, id: string | null, score: number | null) => {
                  const won = done && !!id && m.winner_entry_id === id
                  return (
                    <div className={`flex items-center justify-between gap-2 px-2.5 py-1.5 ${won ? 'bg-brand-50 font-semibold text-brand-800' : name ? 'text-ink-900' : 'text-slate-400 italic'}`}>
                      <span className="truncate">{name ?? (ri === 0 ? '—' : '…')}</span>
                      <span className="w-6 text-right tabular-nums">{done && score !== null ? score : ''}</span>
                    </div>)
                }
                return (
                  <div key={m.id} data-bracket-match={m.id} onClick={onPick ? () => onPick(m) : undefined}
                    className={`divide-y divide-slate-100 rounded-lg border bg-white ${size} ${done ? 'border-slate-200' : 'border-dashed border-slate-300'} ${onPick ? 'cursor-pointer hover:border-brand-500' : ''}`}>
                    {side(m.home_name, m.home_entry_id, m.home_score)}
                    {side(m.away_name, m.away_entry_id, m.away_score)}
                    <div className="px-2.5 py-1 text-[10px] text-slate-400">{m.status === 'played' && m.home_score === m.away_score ? 'παράταση · ' : ''}{m.status === 'forfeit_home' || m.status === 'forfeit_away' ? 'μηδενισμός · ' : ''}{m.scheduled_at ? fmtDate(m.scheduled_at) : ''}</div>
                  </div>)
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
