/**
 * CONSULTA DEL ATLAS MUSCULAR — única fuente de verdad temporal para el mapa
 * de Progreso.
 *
 * Centraliza lo que antes estaba repartido entre `Progreso.tsx`
 * (filtro por período), `weeklyGroupComparison()` (ventanas del ciclo) y
 * `buildAtlasMuscleData()` (baseline previo):
 *
 *   - resolución de la ventana analizada según la modalidad elegida;
 *   - ventana previa comparable (misma naturaleza, inmediatamente anterior);
 *   - filtrado de registros por rango de fechas;
 *   - agregados por región y totales del intervalo (sin doble conteo: los
 *     totales salen de las series únicas, no de la suma por región — una
 *     misma serie trabaja varios músculos a la vez);
 *   - métrica visual seleccionable (volumen / series / reps) con su
 *     normalización documentada.
 *
 * NO hay gráfica temporal en el atlas: el cuerpo anatómico es la única
 * representación gráfica. Por eso este módulo no expone ninguna serie diaria
 * ni agregación en barras.
 *
 * Todo sale de registros reales (series completadas). Sin datos → 0 y
 * `hasPrior = false`; nunca se inventan valores.
 */
import { dayKeyOffset, daysBetween, monthEndKey, monthStartKey, todayKey, weekStartKey } from '@/utils/dates'
import { cycleWeekIndexOf, cycleWeekRange, type CycleConfig } from '@/utils/cycle'
import type { RegionContribution } from './muscleContributions'

/**
 * `treinta` es un identificador OBSOLETO (30 días móviles) que se conserva
 * únicamente para normalizar valores guardados en el pasado: resolverlo
 * devuelve el mes calendario actual. Nunca se ofrece en la interfaz.
 */
export type AtlasMode = 'semana' | 'mes' | 'treinta' | 'rutina' | 'personalizada'

/** Modalidades ofrecidas al usuario (sin el alias obsoleto `treinta`). */
export type AtlasModeId = Exclude<AtlasMode, 'treinta'>

export type AtlasMetric = 'volumen' | 'series' | 'reps'

export const ATLAS_MODES: Array<{ id: AtlasModeId; label: string; testid: string; description: string }> = [
  { id: 'semana', label: 'Semana', testid: 'mode-semana', description: 'Lunes a domingo de la semana actual' },
  { id: 'mes', label: 'Mes actual', testid: 'mode-mes', description: 'Del 1.º al último día del mes en curso' },
  { id: 'rutina', label: 'Rutina', testid: 'mode-rutina', description: 'Semana del ciclo actual de la rutina' },
  { id: 'personalizada', label: 'Personalizado', testid: 'mode-personalizada', description: 'Rango personalizado' },
]

/** Valor inicial seguro: el mes calendario en curso. */
export const DEFAULT_ATLAS_MODE: AtlasModeId = 'mes'

/**
 * Normaliza cualquier valor guardado (incluido el antiguo `treinta`) a una
 * modalidad vigente. Nunca lanza: un valor desconocido cae en el mes actual.
 */
export function normalizeAtlasMode(raw: string | null | undefined): AtlasMode {
  if (raw === 'treinta') { return 'mes' }
  const known: AtlasMode[] = ['semana', 'mes', 'rutina', 'personalizada']
  return known.includes(raw as AtlasMode) ? (raw as AtlasMode) : 'mes'
}

export const ATLAS_METRICS: Array<{ id: AtlasMetric; label: string; testid: string; unit: string }> = [
  { id: 'volumen', label: 'Volumen', testid: 'metrica-volumen', unit: 'kg' },
  { id: 'series', label: 'Series', testid: 'metrica-series', unit: 'series' },
  { id: 'reps', label: 'Reps', testid: 'metrica-reps', unit: 'reps' },
]

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
 *
 * Reglas por modalidad (todas ancladas al CALENDARIO local de la app):
 * - `semana`: lunes → domingo de la semana en curso.
 * - `mes`: día 1 → último día del mes en curso.
 * - `rutina`: semana del ciclo real (derivada de `cycle.startDate`). Si no hay
 *   ciclo utilizable devuelve un error explícito; NUNCA cae en 30 días.
 * - `personalizada`: fechas exactas, ambos extremos incluidos.
 *
 * La ventana PREVIA es de la misma naturaleza (semana anterior, mes anterior,
 * semana de ciclo anterior) para que la comparación sea real.
 */
export function resolveAtlasWindow(
  mode: AtlasMode,
  opts: { customStart?: string; customEnd?: string; today?: string; cycle?: CycleConfig | null } = {},
): AtlasWindow | WindowError {
  const today = opts.today ?? todayKey()
  const resolved: AtlasMode = normalizeAtlasMode(mode)

  let start = today
  let end = today
  let prevStart = ''
  let prevEnd = ''
  let label = ''

  if (resolved === 'semana') {
    // Lunes a domingo. `weekStartKey` ancla en el lunes de la semana local.
    start = weekStartKey(today)
    end = dayKeyOffset(start, 6)
    prevEnd = dayKeyOffset(start, -1)
    prevStart = weekStartKey(prevEnd)
    label = `Semana del ${start.slice(8)}/${start.slice(5, 7)} al ${end.slice(8)}/${end.slice(5, 7)}`
  } else if (resolved === 'mes') {
    start = monthStartKey(today)
    end = monthEndKey(today)
    // Mes calendario anterior completo, no una ventana de igual largo cualquiera.
    prevEnd = dayKeyOffset(start, -1)
    prevStart = monthStartKey(prevEnd)
    label = `Mes de ${start.slice(5, 7)}/${start.slice(0, 4)}`
  } else if (resolved === 'rutina') {
    const cycle = opts.cycle
    if (!cycle || !cycle.startDate) {
      return { error: 'No se pudo determinar el ciclo: la rutina no tiene fecha de inicio. Elegí otra modalidad para ver el mapa.' }
    }
    const index = cycleWeekIndexOf(today, cycle)
    if (index < 1) {
      return { error: 'El ciclo de la rutina todavía no empieza: su fecha de inicio es posterior a hoy. Elegí otra modalidad para ver el mapa.' }
    }
    const cur = cycleWeekRange(index, cycle)
    start = cur.start
    end = cur.end
    if (index > 1) {
      const prev = cycleWeekRange(index - 1, cycle)
      prevStart = prev.start
      prevEnd = prev.end
    } else {
      // Primera semana del ciclo: no hay semana de ciclo anterior, se usa la
      // semana calendario inmediatamente previa (declarado, no inventado).
      prevEnd = dayKeyOffset(start, -1)
      prevStart = dayKeyOffset(prevEnd, -6)
    }
    label = `Semana ${index} del ciclo`
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
    // Intervalo inclusivo exacto: la previa tiene la MISMA cantidad de días,
    // terminada el día anterior al inicio (un día → un día).
    prevEnd = dayKeyOffset(start, -1)
    prevStart = dayKeyOffset(prevEnd, -daysBetween(start, end))
    label = `${start.slice(5)} – ${end.slice(5)}`
  }

  if (start > end) { start = end }
  const modeLabel = ATLAS_MODES.find((m) => m.id === resolved)?.description ?? ''
  return {
    start,
    end,
    prevStart,
    prevEnd,
    days: enumerateDays(start, end),
    label: resolved === 'personalizada' ? label : `${modeLabel}${label ? ` · ${label}` : ''}`,
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
