/**
 * CUMPLIMIENTO DE RUTINA — avance real respecto de lo planificado.
 *
 * Se calcula SOLO desde datos verificables:
 *   - planificado: `RoutineData.dayExercises` (series por ejercicio, ejercicios
 *     por día, días del ciclo). Cada porcentaje muestra numerador y denominador.
 *   - ejecutado: sesiones cerradas (COMPLETED/PARTIAL) cuya `routineId`
 *     coincide con la rutina, dentro de la ventana consultada, más sus
 *     SetRecord completados.
 *
 * Trazabilidad estricta por `routineId`: nunca por coincidencia de nombres.
 * Las series de sesiones sin rutina asociada (o de otra rutina) NO cuentan
 * para el cumplimiento y se informan aparte como `untrackedSets`.
 *
 * Series, ejercicios y días son porcentajes SEPARADOS: no se promedian entre
 * sí porque miden cosas distintas.
 */
import type { RoutineData } from '@/services/storage/routineStore'

export interface ComplianceSession {
  sessionId: string
  routineId?: string | null
  actualDay?: number | null
  calendarDate: string
  sessionStatus: string
  startedAt?: string
  completedAt?: string
  endedAt?: string
}

export interface ComplianceSet {
  sessionId: string
  exerciseId: string
}

export interface RoutineCompliance {
  routineId: string
  routineName: string
  /** Plan: suma de series de TODOS los días del programa (una pasada completa). */
  seriesPlanned: number
  /** Series completadas en sesiones de esta rutina dentro de la ventana. */
  seriesDone: number
  seriesPct: number | null
  exPlanned: number
  exDone: number
  exPct: number | null
  exPending: string[]
  daysPlanned: number
  daysDone: number
  daysPct: number | null
  /** Sesiones cerradas (COMPLETED/PARTIAL) de esta rutina en la ventana. */
  sessionsDone: number
  /** Días planificados sin cobertura en la ventana (nunca negativo). */
  sessionsPending: number
  /** Sesiones consideradas, para trazar el cálculo. */
  sessionIds: string[]
  /** Series de la ventana que NO pertenecen a esta rutina (otra rutina o sin trazabilidad). */
  untrackedSets: number
  /** Duración total registrada (segundos) o null si ninguna sesión la informa. */
  durationSec: number | null
  /** false cuando la rutina no tiene ejercicios planificados. */
  hasPlan: boolean
  windowStart: string
  windowEnd: string
}

const EXECUTED_STATES = new Set(['COMPLETED', 'PARTIAL'])

function pct(done: number, planned: number): number | null {
  if (!(planned > 0)) { return null }
  return Math.round((done / planned) * 100)
}

export function buildRoutineCompliance(input: {
  routine: RoutineData
  sessions: ComplianceSession[]
  sets: ComplianceSet[]
  windowStart: string
  windowEnd: string
}): RoutineCompliance {
  const { routine, sessions, sets, windowStart, windowEnd } = input

  // ── Planificado (una pasada completa del programa) ──
  const plannedByDay = Object.entries(routine.dayExercises ?? {})
  let seriesPlanned = 0
  const plannedEx = new Set<string>()
  const plannedDayNs = new Set<number>()
  for (const [dayStr, arr] of plannedByDay) {
    const dayN = Number(dayStr)
    if (!Number.isFinite(dayN) || !Array.isArray(arr) || arr.length === 0) { continue }
    plannedDayNs.add(dayN)
    for (const ex of arr) {
      if (!ex?.exId) { continue }
      plannedEx.add(ex.exId)
      const n = Array.isArray(ex.series) && ex.series.length > 0 ? ex.series.length : Number(ex.sets) || 0
      seriesPlanned += Math.max(0, n)
    }
  }
  const daysPlanned = (routine.cycle?.trainingDays ?? []).length || plannedDayNs.size

  // ── Ejecutado (solo sesiones cerradas de ESTA rutina en la ventana) ──
  const routineSessions = sessions.filter(
    (s) =>
      s.routineId === routine.id &&
      EXECUTED_STATES.has(s.sessionStatus) &&
      s.calendarDate >= windowStart &&
      s.calendarDate <= windowEnd,
  )
  const sessionIds = new Set(routineSessions.map((s) => s.sessionId))
  const routineSets = sets.filter((s) => s.sessionId && sessionIds.has(s.sessionId))
  const untrackedSets = sets.filter((s) => !s.sessionId || !sessionIds.has(s.sessionId)).length

  const doneEx = new Set<string>()
  for (const s of routineSets) {
    if (s.exerciseId) { doneEx.add(s.exerciseId) }
  }
  const doneDays = new Set<string>()
  for (const s of routineSessions) {
    doneDays.add(s.actualDay !== null && s.actualDay !== undefined ? `day:${s.actualDay}` : `date:${s.calendarDate}`)
  }
  let durationSec: number | null = null
  for (const s of routineSessions) {
    const from = s.startedAt ? Date.parse(s.startedAt) : NaN
    const toRaw = s.completedAt ?? s.endedAt
    const to = toRaw ? Date.parse(toRaw) : NaN
    if (Number.isFinite(from) && Number.isFinite(to) && to >= from) {
      durationSec = (durationSec ?? 0) + Math.round((to - from) / 1000)
    }
  }

  const daysDone = doneDays.size
  return {
    routineId: routine.id,
    routineName: routine.name,
    seriesPlanned,
    seriesDone: routineSets.length,
    seriesPct: pct(routineSets.length, seriesPlanned),
    exPlanned: plannedEx.size,
    exDone: [...doneEx].filter((id) => plannedEx.has(id)).length,
    exPct: pct([...doneEx].filter((id) => plannedEx.has(id)).length, plannedEx.size),
    exPending: [...plannedEx].filter((id) => !doneEx.has(id)),
    daysPlanned,
    daysDone,
    daysPct: pct(daysDone, daysPlanned),
    sessionsDone: routineSessions.length,
    sessionsPending: Math.max(0, daysPlanned - daysDone),
    sessionIds: [...sessionIds],
    untrackedSets,
    durationSec,
    hasPlan: seriesPlanned > 0 && plannedEx.size > 0,
    windowStart,
    windowEnd,
  }
}
