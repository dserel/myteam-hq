import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { pub } from '@/api'
import { Spinner, Button } from '@/components/ui'

/**
 * Social share image (1080×1080) of the standings or one round, rendered as SVG → PNG in the browser.
 * No server needed; works on the local stack too.
 */
export default function ShareImage() {
  const { competitionId } = useParams<{ competitionId: string }>()
  const comp = useQuery({ queryKey: ['pub-comp-id', competitionId], queryFn: () => pub.competitionById(competitionId!) })
  const standings = useQuery({ queryKey: ['pub-standings', competitionId], queryFn: () => pub.standings(competitionId!) })
  const matches = useQuery({ queryKey: ['pub-matches', competitionId], queryFn: () => pub.matches(competitionId!) })
  const [mode, setMode] = useState<'standings' | 'round'>('standings')
  const [round, setRound] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  if (comp.isLoading || standings.isLoading || matches.isLoading) return <Spinner />
  const C = comp.data; if (!C) return null
  const rounds: number[] = [...new Set<number>((matches.data ?? []).map((m: { round_no: number }) => m.round_no))].sort((a, b) => a - b)
  const playedRounds = rounds.filter(r => (matches.data ?? []).some(m => m.round_no === r && ['played', 'forfeit_home', 'forfeit_away'].includes(m.status)))
  const rn = round ?? playedRounds[playedRounds.length - 1] ?? rounds[0]
  const rows = (standings.data ?? []).slice(0, 12)
  const ms = (matches.data ?? []).filter(m => m.round_no === rn)
  const W = 1080, H = 1080
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

  function download() {
    const svg = svgRef.current!; const xml = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }); const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = W; c.height = H
      const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, 0, 0)
      const a = document.createElement('a'); a.download = `${C.slug}-${mode}.png`; a.href = c.toDataURL('image/png'); a.click(); URL.revokeObjectURL(url)
    }
    img.src = url
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant={mode === 'standings' ? 'primary' : 'outline'} onClick={() => setMode('standings')}>Βαθμολογία</Button>
          <Button size="sm" variant={mode === 'round' ? 'primary' : 'outline'} onClick={() => setMode('round')}>Αγωνιστική</Button>
          {mode === 'round' && <select className="rounded border px-2 py-1 text-sm" value={rn} onChange={e => setRound(Number(e.target.value))}>{rounds.map(r => <option key={r} value={r}>{r}η αγωνιστική</option>)}</select>}
          <Button size="sm" onClick={download}>Λήψη PNG</Button>
        </div>
        <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg shadow" style={{ fontFamily: 'Poppins, Arial, sans-serif' }}>
          <rect width={W} height={H} fill="#131429" />
          <rect x={0} y={0} width={W} height={200} fill="#1e2040" />
          <text x={60} y={90} fill="#04e0b5" fontSize={28} fontWeight={600}>{esc(C.org_name)}</text>
          <text x={60} y={150} fill="#fff" fontSize={44} fontWeight={700}>{esc(C.name)}</text>
          <text x={W - 60} y={150} fill="#04e0b5" fontSize={28} textAnchor="end">{mode === 'standings' ? 'ΒΑΘΜΟΛΟΓΙΑ' : `${rn}η ΑΓΩΝΙΣΤΙΚΗ`}</text>
          {mode === 'standings' ? (
            <g>
              {['#', 'ΟΜΑΔΑ', 'ΑΓ', 'Ν', 'Η', 'ΔΙΑΦ', 'ΒΑΘ'].map((h, i) => <text key={h} x={[70, 130, 720, 800, 880, 960, 1030][i]} y={260} fill="#94a3b8" fontSize={22} fontWeight={600} textAnchor={i >= 2 ? 'end' : 'start'}>{h}</text>)}
              {rows.map((r, i) => {
                const y = 320 + i * 60; const d = r.score_for - r.score_against
                return (
                  <g key={r.rank}>
                    {i % 2 === 0 && <rect x={50} y={y - 38} width={W - 100} height={56} fill="#2c2e4d" rx={8} />}
                    <text x={70} y={y} fill={i < 1 ? '#f4b63f' : '#94a3b8'} fontSize={26} fontWeight={700}>{r.rank}</text>
                    <text x={130} y={y} fill="#fff" fontSize={28} fontWeight={600}>{esc((r.display_name ?? '').slice(0, 30))}</text>
                    <text x={720} y={y} fill="#e2e8f0" fontSize={26} textAnchor="end">{r.played}</text>
                    <text x={800} y={y} fill="#e2e8f0" fontSize={26} textAnchor="end">{r.won}</text>
                    <text x={880} y={y} fill="#e2e8f0" fontSize={26} textAnchor="end">{r.lost}</text>
                    <text x={960} y={y} fill="#e2e8f0" fontSize={26} textAnchor="end">{d > 0 ? '+' : ''}{d}</text>
                    <text x={1030} y={y} fill="#fff" fontSize={30} fontWeight={800} textAnchor="end">{r.points}</text>
                  </g>)
              })}
            </g>
          ) : (
            <g>
              {ms.map((m, i) => {
                const y = 300 + i * 120; const res = m.home_score !== null && m.away_score !== null
                return (
                  <g key={m.id}>
                    <rect x={50} y={y - 60} width={W - 100} height={100} fill="#2c2e4d" rx={12} />
                    <text x={W / 2 - 70} y={y} fill="#fff" fontSize={30} fontWeight={600} textAnchor="end">{esc((m.home_name ?? '').slice(0, 24))}</text>
                    <text x={W / 2} y={y + 2} fill={res ? '#f4b63f' : '#64748b'} fontSize={38} fontWeight={800} textAnchor="middle">{res ? `${m.home_score} - ${m.away_score}` : '–'}</text>
                    <text x={W / 2 + 70} y={y} fill="#fff" fontSize={30} fontWeight={600}>{esc((m.away_name ?? '').slice(0, 24))}</text>
                    <text x={W / 2} y={y + 32} fill="#94a3b8" fontSize={18} textAnchor="middle">{m.venue_name ?? ''}{m.status === 'postponed' ? ' · ΑΝΑΒΟΛΗ' : m.status.startsWith('forfeit') ? ' · ΜΗΔΕΝΙΣΜΟΣ' : ''}</text>
                  </g>)
              })}
            </g>
          )}
          <text x={W / 2} y={H - 40} fill="#475569" fontSize={20} textAnchor="middle">{window.location.host}/f/{C.org_slug}/c/{C.slug}</text>
        </svg>
      </div>
    </div>
  )
}
