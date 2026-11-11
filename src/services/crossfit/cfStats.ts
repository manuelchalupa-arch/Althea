import { addDaysToKey } from '@/utils/dates'
import type { CfMark, CfModality, CfResult, CfWod } from './types'

/**
 * Helpers puros de estadísticas del módulo CrossFit. Sin Dexie ni UI:
 * reciben colecciones ya cargadas (listResults/listMarks vienen ordenadas
 * desc por date) y devuelven valores listos para pintar.
 */

/** Suma de `timeSec` de todos los resultados (los que no tienen, cuentan 0). */
export function totalTimeSec(results: CfResult[]): number {
  return results.reduce((acc, r) => acc + (r.timeSec ?? 0), 0)
}

/** Suma de rondas (los resultados sin rounds cuentan 0). */
export function totalRounds(results: CfResult[]): number {
  return results.reduce((acc, r) => acc + (r.rounds ?? 0), 0)
}

/** Suma de reps (los resultados sin reps cuentan 0). */
export function totalReps(results: CfResult[]): number {
  return results.reduce((acc, r) => acc + (r.reps ?? 0), 0)
}

/** Promedio de RPE redondeado a 1 decimal; null si ningún resultado tiene RPE. */
export function avgRpe(results: CfResult[]): number | null {
  let sum = 0
  let n = 0
  for (const r of results) {
    if (typeof r.rpe === 'number' && Number.isFinite(r.rpe)) {
      sum += r.rpe
      n += 1
    }
  }
  if (n === 0) { return null }
  return Math.round((sum / n) * 10) / 10
}

/** Resultados con `date` dentro de [from, to] inclusive (comparación de strings YYYY-MM-DD). */
export function resultsInRange(results: CfResult[], from: string, to: string): CfResult[] {
  return results.filter((r) => r.date >= from && r.date <= to)
}

/**
 * Conteo de modalidades sobre los WODs realmente ejecutados: por cada
 * resultado se resuelve su wodId y se suma cada modalidad del WOD (mismo
 * criterio que CrossfitInicio). Resultados sin wod resoluble se ignoran.
 */
export function modalityDistribution(wods: CfWod[], results: CfResult[]): Record<CfModality, number> {
  const wodById = new Map(wods.map((w) => [w.id, w]))
  const count: Record<CfModality, number> = { G: 0, M: 0, W: 0 }
  for (const r of results) {
    const wod = r.wodId ? wodById.get(r.wodId) : undefined
    if (!wod) { continue }
    for (const m of wod.modalities) { count[m] += 1 }
  }
  return count
}

/** Movimientos más presentes en los WODs ejecutados, desc por frecuencia (empate alfabético), limitado a `limit`. */
export function topMovements(wods: CfWod[], results: CfResult[], limit: number): { name: string; count: number }[] {
  const wodById = new Map(wods.map((w) => [w.id, w]))
  const counts = new Map<string, number>()
  for (const r of results) {
    const wod = r.wodId ? wodById.get(r.wodId) : undefined
    if (!wod) { continue }
    for (const mv of wod.movements) { counts.set(mv.name, (counts.get(mv.name) ?? 0) + 1) }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
}

/** Mejor `valueKg` por movimiento; a igual peso gana la fecha más reciente. */
export function bestMarkByMovement(marks: CfMark[]): Map<string, CfMark> {
  const best = new Map<string, CfMark>()
  for (const mark of marks) {
    const prev = best.get(mark.movement)
    if (!prev || mark.valueKg > prev.valueKg || (mark.valueKg === prev.valueKg && mark.date > prev.date)) {
      best.set(mark.movement, mark)
    }
  }
  return best
}

/**
 * Mejor resultado por benchmarkId: menor `timeSec` manda si ambos tienen
 * tiempo (un tiempo le gana a un resultado sin tiempo); sin tiempo se
 * compara rondas y después reps (mayor gana). A igual marca gana la fecha
 * más reciente.
 */
export function prByBenchmark(results: CfResult[]): Map<string, CfResult> {
  const prs = new Map<string, CfResult>()
  for (const r of results) {
    if (!r.benchmarkId) { continue }
    const prev = prs.get(r.benchmarkId)
    if (!prev || isBetterBenchmark(r, prev)) { prs.set(r.benchmarkId, r) }
  }
  return prs
}

function isBetterBenchmark(a: CfResult, b: CfResult): boolean {
  if (typeof a.timeSec === 'number' && typeof b.timeSec === 'number') {
    if (a.timeSec !== b.timeSec) { return a.timeSec < b.timeSec }
  } else if (typeof a.timeSec === 'number') {
    return true
  } else if (typeof b.timeSec === 'number') {
    return false
  }
  const ra = a.rounds ?? 0
  const rb = b.rounds ?? 0
  if (ra !== rb) { return ra > rb }
  const xa = a.reps ?? 0
  const xb = b.reps ?? 0
  if (xa !== xb) { return xa > xb }
  return a.date > b.date
}

/** Volumen de la semana que arranca en `weekStart` (lunes, YYYY-MM-DD), de lunes a domingo inclusive. */
export function weeklyVolume(
  results: CfResult[],
  weekStart: string,
): { daysWithResult: number; totalTimeSec: number; totalRounds: number } {
  const weekEnd = addDaysToKey(weekStart, 6)
  const days = new Set<string>()
  let time = 0
  let rounds = 0
  for (const r of results) {
    if (r.date < weekStart || r.date > weekEnd) { continue }
    days.add(r.date)
    time += r.timeSec ?? 0
    rounds += r.rounds ?? 0
  }
  return { daysWithResult: days.size, totalTimeSec: time, totalRounds: rounds }
}
