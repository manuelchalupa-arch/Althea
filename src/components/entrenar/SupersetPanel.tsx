/**
 * Panel visible de superserie: grupo, ejercicio actual (serie X de N),
 * próximo ejercicio y progreso de ronda. Todo derivado del estado real
 * (índice actual, registros y hechos), nunca decorativo.
 */

type Member = { name: string; sets: number; plannedSets?: number }
type LogEntry = { status?: string; skipped?: boolean }

const letterOf = (p: number): string => (p < 26 ? String.fromCharCode(65 + p) : `I${p + 1}`)

export default function SupersetPanel({ blockNumber, block, current, exercises, logs, done }: {
  blockNumber: number
  block: number[]
  current: number
  exercises: Member[]
  logs: Record<number, LogEntry[]>
  done: Record<number, boolean>
}) {
  const recsOf = (i: number): LogEntry[] => logs[i] || []
  const resolvedOf = (i: number): number =>
    recsOf(i).filter((r) => !!r && (r.status === 'COMPLETED' || r.status === 'SKIPPED' || r.skipped === true)).length
  const plannedOf = (i: number): number =>
    Math.max(exercises[i]?.plannedSets ?? exercises[i]?.sets ?? 0, recsOf(i).length, 1)
  const pendingOf = (i: number): boolean => !done[i] && resolvedOf(i) < plannedOf(i)

  const pos = block.indexOf(current)
  if (pos < 0) { return null }
  const letter = (p: number) => letterOf(p)

  const curPlanned = plannedOf(current)
  const curSeries = Math.min(resolvedOf(current) + 1, curPlanned)

  // Siguiente estación en orden de ejecución: resto de la ronda y vuelta al inicio.
  const pendingOrder = [...block.slice(pos + 1), ...block.slice(0, pos)]
  const rawNext = pendingOrder.find((i) => pendingOf(i)) ?? null
  // Si nadie más tiene pendientes, la serie sigue en la estación actual.
  const nextIdx = rawNext ?? (pendingOf(current) ? current : null)

  const doneCounts = block.map((i) => resolvedOf(i))
  const plannedCounts = block.map((i) => plannedOf(i))
  const maxSets = Math.max(...plannedCounts)
  // Ronda: la que está en curso (mínimo de series resueltas entre quienes
  // siguen pendientes; si todos terminaron, la última queda cerrada).
  const withPending = block.filter((i) => pendingOf(i))
  const roundBase = withPending.length ? Math.min(...withPending.map((i) => resolvedOf(i))) : maxSets
  const round = Math.min(roundBase + 1, maxSets)

  const totalDone = doneCounts.reduce((a, b) => a + b, 0)
  const totalPlanned = plannedCounts.reduce((a, b) => a + b, 0)
  const pct = totalPlanned ? Math.round((totalDone / totalPlanned) * 100) : 0

  let nextLabel: string
  if (nextIdx === null) {
    nextLabel = 'Bloque completo: descanso y consulta de dolor'
  } else if (nextIdx === current) {
    const s = Math.min(resolvedOf(current) + 1, curPlanned)
    nextLabel = `Sigue acá: ${letter(pos)}${s} — serie ${s} de ${curPlanned}`
  } else {
    const p = block.indexOf(nextIdx)
    const s = Math.min(resolvedOf(nextIdx) + 1, plannedOf(nextIdx))
    nextLabel = `Siguiente: ${letter(p)}${s} — ${exercises[nextIdx]?.name ?? ''} · serie ${s} de ${plannedOf(nextIdx)}`
  }

  return (
    <div data-testid="superset-panel" className="mx-3 my-2 rounded-lg border border-secondary/40 bg-secondary/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-label-caps text-[10px] uppercase text-secondary font-semibold">SUPERSERIE {blockNumber} · GRUPO {letter(pos)}</span>
        <span className="font-label-caps text-[10px] uppercase text-on-surface-variant" data-testid="superset-round">Ronda {round} de {maxSets}</span>
      </div>
      <div className="flex gap-1.5 flex-wrap" role="list" aria-label="Integrantes de la superserie">
        {block.map((j, p) => {
          const isDone = !pendingOf(j)
          return (
            <span key={j} role="listitem" aria-label={`Integrante ${letter(p)}`} className={`px-1.5 py-0.5 rounded border font-mono text-[10px] ${j === current ? 'bg-secondary text-on-surface border-secondary font-bold' : isDone ? 'bg-primary-container text-on-surface border-primary/40' : 'bg-surface-container text-on-surface-variant border-outline-variant/40'}`}>
              {letter(p)} {doneCounts[p]}/{plannedCounts[p]}
            </span>
          )
        })}
      </div>
      <p data-testid="superset-current" className="text-[12px] text-on-surface">
        Ahora: <strong>{letter(pos)}{curSeries}</strong> {exercises[current]?.name ?? ''} — serie {curSeries} de {curPlanned}
      </p>
      <p data-testid="superset-next" className="text-[12px] text-on-surface-variant">{nextLabel}</p>
      <div className="h-1.5 rounded-full bg-surface-container overflow-hidden border border-outline-variant/30" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de la ronda">
        <div className="h-full bg-secondary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
