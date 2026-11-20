import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { pub } from '@/api'
import { CompetitionBody } from './PublicCompetition'
import { Spinner } from '@/components/ui'

/** Minimal chrome for <iframe> embedding on a union's website. Posts its height to the parent. */
export default function Embed() {
  const { competitionId } = useParams<{ competitionId: string }>()
  const comp = useQuery({ queryKey: ['pub-comp-id', competitionId], queryFn: () => pub.competitionById(competitionId!) })
  useEffect(() => {
    const send = () => window.parent?.postMessage({ type: 'fed-embed-height', height: document.body.scrollHeight }, '*')
    const ro = new ResizeObserver(send); ro.observe(document.body); send()
    return () => ro.disconnect()
  }, [])
  if (comp.isLoading) return <Spinner />
  if (!comp.data) return <div className="p-4 text-sm text-slate-500">—</div>
  return (
    <div className="bg-white p-3">
      <div className="mb-2 text-sm font-semibold">{comp.data.name} <span className="font-normal text-slate-500">· {comp.data.season_name}</span></div>
      <CompetitionBody competitionId={comp.data.id} compact />
      <div className="mt-2 text-right text-[10px] text-slate-400"><a href={`${window.location.origin}/f/${comp.data.org_slug}/c/${comp.data.slug}`} target="_blank" rel="noreferrer">{comp.data.org_name} ↗</a></div>
    </div>
  )
}
