import { db } from '@/services/storage/db'
import { unifiedAllCompletedSets } from '@/services/history'
import { consensus1RM } from '@/services/training/prs'
import { toDateKey } from '@/utils/dates'

// Aprendizaje observacional (ET16): patrones a partir de datos reales.
// Niveles de afirmación estrictos — nunca causalidad:
// HECHO: lo registrado. PATRÓN: asociación observada. HIPÓTESIS: posible
// relación. RECOMENDACIÓN: acción propuesta (el usuario decide).
export type PatternKind = 'hecho' | 'patron' | 'hipotesis' | 'recomendacion'

export interface LearnedPattern {
  kind: PatternKind
  statement: string
  evidence: string[]
}

export interface ExerciseExposure {
  exerciseId: string
  date: string
  bestWeight: number
  bestReps: number
  volume: number
}

const MIN_EXPOSURES = 4

function exposuresByExercise(
  sets: Array<{ exerciseId: string; weight: number; reps: number; createdAt: string }>,
): Map<string, ExerciseExposure[]> {
  const byDay = new Map<string, ExerciseExposure>()
  for (const s of sets) {
    const date = toDateKey(s.createdAt)
    const key = `${s.exerciseId}|${date}`
    const cur = byDay.get(key) || { exerciseId: s.exerciseId, date, bestWeight: 0, bestReps: 0, volume: 0 }
    if (s.weight > cur.bestWeight) { cur.bestWeight = s.weight; cur.bestReps = s.reps }
    cur.volume += s.weight * s.reps
    byDay.set(key, cur)
  }
  const out = new Map<string, ExerciseExposure[]>()
  for (const e of byDay.values()) {
    const arr = out.get(e.exerciseId) || []
    arr.push(e)
    out.set(e.exerciseId, arr)
  }
  for (const arr of out.values()) { arr.sort((a, b) => (a.date < b.date ? -1 : 1)) }
  return out
}

function trendOf(values: number[]): 'sube' | 'baja' | 'estable' {
  if (values.length < 2) { return 'estable' }
  const half = Math.floor(values.length / 2)
  const prev = values.slice(0, half)
  const recent = values.slice(-Math.max(1, values.length - half))
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
  const r = avg(recent) / Math.max(0.001, avg(prev))
  if (r > 1.05) { return 'sube' }
  if (r < 0.95) { return 'baja' }
  return 'estable'
}

// Puro y testeable: aprende de exposiciones ya agregadas.
// `names` permite mostrar el nombre humano del ejercicio en los statements;
// sin mapa se conserva el id (comportamiento de siempre y de los tests).
export function learnFromExposures(
  byExercise: Map<string, ExerciseExposure[]>,
  sleepByDate: Map<string, number> = new Map(),
  names: Map<string, string> = new Map(),
): LearnedPattern[] {
  const out: LearnedPattern[] = []
  for (const [exerciseId, expos] of byExercise) {
    if (expos.length < MIN_EXPOSURES) { continue }
    const label = names.get(exerciseId) || exerciseId
    const eorm = expos.map(e => consensus1RM(e.bestWeight, e.bestReps))
    const t = trendOf(eorm)
    const first = expos[0].date
    const last = expos[expos.length - 1].date
    out.push({
      kind: 'hecho',
      statement: `${label}: ${expos.length} exposiciones entre ${first} y ${last}.`,
      evidence: [`Dato: ${expos.length} exposiciones`, `Dato: 1RM ${eorm[0]} → ${eorm[eorm.length - 1]}`],
    })
    if (t === 'sube') {
      const avgVol = Math.round(expos.reduce((a, e) => a + e.volume, 0) / expos.length)
      out.push({
        kind: 'patron',
        statement: `${label} muestra mejora sostenida con volumen medio de ${avgVol} kg por exposición.`,
        evidence: [`Cálculo: tendencia al alza en ${expos.length} exposiciones`],
      })
      const sleeps = expos.map(e => sleepByDate.get(e.date)).filter((v): v is number => typeof v === 'number')
      if (sleeps.length >= MIN_EXPOSURES) {
        const avgSleep = sleeps.reduce((a, b) => a + b, 0) / sleeps.length
        out.push({
          kind: 'hipotesis',
          statement: `${label} progresa con sueño medio de ${avgSleep.toFixed(1)}h; podría existir relación (no demostrada).`,
          evidence: [`Dato: ${sleeps.length} noches registradas`, 'Correlación no es causalidad'],
        })
      }
      out.push({
        kind: 'recomendacion',
        statement: `Mantener el esquema actual en ${label} y reevaluar en 2 semanas.`,
        evidence: [`Patrón: mejora sostenida en ${expos.length} exposiciones`],
      })
    } else if (t === 'baja') {
      out.push({
        kind: 'patron',
        statement: `${label} muestra regresión en las últimas exposiciones.`,
        evidence: [`Cálculo: tendencia a la baja en ${expos.length} exposiciones`],
      })
      out.push({
        kind: 'recomendacion',
        statement: `Revisar recuperación, volumen y técnica en ${label} antes de subir carga.`,
        evidence: ['Patrón: regresión observada'],
      })
    }
  }
  return out
}

// Resuelve el nombre visible de cada ejercicio: sesión (exerciseName) →
// catálogo/custom → definición de la rutina. Fallback: el id.
async function exerciseLabels(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) { return out }
  const wanted = new Set(ids)
  try {
    const rows = await db.sessionExercises.where('exerciseId').anyOf(ids).toArray().catch(() => [])
    for (const s of rows) { if (s.exerciseName && wanted.has(s.exerciseId)) { out.set(s.exerciseId, s.exerciseName) } }
  } catch { /* noop */ }
  try {
    const rows = await db.exercises.where('id').anyOf(ids).toArray().catch(() => [])
    for (const r of rows) { if (r.name && !out.has(r.id)) { out.set(r.id, r.name) } }
  } catch { /* noop */ }
  try {
    const rows = await db.customExercises.where('id').anyOf(ids).toArray().catch(() => [])
    for (const r of rows) { if (r.name && !out.has(r.id)) { out.set(r.id, r.name) } }
  } catch { /* noop */ }
  try {
    const routines = await db.routineStore.toArray().catch(() => [])
    for (const r of routines) {
      const dayEx = (r as { dayExercises?: Record<string, Array<{ exId: string; name?: string }>> }).dayExercises
      if (!dayEx) { continue }
      for (const arr of Object.values(dayEx)) {
        for (const it of arr || []) {
          if (it?.exId && it.name && wanted.has(it.exId) && !out.has(it.exId)) { out.set(it.exId, it.name) }
        }
      }
    }
  } catch { /* noop */ }
  return out
}

// Ensamblador Dexie: historial unificado + sueño. Solo lectura.
export async function learnPatterns(): Promise<LearnedPattern[]> {
  const sets = await unifiedAllCompletedSets().catch(() => [])
  if (sets.length === 0) { return [] }
  const byExercise = exposuresByExercise(sets.map(s => ({
    exerciseId: s.exerciseId, weight: s.weight, reps: s.reps, createdAt: s.createdAt,
  })))
  let sleepByDate = new Map<string, number>()
  try {
    const checks = await db.recoveryChecks.toArray().catch(() => [])
    sleepByDate = new Map(
      checks
        .filter(c => typeof c.sleepHours === 'number')
        .map(c => [String(c.localDate), Number(c.sleepHours)]),
    )
  } catch { /* noop */ }
  const names = await exerciseLabels([...byExercise.keys()])
  return learnFromExposures(byExercise, sleepByDate, names)
}
