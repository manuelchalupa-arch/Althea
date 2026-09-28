import type { UserProfile } from '@/types'
import type { TrainingMethodId } from '@/services/ai/trainingMethods'
import { getMethod } from '@/services/ai/trainingMethodsDB'
import { selectMethods } from '@/services/ai/methodSelector'
import { todayKey, parseLocalDateKey, weekdayOfKey, weekStartKey, daysBetween, dayKeyOffset } from '@/utils/dates'

export type LoadState = 'NORMAL' | 'SOBRECARGA' | 'CARGA_REDUCIDA' | 'CARGA_CERO'

export type CycleConfig = {
  startDate: string // YYYY-MM-DD
  trainingDays: { n: number; name: string }[] // N°1..N
  weekMap: (number | null)[] // 0=Dom..6=Sab -> n | null (descanso)
  weekLoads?: LoadState[] // 0=Dom..6=Sab — estado de carga por día, vinculado a planificación real (NO inventado)
  methodId?: TrainingMethodId // método de entrenamiento seleccionado
  methodJustification?: string // por qué se eligió este método
}

export const DEFAULT_CYCLE: CycleConfig = {
  startDate: todayKey(),
  trainingDays: [
    { n: 1, name: 'Pecho + tríceps' },
    { n: 2, name: 'Espalda + bíceps' },
    { n: 3, name: 'Piernas' },
    { n: 4, name: 'Hombros + abdomen' },
  ],
  weekMap: [null, 1, 2, null, 3, 4, null], // Dom, Lun..Sab
  weekLoads: ['CARGA_CERO', 'NORMAL', 'SOBRECARGA', 'CARGA_CERO', 'CARGA_REDUCIDA', 'NORMAL', 'CARGA_CERO'],
}

/** Generar CycleConfig desde un método de entrenamiento */
export function buildCycleFromMethod(methodId: TrainingMethodId, availableDays?: number[], startDate?: string): CycleConfig {
  const method = getMethod(methodId)
  if (!method) {return DEFAULT_CYCLE}

  const days = availableDays || getDefaultDays(method.structure.typicalFrequency[0] || 3)
  const splitType = method.structure.splitType

  // Generar nombres de días según el split
  const dayNames = generateDayNames(splitType, methodId, days.length)

  // Construir trainingDays
  const trainingDays = dayNames.map((name, i) => ({ n: i + 1, name }))

  // Construir weekMap
  const weekMap: (number | null)[] = [null, null, null, null, null, null, null] // Dom-Sáb
  days.forEach((dow, i) => { weekMap[dow] = i + 1 })

  return {
    startDate: startDate || todayKey(),
    trainingDays,
    weekMap,
    methodId,
    methodJustification: method.descriptionEs,
  }
}

/** Generar CycleConfig desde una recomendación de método (con mixto) */
export function buildCycleFromRecommendation(rec: { primary: TrainingMethodId; mixed?: { structure: { daysPerWeek: number } }; justification: string }, availableDays?: number[], startDate?: string): CycleConfig {
  // Usar método mixto si existe, sino el primario
  const methodId = rec.primary
  const method = getMethod(methodId)
  if (!method) {return DEFAULT_CYCLE}

  const daysCount = rec.mixed?.structure?.daysPerWeek || method.structure.typicalFrequency[0] || 3
  const days = availableDays || getDefaultDays(daysCount)
  const splitType = method.structure.splitType

  const dayNames = generateDayNames(splitType, methodId, days.length)
  const trainingDays = dayNames.map((name, i) => ({ n: i + 1, name }))

  const weekMap: (number | null)[] = [null, null, null, null, null, null, null]
  days.forEach((dow, i) => { weekMap[dow] = i + 1 })

  return {
    startDate: startDate || todayKey(),
    trainingDays,
    weekMap,
    methodId,
    methodJustification: rec.justification,
  }
}

