/**
 * CONSULTA DEL ATLAS MUSCULAR — única fuente de verdad temporal para el mapa
 * de Progreso.
 *
 * Centraliza lo que antes estaba repartido entre `Progreso.tsx`
 * (filtro por período), `weeklyGroupComparison()` (ventanas del ciclo) y
 * `buildAtlasMuscleData()` (baseline previo):
 *
 *   - resolución de la ventana analizada según la modalidad elegida;
 *   - ventana previa comparable (misma duración, inmediatamente anterior);
 *   - filtrado de registros por rango de fechas;
 *   - agregados por región y totales del intervalo (sin doble conteo: los
 *     totales salen de las series únicas, no de la suma por región — una
 *     misma serie trabaja varios músculos a la vez);
 *   - serie diaria para la gráfica temporal (con días cero explícitos);
 *   - métrica visual seleccionable (volumen / series / reps) con su
 *     normalización documentada.
 *
 * Todo sale de registros reales (series completadas). Sin datos → 0 y
 * `hasPrior = false`; nunca se inventan valores.
 */
import { dayKeyOffset, daysBetween, todayKey } from '@/utils/dates'
import type { RegionContribution } from './muscleContributions'

export type AtlasMode = 'semana' | 'treinta' | 'rutina' | 'personalizada'

export type AtlasMetric = 'volumen' | 'series' | 'reps'

export const ATLAS_MODES: Array<{ id: AtlasMode; label: string; testid: string; description: string }> = [
  { id: 'semana', label: 'Semana', testid: 'mode-semana', description: 'Últimos 7 días' },
  { id: 'treinta', label: '30 días', testid: 'mode-treinta', description: 'Últimos 30 días' },
  { id: 'rutina', label: 'Rutina', testid: 'mode-rutina', description: 'Rutina completa · últimos 30 días' },
  { id: 'personalizada', label: 'Personalizado', testid: 'mode-personalizada', description: 'Rango personalizado' },
]

export const ATLAS_METRICS: Array<{ id: AtlasMetric; label: string; testid: string; unit: string }> = [
  { id: 'volumen', label: 'Volumen', testid: 'metrica-volumen', unit: 'kg' },
  { id: 'series', label: 'Series', testid: 'metrica-series', unit: 'series' },
  { id: 'reps', label: 'Reps', testid: 'metrica-reps', unit: 'reps' },
]

/** Ventana fija de la modalidad Rutina: los últimos 30 días calendario. */
export const ROUTINE_WINDOW_DAYS = 30

export interface AtlasWindow {
  /** Primer día incluido (YYYY-MM-DD). */
  start: string
  /** Último día incluido (YYYY-MM-DD). */
  end: string
  /** Ventana previa de igual duración, inmediatamente anterior. */
  prevStart: string
  /** Fin de la ventana previa (día anterior a `start`). */
  prevEnd: string
  /** Días de la ventana, ordenados. */
  days: string[]
  /** Etiqueta legible ("Últimos 7 días", "12/09 – 11/10", ...). */
  label: string
}

