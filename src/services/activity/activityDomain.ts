/**
 * Activity Domain - Lógica de dominio para actividades deportivas
 *
 * Reglas de negocio:
 * - El gasto calórico USA la fórmula canónica de `metExpenditure.ts`
 *   (kcal/min = MET × 3,5 × kg ÷ 200). No existe otra fuente de cálculo.
 * - La carga de sesión es RPE × duración activa (unidad arbitraria, NO kcal).
 * - Sin peso o sin MET el gasto es null; la sesión sigue siendo guardable.
 */

import { calculateCalorieExpenditure as canonicalCalorieExpenditure } from '@/services/ai/metExpenditure'
import { activityCatalog, findVariant, defaultVariant, type Activity, type ActivityLevel, type ActivityModalidad, type ActivityCategory, type ActivityMetVariant } from '@/data/activityCatalog'

/**
 * Gasto calórico estimado — delega en la fuente única (metExpenditure).
 * Devuelve null en kcal cuando falta peso o MET, pero nunca inventa calorías.
 */
export function calculateCalorieExpenditure(
  activity: Activity,
  durationMinutes: number,
  weightKg?: number | null,
  variantId?: string,
): { calories: number | null; netCalories: number | null; met: number; durationHours: number; formula: string | null } {
  const variant = variantId ? (findVariant(activity, variantId) ?? defaultVariant(activity)) : defaultVariant(activity)
  const met = variant.met
  const durationHours = durationMinutes / 60

  if (!(weightKg && weightKg > 0) || !(met > 0) || !(durationMinutes > 0)) {
    return { calories: null, netCalories: null, met, durationHours, formula: null }
  }

  const r = canonicalCalorieExpenditure({
    activity: activity.nombre,
    met,
    weightKg,
    durationMinutes,
  })

  return {
    calories: r.grossKcal,
    netCalories: r.netKcal,
    met,
    durationHours,
    formula: r.formula,
  }
}

/**
 * Estimación calórica con brutas y activas separadas.
 * `activeKcal` descuenta el reposo (1 MET): es lo único que puede sumarse
 * a indicadores de actividad sin duplicar el gasto basal.
 */
export interface CalorieEstimate {
  grossKcal: number
  activeKcal: number
  estimated: boolean
  method: 'MET' | 'ACSM_WALK' | 'ACSM_RUN'
}

/**
 * Estimación MET de referencia. Misma fórmula canónica que
 * `calculateCalorieExpenditure` (MET × 3,5 × kg × min ÷ 200);
 * aquí con redondeo entero para el snapshot persistido.
 */
export function estimateMetCalories(
  met: number,
  weightKg: number,
  durationMinutes: number,
): CalorieEstimate {
  if (
    !Number.isFinite(met) || met < 1 ||
    !Number.isFinite(weightKg) || weightKg <= 0 ||
    !Number.isFinite(durationMinutes) || durationMinutes <= 0
  ) {
    throw new Error('Parámetros de cálculo calórico inválidos.')
  }
  const grossKcal = (met * 3.5 * weightKg * durationMinutes) / 200
  const activeKcal = (Math.max(0, met - 1) * 3.5 * weightKg * durationMinutes) / 200
  return {
    grossKcal: Math.round(grossKcal),
    activeKcal: Math.round(activeKcal),
    estimated: true,
    method: 'MET',
  }
}

/**
 * Ecuación ACSM para cinta (caminar/correr) a partir de distancia y
 * duración activas más pendiente opcional (fracción: 5 % → 0.05).
 * Devuelve null fuera de los rangos de validez de estado estable:
 * caminata 50–100 m/min, carrera ≥ 134 m/min. Entre 100 y 134 m/min
 * no hay ecuación aplicable: usar MET.
 */
export function estimateTreadmillCalories(input: {
  weightKg: number
  durationMinutes: number
  distanceKm: number
  inclinePercent?: number | null
  mode: 'walk' | 'run'
}): CalorieEstimate | null {
  const { weightKg, durationMinutes, distanceKm, mode } = input
  if (
    !Number.isFinite(weightKg) || weightKg <= 0 ||
    !Number.isFinite(durationMinutes) || durationMinutes <= 0 ||
    !Number.isFinite(distanceKm) || distanceKm <= 0
  ) {
    return null
  }
  const incline = Number(input.inclinePercent) || 0
  if (!(incline >= 0) || incline > 40) { return null }
  const speedMPerMin = (distanceKm * 1000) / durationMinutes
  const grade = incline / 100
  let vo2: number
  if (mode === 'walk') {
    if (speedMPerMin < 50 || speedMPerMin > 100) { return null }
    vo2 = 0.1 * speedMPerMin + 1.8 * speedMPerMin * grade + 3.5
  } else {
    if (speedMPerMin < 134) { return null }
    vo2 = 0.2 * speedMPerMin + 0.9 * speedMPerMin * grade + 3.5
  }
  const grossKcal = (vo2 * weightKg) / 1000 * 5 * durationMinutes
  const activeKcal = (Math.max(0, vo2 - 3.5) * weightKg) / 1000 * 5 * durationMinutes
  return {
    grossKcal: Math.round(grossKcal),
    activeKcal: Math.round(activeKcal),
    estimated: true,
    method: mode === 'walk' ? 'ACSM_WALK' : 'ACSM_RUN',
  }
}

