import { useTranslation } from 'react-i18next'

export type StandingRow = { rank: number; display_name?: string | null; club_logo?: string | null; played: number; won: number; drawn: number; lost: number; score_for: number; score_against: number; points: number; tiebreak_trace?: { order?: string[]; h2h_points?: number; h2h_diff?: number } | null }

export function StandingsTable({ rows, showTiebreak, compact }: { rows: StandingRow[]; showTiebreak?: boolean; compact?: boolean }) {
  const { t } = useTranslation()
  const hasDraws = rows.some(r => r.drawn > 0)
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className={`w-full ${compact ? 'text-xs' : 'text-sm'}`}>
        <thead><tr className="bg-slate-50 text-xs uppercase text-slate-500">
          <th className="px-2 py-2 text-left">#</th><th className="px-2 py-2 text-left">{t('comp.entries')}</th>
          <th className="px-2 py-2 text-right">{t('comp.played')}</th><th className="px-2 py-2 text-right">{t('comp.won')}</th>{hasDraws && <th className="px-2 py-2 text-right">{t('comp.drawn')}</th>}<th className="px-2 py-2 text-right">{t('comp.lost')}</th>
          <th className="hidden px-2 py-2 text-right sm:table-cell">{t('comp.for')}</th><th className="hidden px-2 py-2 text-right sm:table-cell">{t('comp.against')}</th><th className="px-2 py-2 text-right">{t('comp.diff')}</th><th className="px-2 py-2 text-right font-bold">{t('comp.points')}</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const tied = rows.some((o, j) => j !== i && o.points === r.points)
            return (
              <tr key={r.rank} className={`border-t border-slate-100 ${i < 4 ? '' : ''}`}>
                <td className="px-2 py-1.5 tabular-nums text-slate-500">{r.rank}</td>
                <td className="px-2 py-1.5 font-medium">{r.display_name}{showTiebreak && tied && r.tiebreak_trace && <span className="ml-1 text-[10px] font-normal text-slate-400" title={t('comp.tiebreak', { keys: (r.tiebreak_trace.order ?? []).join(' → ') })}>h2h {r.tiebreak_trace.h2h_points}/{r.tiebreak_trace.h2h_diff}</span>}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.played}</td><td className="px-2 py-1.5 text-right tabular-nums">{r.won}</td>{hasDraws && <td className="px-2 py-1.5 text-right tabular-nums">{r.drawn}</td>}<td className="px-2 py-1.5 text-right tabular-nums">{r.lost}</td>
                <td className="hidden px-2 py-1.5 text-right tabular-nums sm:table-cell">{r.score_for}</td><td className="hidden px-2 py-1.5 text-right tabular-nums sm:table-cell">{r.score_against}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.score_for - r.score_against > 0 ? '+' : ''}{r.score_for - r.score_against}</td>
                <td className="px-2 py-1.5 text-right font-bold tabular-nums">{r.points}</td>
              </tr>)
          })}
        </tbody>
      </table>
    </div>
  )
}