export interface WindowError {
  error: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function enumerateDays(start: string, end: string): string[] {
  const out: string[] = []
  let d = start
  let guard = 0
  while (d <= end && guard < 400) {
    out.push(d)
    d = dayKeyOffset(d, 1)
    guard++
  }
  return out
}

/**
 * Resuelve la ventana analizada para una modalidad. `today` es inyectable
 * para poder testear sin depender del reloj.
 */
export function resolveAtlasWindow(
  mode: AtlasMode,
  opts: { customStart?: string; customEnd?: string; today?: string } = {},
): AtlasWindow | WindowError {
  const today = opts.today ?? todayKey()
  let start = today
  let end = today
  if (mode === 'semana') {
    start = dayKeyOffset(today, -6)
  } else if (mode === 'treinta' || mode === 'rutina') {
    start = dayKeyOffset(today, -(ROUTINE_WINDOW_DAYS - 1))
  } else {
    const s = (opts.customStart || '').trim()
    const e = (opts.customEnd || '').trim() || today
    if (!s || !DATE_RE.test(s) || !DATE_RE.test(e)) {
      return { error: 'Elegí una fecha inicial y una final válidas (AAAA-MM-DD).' }
    }
    if (s > e) {
      return { error: 'La fecha inicial no puede ser posterior a la final.' }
    }
    if (e > today) {
      return { error: 'La fecha final no puede ser posterior a hoy.' }
    }
    start = s
    end = e
  }
  if (start > end) { start = end }
  const lengthDays = Math.max(1, daysBetween(start, end) + 1)
  const prevEnd = dayKeyOffset(start, -1)
  const prevStart = dayKeyOffset(prevEnd, -(lengthDays - 1))
  const modeLabel = ATLAS_MODES.find((m) => m.id === mode)?.description ?? ''
  return {
    start,
    end,
    prevStart,
    prevEnd,
    days: enumerateDays(start, end),
    label: mode === 'personalizada' ? `${start.slice(5)} – ${end.slice(5)}` : modeLabel,
  }
}

/** Fila mínima de trabajo para agregar: UNA serie completada. */
export interface AtlasSetRow {
  date: string
  exerciseId: string
  volume: number
  reps: number
  sessionId?: string
}

export function filterByRange<T>(rows: T[], getDate: (r: T) => string, start: string, end: string): T[] {
  return rows.filter((r) => {
    const d = getDate(r)
    return !!d && d >= start && d <= end
  })
}

/** ¿Existe al menos un registro en (o antes de) la ventana previa? Sin historial previo no hay comparación. */
export function hasPriorHistory(datesAsc: string[], prevStart: string): boolean {
  return datesAsc.some((d) => !!d && d >= prevStart)
}

export interface WindowTotals {
  sets: number
  reps: number
  volume: number
  exercises: number
  days: number
  exerciseNames: string[]
}

export function summarizeRows(
  rows: AtlasSetRow[],
  nameOf: (exerciseId: string) => string | null,
): WindowTotals {
  let reps = 0
  let volume = 0
  const days = new Set<string>()
  const exIds = new Set<string>()
  const names = new Map<string, number>()
  for (const r of rows) {
    reps += Number(r.reps) > 0 ? Number(r.reps) : 0
    volume += Number(r.volume) > 0 ? Number(r.volume) : 0
    if (r.date) { days.add(r.date) }
    if (r.exerciseId) {
      exIds.add(r.exerciseId)
      const label = nameOf(r.exerciseId)
      if (label) { names.set(label, (names.get(label) ?? 0) + 1) }
    }
  }
  return {
    sets: rows.length,
    reps,
    volume: Math.round(volume * 10) / 10,
    exercises: exIds.size,
    days: days.size,
    exerciseNames: [...names.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n),
  }
}

export interface DayPoint {
  date: string
  label: string
  volume: number
  sets: number
  reps: number
  hasWork: boolean
}

/** Serie diaria con días cero explícitos (sin inventar sesiones). */
export function dailySeries(rows: AtlasSetRow[], days: string[]): DayPoint[] {
  const byDay = new Map<string, { volume: number; sets: number; reps: number }>()
  for (const r of rows) {
    if (!r.date) { continue }
    const cur = byDay.get(r.date) ?? { volume: 0, sets: 0, reps: 0 }
    cur.volume += Number(r.volume) > 0 ? Number(r.volume) : 0
    cur.sets += 1
    cur.reps += Number(r.reps) > 0 ? Number(r.reps) : 0
    byDay.set(r.date, cur)
  }
  return days.map((d) => {
    const v = byDay.get(d)
    return {
      date: d,
      label: d.slice(5),
      volume: Math.round((v?.volume ?? 0) * 10) / 10,
      sets: v?.sets ?? 0,
      reps: v?.reps ?? 0,
      hasWork: (v?.sets ?? 0) > 0,
    }
  })
}

export interface BinnedPoint {
  key: string
  label: string
  from: string
  to: string
  volume: number
  sets: number
  reps: number
  hasWork: boolean
}

/**
 * Agrupa la serie diaria en bloques semanales cuando hay demasiados días
 * para una gráfica legible (> 31). Con ≤ 31 días se mantiene el día a día.
 */
export function binSeries(points: DayPoint[], maxBars = 31): BinnedPoint[] {
  if (points.length <= maxBars) {
    return points.map((p) => ({
      key: p.date, label: p.label, from: p.date, to: p.date,
      volume: p.volume, sets: p.sets, reps: p.reps, hasWork: p.hasWork,
    }))
  }
  const out: BinnedPoint[] = []
  for (let i = 0; i < points.length; i += 7) {
    const chunk = points.slice(i, i + 7)
    out.push({
      key: chunk[0].date,
      label: `${chunk[0].label} – ${chunk[chunk.length - 1].label}`,
      from: chunk[0].date,
      to: chunk[chunk.length - 1].date,
      volume: Math.round(chunk.reduce((a, p) => a + p.volume, 0) * 10) / 10,
      sets: chunk.reduce((a, p) => a + p.sets, 0),
      reps: chunk.reduce((a, p) => a + p.reps, 0),
      hasWork: chunk.some((p) => p.hasWork),
    })
  }
  return out
}

/** Valor de un punto agregado en la métrica elegida (para la gráfica). */
export function chartValueOf(p: Pick<BinnedPoint, 'volume' | 'sets' | 'reps'>, metric: AtlasMetric): number {
  if (metric === 'series') { return p.sets }
  if (metric === 'reps') { return p.reps }
  return p.volume
}

export function metricValueOf(stat: Pick<RegionContribution, 'volume' | 'sets' | 'reps'>, metric: AtlasMetric): number {
  if (metric === 'series') { return stat.sets }
  if (metric === 'reps') { return stat.reps }
  return stat.volume
}

export function metricUnitOf(metric: AtlasMetric): string {
  const found = ATLAS_METRICS.find((m) => m.id === metric)
  return found ? found.unit : 'kg'
}

/**
 * Intensidad 0–100 de una región frente a la más trabajada de la consulta.
 * Es RELATIVA a esta ventana y a esta métrica: no equivale a comparar
 * períodos distintos entre sí. Sin trabajo → 0.
 */
export function intensityOf(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) { return 0 }
  return Math.max(1, Math.min(100, Math.round((value / max) * 100)))
}