/** Generar CycleConfig completo desde perfil de usuario */
export function buildCycleFromProfile(profile: UserProfile, availableDays?: number[], startDate?: string): CycleConfig {
  const rec = selectMethods(profile)
  return buildCycleFromRecommendation(rec, availableDays, startDate)
}

function getDefaultDays(count: number): number[] {
  // Lunes=1, Martes=2, Miércoles=3, Jueves=4, Viernes=5, Sábado=6
  const allDays = [1, 2, 3, 4, 5, 6]
  // Distribuir equitativamente
  if (count >= 6) {return allDays}
  if (count <= 0) {return [1, 3, 5]}
  const step = Math.floor(6 / count)
  const days: number[] = []
  for (let i = 0; i < count; i++) {
    days.push(allDays[Math.min(i * step, 5)])
  }
  return [...new Set(days)].sort((a, b) => a - b)
}

function generateDayNames(splitType: string, methodId: TrainingMethodId, daysCount: number): string[] {
  const method = getMethod(methodId)
  const patterns = method?.structure.primaryMovementPatterns || []

  switch (splitType) {
    case 'full_body':
      return Array.from({ length: daysCount }, (_, i) => `Cuerpo completo ${i + 1}`)
    case 'upper_lower':
      const upper: string[] = []
      const lower: string[] = []
      for (let i = 0; i < daysCount; i++) {
        if (i % 2 === 0) {upper.push(`Tren superior ${Math.floor(i / 2) + 1}`)}
        else {lower.push(`Tren inferior ${Math.floor(i / 2) + 1}`)}
      }
      return [...upper, ...lower]
    case 'push_pull_legs':
      const ppl = ['Empuje', 'Tirón', 'Piernas']
      return Array.from({ length: daysCount }, (_, i) => ppl[i % ppl.length] + (daysCount > 3 ? ` ${Math.floor(i / 3) + 1}` : ''))
    case 'body_part':
      const parts = ['Pecho + tríceps', 'Espalda + bíceps', 'Piernas', 'Hombros + abdomen', 'Brazos', 'Core']
      return Array.from({ length: daysCount }, (_, i) => parts[i % parts.length])
    case 'custom':
      return Array.from({ length: daysCount }, (_, i) => `Día ${i + 1}`)
    default:
      return Array.from({ length: daysCount }, (_, i) => `Entrenamiento ${i + 1}`)
  }
}

export function getCycleFromProfile(p: UserProfile | null): CycleConfig {
  if (!p || !p.cycle) {return DEFAULT_CYCLE}
  return { ...p.cycle, methodId: p.cycle.methodId as TrainingMethodId | undefined }
}

export const LOAD_STATE_LABEL: Record<LoadState, string> = {
  NORMAL: 'Normal',
  SOBRECARGA: 'Sobrecarga',
  CARGA_REDUCIDA: 'Carga reducida',
  CARGA_CERO: 'Carga cero',
}
export const LOAD_STATE_COLOR: Record<LoadState, string> = {
  NORMAL: 'bg-primary/20 border-primary/40 text-primary',
  SOBRECARGA: 'bg-error/15 border-error/40 text-error',
  CARGA_REDUCIDA: 'bg-tertiary/15 border-tertiary/45 text-tertiary',
  CARGA_CERO: 'bg-surface-container border-outline-variant/40 text-on-surface-variant',
}

export function getWeekLoads(cycle: CycleConfig): LoadState[] {
  if (cycle.weekLoads && cycle.weekLoads.length === 7) {return cycle.weekLoads}
  // derivación coherente: si no hay weekLoads, usar CARGA_CERO para descanso y NORMAL para entreno
  return cycle.weekMap.map(n => (n === null || n === undefined ? 'CARGA_CERO' : 'NORMAL'))
}

export function setWeekLoad(cycle: CycleConfig, dow: number, load: LoadState): CycleConfig {
  const loads = getWeekLoads(cycle).slice() as LoadState[]
  loads[dow] = load
  return { ...cycle, weekLoads: loads }
}