/** Actividades donde tiene sentido registrar distancia (km). */
export const DISTANCE_ACTIVITIES: Record<string, { machine: boolean }> = {
  caminar: { machine: false },
  trotar: { machine: false },
  correr: { machine: false },
  cinta_correr: { machine: true },
  bicicleta_exterior: { machine: false },
  bicicleta_fija: { machine: true },
  eliptica: { machine: true },
  escaladora: { machine: true },
  remo: { machine: true },
}

export type DistanceSource = 'manual' | 'gps' | 'machine'

export function supportsDistance(activityId: string): boolean {
  return activityId in DISTANCE_ACTIVITIES
}

/**
 * Escala de esfuerzo percibido (RPE) vigente: 1–5.
 * Los registros históricos con escalas anteriores (0, 0–10) se conservan
 * tal cual (ver `describeSessionRpe`); solo los registros NUEVOS validan 1–5.
 */
export const RPE_LEVELS = [
  { value: 1, label: '1', description: 'Muy ligero', color: 'bg-green-600' },
  { value: 2, label: '2', description: 'Ligero', color: 'bg-lime-500' },
  { value: 3, label: '3', description: 'Moderado', color: 'bg-yellow-400' },
  { value: 4, label: '4', description: 'Intenso', color: 'bg-orange-500' },
  { value: 5, label: '5', description: 'Máximo', color: 'bg-red-600' },
] as const

export type RpeLevel = (typeof RPE_LEVELS)[number]['value']

/** Valida un RPE nuevo: entero 1–5. Lanza Error si no es válido. */
export function normalizeSessionRpe(value: number | null | undefined): number | null {
  if (value === null || value === undefined) { return null }
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 5) { return null }
  return n
}

/**
 * Descripción de un RPE para mostrar en el historial.
 * Los valores legacy (0 o 6–10, escala anterior) conservan su significado
 * y se etiquetan como tales; nunca se reescriben.
 */
export function describeSessionRpe(value: number | null | undefined): string | null {
  if (value === null || value === undefined) { return null }
  const found = RPE_LEVELS.find((l) => l.value === value)
  if (found) { return found.description }
  if (value === 0) { return 'Esfuerzo 0 (escala anterior)' }
  if (Number.isInteger(value) && value >= 6 && value <= 10) { return `Esfuerzo ${value}/10 (escala anterior)` }
  return null
}

/**
 * Carga de sesión: RPE (1–5) × duración activa en minutos.
 * Unidades arbitrarias (no kcal, no kg). Lanza Error con datos inválidos.
 */
export function calculateSessionLoad(durationMinutes: number, sessionRpe?: number | null): number {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error('Duración o esfuerzo percibido inválido.')
  }
  const rpe = normalizeSessionRpe(sessionRpe)
  if (rpe === null) {
    throw new Error('Duración o esfuerzo percibido inválido.')
  }
  return Math.round(durationMinutes * rpe)
}

/** Obtiene la intensidad a partir del valor MET. */
export function getIntensityFromMET(met: number): ActivityLevel {
  if (met < 3.0) { return 'ligera' }
  if (met < 6.0) { return 'moderada' }
  return 'vigorosa'
}

/** Obtiene la categoría MET más aproximada para un nombre de actividad. */
export function findMet(activityName: string): { met: number; note?: string } | null {
  const activity = activityCatalog.find(
    a => a.nombre.toLowerCase().includes(activityName.toLowerCase())
  )
  if (!activity) { return null }
  const variant = defaultVariant(activity)
  return { met: variant.met, note: variant.note ?? activity.metNote }
}

/** Obtiene todas las actividades de una categoría específica. */
export function getActivitiesByCategory(categoria: ActivityCategory): Activity[] {
  return activityCatalog.filter(a => a.categoria === categoria)
}

/** Obtiene todas las actividades de una modalidad específica. */
export function getActivitiesByModalidad(modalidad: ActivityModalidad): Activity[] {
  return activityCatalog.filter(a => a.modalidad === modalidad)
}

/** Obtiene actividades por nivel de intensidad. */
export function getActivitiesByIntensidad(intensidad: ActivityLevel): Activity[] {
  return activityCatalog.filter(a => a.intensidad === intensidad)
}

/** Devuelve la variante por defecto de una actividad. */
export function getDefaultVariant(activity: Activity): ActivityMetVariant {
  return defaultVariant(activity)
}

/** Devuelve una variante concreta de una actividad. */
export function getVariant(activity: Activity, variantId: string): ActivityMetVariant | undefined {
  return findVariant(activity, variantId)
}
