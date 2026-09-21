import { useState, useEffect } from 'react'
import { db } from '@/services/storage/db'

// Panel de resultado calculado desde Dexie (sesión + sets + encuesta).
// Sin espejos de localStorage: todo se deriva de la fuente canónica.
export default function ResultPanel({ sessionId, sessionStatus }: { sessionId?: string | null; today: string; sessionStatus: string }) {
  const [stats, setStats] = useState<null | {
    completedEx: number; plannedEx: number; completedSets: number; plannedSets: number
    exPct: number; totalVol: number; totalReps: number; durMin: number | null
    sessionRating: number | null; pain: number | null; highlights: string[]
  }>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!sessionId) { setLoaded(true); return }
    ;(async () => {
      try {
        const s = await db.trainingSessions.where('sessionId').equals(sessionId).first().catch(() => null)
          || await db.trainingSessions.get(sessionId).catch(() => null)
        if (!s) { setLoaded(true); return }
        const seList = await db.sessionExercises.where('sessionId').equals(s.sessionId).toArray().catch(() => [])
        const allSets = (await Promise.all(
          seList.map(se => db.setRecords.where('sessionExerciseId').equals((se as { sessionExerciseId: string }).sessionExerciseId).toArray().catch(() => [])),
        )).flat()
        const done = allSets.filter(r => (r as { status?: string }).status === 'COMPLETED')
        const plannedSets = Number((s as { plannedSets?: number }).plannedSets ?? allSets.length)
        const completedEx = seList.filter(e => ['COMPLETED', 'PARTIAL'].includes(String((e as { status?: string }).status))).length
        const totalReps = done.reduce((a, r) => a + Number((r as { actualReps?: number }).actualReps || 0), 0)
        const totalVol = done.reduce((a, r) => a + Number((r as { actualWeight?: number }).actualWeight || 0) * Number((r as { actualReps?: number }).actualReps || 0), 0)
        let durMin: number | null = null
        try {
          const start = (s as { startedAt?: string }).startedAt
          const end = (s as { endedAt?: string; completedAt?: string }).endedAt || (s as { completedAt?: string }).completedAt
          if (start && end) {
            durMin = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
          }
        } catch { /* noop */ }
        const survey = await db.postWorkoutSurveys.where('sessionId').equals(s.sessionId).toArray().then(a => a[0]).catch(() => null) as
          { sessionRating?: number; pain?: number } | null
        setStats({
          completedEx, plannedEx: seList.length,
          completedSets: done.length, plannedSets,
          exPct: seList.length ? Math.round((completedEx / seList.length) * 100) : 0,
          totalVol: Math.round(totalVol * 10) / 10, totalReps, durMin,
          sessionRating: survey?.sessionRating ?? null, pain: survey?.pain ?? null,
          highlights: [],
        })
      } catch { /* noop */ }
      setLoaded(true)
    })()
  }, [sessionId])

  if (!loaded) {
    return (
      <div className="bg-surface-container-low border border-outline-variant/50 rounded-xl p-6 ">
        <div className="font-body-md text-[15px] text-on-surface-variant">Calculando resultado…</div>
      </div>
    )
  }
  const r = stats
  if (!r) {
    return (
      <div className="bg-surface-container-low border border-outline-variant/50 rounded-xl p-6 ">
        <div className="font-body-md text-[15px] text-on-surface font-medium">{sessionStatus === 'COMPLETED' ? 'Entrenamiento completado — 100%' : 'Entrenamiento parcial'}</div>
        <div className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider">Sesión guardada en historial.</div>
      </div>
    )
  }
  const items = [
    { k: 'Ejercicios', v: `${r.completedEx}/${r.plannedEx}` },
    { k: 'Series', v: `${r.completedSets}/${r.plannedSets}` },
    { k: 'Cumplimiento', v: `${r.exPct}%` },
    { k: 'Duración', v: r.durMin !== null ? `${r.durMin} min` : '—' },
    { k: 'Volumen', v: `${r.totalVol} kg` },
    { k: 'Reps', v: `${r.totalReps}` },
  ]
  return (
    <div className="bg-surface-container-low border border-outline-variant/50 rounded-xl p-6  space-y-3 fade-in">
      <div>
        <div className="font-headline-lg text-lg font-semibold text-on-surface">Esto es lo que hiciste</div>
        <div className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider">{sessionStatus === 'COMPLETED' ? 'Sesión completada — 100%' : `Sesión parcial — ${r.exPct}%`}{r.sessionRating !== null ? ` · Valoración ${r.sessionRating}/5` : ''}{r.pain ? ' · Dolor reportado' : ''}</div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {items.map((s) => (
          <div key={s.k} className="bg-surface-container-high/30 border border-outline-variant/40 rounded-lg p-3 text-center">
            <div className="font-label-caps text-[10px] uppercase text-outline tracking-wider">{s.k}</div>
            <div className="font-headline-sm text-[20px] font-semibold text-on-surface">{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