export function getLoadForDate(dateStr: string, cycle: CycleConfig): LoadState {
  const dow = weekdayOfKey(dateStr)
  return getWeekLoads(cycle)[dow] ?? 'NORMAL'
}

export function getTrainingDayForDate(dateStr: string, cycle: CycleConfig): { n: number | null; name: string | null; isRest: boolean; load: LoadState } {
  const dow = weekdayOfKey(dateStr)
  const n = cycle.weekMap[dow] ?? null
  const load = getLoadForDate(dateStr, cycle)
  if (n === null) {return { n: null, name: null, isRest: true, load }}
  const td = cycle.trainingDays.find(x => x.n === n)
  return { n, name: td?.name ?? `Día N°${n}`, isRest: false, load }
}

// ─── Semanas del ciclo (comparación de carga muscular) ───
// Una "semana de ciclo" es una ventana calendario de lunes a domingo contiguas
// desde startDate. Todo se deriva de startDate; no se inventan semanas ni
// baselines.
export type CycleWeekInfo = {
  index: number // 1..N
  start: string // YYYY-MM-DD (lunes)
  end: string // YYYY-MM-DD (domingo)
  isComplete: boolean // la semana terminó por completo (hoy > end)
  isCurrent: boolean // contiene a `dateStr`
}

function cycleWeekStart(cycle: CycleConfig, dateStr: string): string {
  const anchor = weekStartKey(cycle.startDate || dateStr)
  const d = weekStartKey(dateStr)
  if (d < anchor) { return d } // semanas anteriores al inicio: índice ≤ 0
  const weeks = Math.round(daysBetween(anchor, d) / 7)
  return dayKeyOffset(anchor, weeks * 7)
}

/** Índice de semana de ciclo (1..N) para una fecha. Fechas previas al inicio → 0. */
export function cycleWeekIndexOf(dateStr: string, cycle: CycleConfig): number {
  if (!dateStr) { return 0 }
  if (dateStr < cycle.startDate) { return 0 }
  return Math.round(daysBetween(cycleWeekStart(cycle, cycle.startDate), weekStartKey(dateStr)) / 7) + 1
}

/** Rango [lunes, domingo] de una semana de ciclo. */
export function cycleWeekRange(index: number, cycle: CycleConfig): { start: string; end: string } {
  const start = dayKeyOffset(cycleWeekStart(cycle, cycle.startDate), (index - 1) * 7)
  return { start, end: dayKeyOffset(start, 6) }
}

/** Info de la semana de ciclo que contiene `dateStr`. */
export function cycleWeekInfoOf(dateStr: string, cycle: CycleConfig, today: string = todayKey()): CycleWeekInfo {
  const index = Math.max(1, cycleWeekIndexOf(dateStr, cycle))
  const { start, end } = cycleWeekRange(index, cycle)
  return { index, start, end, isComplete: end < today, isCurrent: start <= today && today <= end }
}

/**
 * Semanas de ciclo YA COMPLETAS hasta `today`, ordenadas ascendente.
 * La primera de esta lista es la línea BASE de la comparación.
 * No devuelve la semana en curso ni semanas futuras.
 */
export function completedCycleWeeks(cycle: CycleConfig, today: string = todayKey()): CycleWeekInfo[] {
  const out: CycleWeekInfo[] = []
  for (let i = 1; i <= 520; i++) {
    const { start, end } = cycleWeekRange(i, cycle)
    if (start > today) { break }
    if (end < today) { out.push({ index: i, start, end, isComplete: true, isCurrent: false }) }
    else { break }
  }
  return out
}

export function formatAgendaDate(dateStr: string) {
  const d = parseLocalDateKey(dateStr)
  const dayName = d.toLocaleDateString('es', { weekday: 'long' }).toUpperCase()
  const dayNum = d.getDate()
  const month = d.toLocaleDateString('es', { month: 'long' }).toUpperCase()
  return { dayName, dayNum, month, dow: d.getDay() }
}
