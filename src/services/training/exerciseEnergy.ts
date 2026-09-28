/**
 * Gasto calórico del ejercicio — ÚNICA fuente de verdad de Althea.
 *
 * Lo usan Inicio (tarjeta del día y semana), el historial (detalle de sesión
 * en Calendario) y los informes PDF (reportService). No existe otro cálculo.
 *
 * Cadena real: sesión (startedAt → fin − pausas) × peso corporal registrado
 * (bodyMeasurements) → fórmula MET (Compendium 2024, categoría resistance).
 *
 *   kcal/min = MET × 3,5 × peso(kg) ÷ 200
 *
 * Todo dato faltante se devuelve como null con motivo explícito: nunca se
 * inventan calorías ni se rellena con ceros.
 */
import { calculateCalorieExpenditure } from '@/services/ai/metExpenditure'
import { db } from '@/services/storage/db'

/** Actividad y MET usados para toda sesión de fuerza (Compendium 2024). */
export const EXERCISE_ACTIVITY = 'Entrenamiento de fuerza general'
export const EXERCISE_MET = 6.0

export type EnergyInsufficient = 'SIN_DURACION' | 'SIN_PESO' | 'SESION_NO_REAL'

export interface EnergySession {
  sessionId: string
  calendarDate: string
  sessionStatus?: string | null
  startedAt?: string | null
  completedAt?: string | null
  endedAt?: string | null
  completingAt?: string | null
  pausedAt?: string | null
  resumedAt?: string | null
  totalPausedDurationSec?: number
  isDemo?: boolean
}

export interface SessionEnergy {
  sessionId: string
  calendarDate: string
  durationMinutes: number
  kcal: number
  netKcal: number
  met: number
  formula: string
}

export interface WeightRow { localDate?: string; weightKg?: number; isDemo?: boolean }

export interface ExpenditureResult {
  /** Rango evaluado (para dejar trazabilidad en informes). */
  from: string
  to: string
  /** Total del rango; null cuando no hay datos suficientes. */
  totalKcal: number | null
  totalMinutes: number | null
  sesiones: SessionEnergy[]
  /** kcal y minutos por fecha con sesión estimable (sin huecos inventados). */
  porFecha: Array<{ fecha: string; kcal: number; minutes: number }>
  /** Motivo del total null: no hay sesiones en el rango, o faltan datos. */
  motivo: 'SIN_SESIONES' | EnergyInsufficient | null
}

const INACTIVE_STATUS = new Set(['PLANNED', 'READY', 'CANCELLED', 'ABANDONED'])
const ONGOING_STATUS = new Set(['IN_PROGRESS', 'PAUSED', 'COMPLETING'])

function ms(v?: string | null): number | null {
  if (!v) { return null }
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}

/**
 * Duración real de la sesión en minutos: inicio → fin (completado/cancelado
 * parcial o, si sigue en curso, ahora) menos las pausas. Null si no hay
 * información suficiente para estimarla.
 */
export function sessionDurationMinutes(s: EnergySession, nowMs: number = Date.now()): number | null {
  const start = ms(s.startedAt)
  if (start === null) { return null }
  const status = String(s.sessionStatus ?? '')
  let end = ms(s.completedAt) ?? ms(s.endedAt) ?? ms(s.completingAt)
  if (end === null) {
    if (!ONGOING_STATUS.has(status)) { return null }
    end = nowMs
  }
  if (end <= start) { return null }

  const recorded = Math.max(0, Number(s.totalPausedDurationSec ?? 0))
  const pausedStart = ms(s.pausedAt)
  const resumed = ms(s.resumedAt)
  const pauseOpen = pausedStart !== null && (resumed === null || resumed < pausedStart)
  const current = pauseOpen ? Math.max(0, (Math.min(end, nowMs) - pausedStart) / 1000) : 0
  const pausedSec = Math.max(recorded, current)

  const minutes = (end - start) / 60000 - pausedSec / 60
  return minutes > 0 ? Math.round(minutes * 10) / 10 : null
}

/** Motivo por el que una sesión no puede aportar gasto calórico. */
export function energyInsufficientReason(s: EnergySession, weightKg?: number | null, nowMs: number = Date.now()): EnergyInsufficient | null {
  if (s.isDemo) { return 'SESION_NO_REAL' }
  if (INACTIVE_STATUS.has(String(s.sessionStatus ?? ''))) { return 'SESION_NO_REAL' }
  if (sessionDurationMinutes(s, nowMs) === null) { return 'SIN_DURACION' }
  if (!(Number(weightKg) > 0)) { return 'SIN_PESO' }
  return null
}

/** Gasto de UNA sesión; null si faltan datos (ver `energyInsufficientReason`). */
export function sessionEnergy(s: EnergySession, weightKg?: number | null, nowMs: number = Date.now()): SessionEnergy | null {
  if (energyInsufficientReason(s, weightKg, nowMs)) { return null }
  const durationMinutes = sessionDurationMinutes(s, nowMs) as number
  const r = calculateCalorieExpenditure({
    activity: EXERCISE_ACTIVITY,
    met: EXERCISE_MET,
    weightKg: Number(weightKg),
    durationMinutes,
  })
  return {
    sessionId: s.sessionId,
    calendarDate: s.calendarDate,
    durationMinutes,
    kcal: r.grossKcal,
    netKcal: r.netKcal,
    met: r.met,
    formula: r.formula,
  }
}

/**
 * Estimación mínima usada por el Coach (misma fórmula, misma actividad y MET).
 * Siempre debe derivar de esta función: no duplicar la cuenta en la UI.
 */
export function estimateStrengthSession(opts: { weightKg: number; durationMinutes: number }): {
  grossKcal: number; netKcal: number; formula: string; met: number
} {
  return calculateCalorieExpenditure({
    activity: EXERCISE_ACTIVITY,
    met: EXERCISE_MET,
    weightKg: opts.weightKg,
    durationMinutes: opts.durationMinutes,
  })
}

/** Peso corporal vigente en `dateKey` (mediciones no demo; la más reciente ≤ fecha). */
export function weightForDate(rows: WeightRow[], dateKey?: string): number | null {
  const valid = rows
    .filter(r => !r.isDemo && Number(r.weightKg) > 0 && !!r.localDate)
    .filter(r => (dateKey ? String(r.localDate) <= dateKey : true))
    .sort((a, b) => String(a.localDate).localeCompare(String(b.localDate)))
  const last = valid[valid.length - 1]
  return last ? Number(last.weightKg) : null
}

export async function loadWeightRows(): Promise<WeightRow[]> {
  return db.bodyMeasurements.toArray().catch(() => []) as Promise<WeightRow[]>
}

/**
 * Gasto del ejercicio en el rango [from, to] (fechas locales, inclusive).
 * Misma entrada para Inicio, historial e informes → mismas cifras.
 */
export function computeExpenditure(opts: {
  from: string
  to: string
  sessions: EnergySession[]
  weightRows: WeightRow[]
  nowMs?: number
}): ExpenditureResult {
  const nowMs = opts.nowMs ?? Date.now()
  const inRange = opts.sessions.filter(s => {
    const d = String(s.calendarDate ?? '')
    return d >= opts.from && d <= opts.to
  })

  const energies: SessionEnergy[] = []
  let firstReason: EnergyInsufficient | null = null
  let realSessionWithoutData = false
  for (const s of inRange) {
    const weight = weightForDate(opts.weightRows, s.calendarDate)
    const reason = energyInsufficientReason(s, weight, nowMs)
    if (reason === 'SESION_NO_REAL') { continue } // demo/cancelada: no cuenta
    const r = sessionEnergy(s, weight, nowMs)
    if (r) { energies.push(r); continue }
    realSessionWithoutData = true
    if (reason && !firstReason) { firstReason = reason }
  }

  const byDate = new Map<string, { kcal: number; minutes: number }>()
  for (const e of energies) {
    const cur = byDate.get(e.calendarDate) ?? { kcal: 0, minutes: 0 }
    cur.kcal += e.kcal
    cur.minutes += e.durationMinutes
    byDate.set(e.calendarDate, cur)
  }
  const porFecha = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([fecha, v]) => ({ fecha, kcal: Math.round(v.kcal * 10) / 10, minutes: Math.round(v.minutes * 10) / 10 }))

  const totalKcal = energies.reduce((a, e) => a + e.kcal, 0)
  const totalMinutes = energies.reduce((a, e) => a + e.durationMinutes, 0)
  const hasData = energies.length > 0

  // Precisión de 0,1 kcal (la misma de cada sesión) para que el total del día
  // y la suma semanal coincidan sin diferencias de redondeo.
  return {
    from: opts.from,
    to: opts.to,
    totalKcal: hasData ? Math.round(totalKcal * 10) / 10 : null,
    totalMinutes: hasData ? Math.round(totalMinutes * 10) / 10 : null,
    sesiones: energies,
    porFecha,
    motivo: hasData ? null : (realSessionWithoutData ? (firstReason ?? 'SIN_DURACION') : 'SIN_SESIONES'),
  }
}
