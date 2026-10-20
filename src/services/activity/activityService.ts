/**
 * Activity Service - Servicios para el registro y seguimiento de actividades
 *
 * Persistencia real en Dexie (tabla `activitySessions`, v25). Cada sesión
 * guarda un SNAPSHOT del cálculo (MET, sourceCode, estimated, variante, RPE,
 * carga, kcal, fórmula) para que el historial no recalcule cuando cambia el
 * perfil del usuario.
 *
 * Aislamiento: las sesiones se filtran por userId. Sin sesión de Firebase se
 * usa 'local' como owner (modo offline).
 */

import { db } from '@/services/storage/db'
import { currentUser } from '@/services/firebase/auth'
import { activityCatalog, findVariant, defaultVariant, type Activity, type ActivityLevel, type ActivityModalidad, type ActivityCategory } from '@/data/activityCatalog'
import { calculateCalorieExpenditure, calculateSessionLoad, normalizeSessionRpe, estimateMetCalories, estimateTreadmillCalories, getActivitiesByCategory, getActivitiesByModalidad, getActivitiesByIntensidad, getDefaultVariant, getVariant } from './activityDomain'

export { getActivitiesByCategory, getActivitiesByModalidad, getActivitiesByIntensidad, getDefaultVariant, getVariant }

/** Owner de las sesiones locales: uid de Firebase o 'local' en modo offline. */
export function currentOwnerId(): string {
  try { return currentUser()?.uid ?? 'local' } catch { return 'local' }
}

/** Fila persistida de una sesión de actividad (snapshot inmutable). */
export interface ActivitySessionRecord {
  id: string
  userId: string
  activityId: string
  activityName: string
  modalidad?: string
  calendarDate: string
  startedAt: string
  durationMinutes?: number
  distanceMeters?: number
  /** Distancia en km y su origen (manual / gps / máquina). */
  distanceKm?: number | null
  distanceSource?: 'manual' | 'gps' | 'machine' | null
  weightKg?: number | null
  intensity?: string
  met?: number
  metSourceCode?: string
  metEstimated?: boolean
  variantId?: string
  variantLabel?: string
  sessionRpe?: number | null
  sessionLoad?: number | null
  grossKcal?: number | null
  netKcal?: number | null
  /** Calorías activas (descuentan reposo): lo único sumable a indicadores. */
  activeKcal?: number | null
  /** Método usado: MET, ACSM (cinta) o null si no se pudo estimar. */
  calorieMethod?: 'MET' | 'ACSM_WALK' | 'ACSM_RUN' | null
  calorieEstimated?: boolean
  inclinePercent?: number | null
  powerWatts?: number | null
  /** Kcal declaradas por el usuario según su máquina. Nunca se suman. */
  machineKcal?: number | null
  kcalFormula?: string | null
  notes?: string
  createdAt: string
  updatedAt: string
}

/** Entrada para guardar una sesión nueva. */
export interface SaveActivityInput {
  activityId: string
  calendarDate: string
  startedAt: string
  durationMinutes: number
  distanceMeters?: number
  distanceKm?: number | null
  distanceSource?: 'manual' | 'gps' | 'machine' | null
  weightKg?: number | null
  variantId?: string
  sessionRpe?: number | null
  inclinePercent?: number | null
  powerWatts?: number | null
  machineKcal?: number | null
  notes?: string
}

/** Genera un ID único de sesión. */
export function newSessionId(): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return rnd
}

/**
 * Guarda una sesión de actividad con snapshot completo del cálculo.
 * Si falta peso o MET, los campos de kcal van en null (nunca inventados),
 * pero la sesión se guarda igualmente.
 */
export async function saveActivitySession(input: SaveActivityInput): Promise<ActivitySessionRecord> {
  const activity = activityCatalog.find(a => a.id === input.activityId)
  if (!activity) { throw new Error('Actividad no encontrada') }

  const variant = input.variantId
    ? (findVariant(activity, input.variantId) ?? defaultVariant(activity))
    : defaultVariant(activity)

  const energy = calculateCalorieExpenditure(activity, input.durationMinutes, input.weightKg, input.variantId)
  // Método calórico: ACSM en cinta con distancia+duración válidas, si no MET.
  // activeKcal descuenta el reposo: es lo único que puede sumarse.
  let calorieMethod: ActivitySessionRecord['calorieMethod'] = null
  let grossKcal: number | null = null
  let activeKcal: number | null = null
  let netKcal: number | null = energy.netCalories
  let kcalFormula: string | null = energy.formula
  const distanceKm = input.distanceKm !== null && input.distanceKm !== undefined && input.distanceKm > 0
    ? Math.round(input.distanceKm * 100) / 100
    : null
  if (activity.id === 'cinta_correr' && distanceKm !== null && (input.weightKg ?? 0) > 0 && input.durationMinutes > 0) {
    const acsm = estimateTreadmillCalories({
      weightKg: Number(input.weightKg),
      durationMinutes: input.durationMinutes,
      distanceKm,
      inclinePercent: input.inclinePercent,
      mode: variant.id === 'caminata' ? 'walk' : 'run',
    })
    if (acsm) {
      calorieMethod = acsm.method
      grossKcal = acsm.grossKcal
      activeKcal = acsm.activeKcal
      netKcal = acsm.activeKcal
      kcalFormula = `${acsm.method === 'ACSM_WALK' ? 'ACSM caminata' : 'ACSM carrera'}: ${distanceKm} km en ${input.durationMinutes} min, pendiente ${Number(input.inclinePercent) || 0} %`
    }
  }
  if (grossKcal === null && energy.calories !== null) {
    const snap = estimateMetCalories(energy.met, Number(input.weightKg), input.durationMinutes)
    calorieMethod = 'MET'
    grossKcal = snap.grossKcal
    activeKcal = snap.activeKcal
  }
  // Los registros nuevos solo aceptan RPE 1–5. Los históricos se
  // conservan tal cual en la base y se muestran con su escala original.
  const sessionRpe = input.sessionRpe === null || input.sessionRpe === undefined
    ? null
    : normalizeSessionRpe(input.sessionRpe)
  if (input.sessionRpe !== null && input.sessionRpe !== undefined && sessionRpe === null) {
    throw new Error('Esfuerzo percibido inválido: usá un valor entero entre 1 y 5')
  }
  const sessionLoad = sessionRpe === null ? null : calculateSessionLoad(input.durationMinutes, sessionRpe)

  const now = new Date().toISOString()
  const record: ActivitySessionRecord = {
    id: newSessionId(),
    userId: currentOwnerId(),
    activityId: activity.id,
    activityName: activity.nombre,
    modalidad: activity.modalidad,
    calendarDate: input.calendarDate,
    startedAt: input.startedAt,
    durationMinutes: input.durationMinutes,
    distanceMeters: input.distanceMeters ?? (distanceKm !== null ? Math.round(distanceKm * 1000) : undefined),
    distanceKm,
    distanceSource: distanceKm !== null ? (input.distanceSource ?? 'manual') : null,
    weightKg: input.weightKg ?? null,
    intensity: activity.intensidad,
    met: energy.met,
    metSourceCode: variant.sourceCode,
    metEstimated: variant.estimated,
    variantId: variant.id,
    variantLabel: variant.label,
    sessionRpe,
    sessionLoad,
    grossKcal,
    netKcal,
    activeKcal,
    calorieMethod,
    calorieEstimated: grossKcal !== null,
    inclinePercent: input.inclinePercent ?? null,
    powerWatts: input.powerWatts ?? null,
    machineKcal: input.machineKcal ?? null,
    kcalFormula,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  }

  await db.activitySessions.put(record)
  return record
}

/** Historial de sesiones del usuario actual, más reciente primero. */
export async function getActivityHistory(userId?: string): Promise<ActivitySessionRecord[]> {
  const owner = userId ?? currentOwnerId()
  const rows = await db.activitySessions.where('userId').equals(owner).toArray()
  return rows.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0))
}

/** Sesiones dentro de un rango de fechas (inclusive). */
export async function getActivityHistoryBetween(fromDate: string, toDate: string, userId?: string): Promise<ActivitySessionRecord[]> {
  const all = await getActivityHistory(userId)
  return all.filter(r => r.calendarDate >= fromDate && r.calendarDate <= toDate)
}

/** Elimina una sesión por ID (solo si pertenece al usuario actual). */
export async function deleteActivitySession(id: string, userId?: string): Promise<boolean> {
  const owner = userId ?? currentOwnerId()
  const row = await db.activitySessions.get(id)
  if (!row || row.userId !== owner) { return false }
  await db.activitySessions.delete(id)
  try {
    const { recordDelete } = await import('@/services/firebase/sync')
    await recordDelete('activitySessions', id)
  } catch { /* noop */ }
  return true
}

/** Estado de una sesión de actividad (legado, compatibilidad). */
export interface ActivitySession {
  id: string
  userId: string
  activityId: string
  startTime: Date
  endTime?: Date
  durationMinutes: number
  distanceMeters?: number
  intensity: ActivityLevel
  met: number
  metNote?: string
  calories?: number | null
  weightKg?: number
  notes?: string
  createdAt: Date
  updatedAt: Date
}

/** Convierte un registro persistido a la forma legada ActivitySession. */
export function toLegacySession(r: ActivitySessionRecord): ActivitySession {
  return {
    id: r.id,
    userId: r.userId,
    activityId: r.activityId,
    startTime: new Date(r.startedAt),
    durationMinutes: r.durationMinutes ?? 0,
    distanceMeters: r.distanceMeters,
    intensity: (r.intensity ?? 'moderada') as ActivityLevel,
    met: r.met ?? 0,
    calories: r.grossKcal ?? null,
    weightKg: r.weightKg ?? undefined,
    notes: r.notes,
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
  }
}

/** Configuración de sesión de actividad (legado). */
export interface ActivitySessionConfig {
  activityId: string
  allowGps: boolean
  recordDistance: boolean
  recordCalories: boolean
  weightKg?: number
}

/** Resumen de sesión de actividad (legado). */
export interface ActivitySummary {
  id: string
  activityNombre: string
  durationMinutes: number
  distanceMeters?: number
  calories?: number
  intensity: ActivityLevel
  activeDurationMinutes: number
}

/** Resultado del seguimiento GPS. */
export interface GpsPoint {
  latitude: number
  longitude: number
  timestamp: Date
  accuracy: number | null
}

/** Estado del seguimiento GPS. */
export enum GpsState {
  INACTIVE = 'inactive',
  RECORDING = 'recording',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ERROR = 'error'
}

/** Opciones de sesión de actividad (legado). */
export interface ActivitySessionOptions {
  recordGps: boolean
  recordDistance: boolean
  recordCalories: boolean
  userWeightKg?: number
  onProgress: (progress: { activeMinutes: number; distance?: number; calories?: number }) => void
  onStateChange: (state: GpsState) => void
}

/**
 * Registrar una nueva sesión de actividad (legado: usa saveActivitySession).
 * Mantiene la firma anterior para compatibilidad con consumidores existentes.
 */
export async function registrarSesion(
  config: ActivitySessionConfig,
  gpsPoints: GpsPoint[] = [],
): Promise<ActivitySummary> {
  const activity = activityCatalog.find(a => a.id === config.activityId)
  if (!activity) { throw new Error('Actividad no encontrada') }

  const startedAt = gpsPoints.length > 0 ? gpsPoints[0].timestamp.toISOString() : new Date().toISOString()
  const last = gpsPoints.length > 0 ? gpsPoints[gpsPoints.length - 1].timestamp : new Date()
  const durationMinutes = Math.max(1, Math.round((last.getTime() - new Date(startedAt).getTime()) / 60000))

  let distanceMeters: number | undefined
  if (config.recordDistance && gpsPoints.length > 1) {
    distanceMeters = haversinePathMeters(gpsPoints)
  }

  const record = await saveActivitySession({
    activityId: activity.id,
    calendarDate: startedAt.slice(0, 10),
    startedAt,
    durationMinutes,
    distanceMeters,
    weightKg: config.weightKg,
  })

  return {
    id: record.id,
    activityNombre: record.activityName,
    durationMinutes: record.durationMinutes ?? 0,
    distanceMeters: record.distanceMeters,
    calories: record.grossKcal ?? undefined,
    intensity: (record.intensity ?? 'moderada') as ActivityLevel,
    activeDurationMinutes: record.durationMinutes ?? 0,
  }
}

/** Obtener historial de sesiones (legado). */
export async function obtenerHistorial(userId: string): Promise<ActivitySummary[]> {
  const rows = await getActivityHistory(userId)
  return rows.map(r => ({
    id: r.id,
    activityNombre: r.activityName,
    durationMinutes: r.durationMinutes ?? 0,
    distanceMeters: r.distanceMeters,
    calories: r.grossKcal ?? undefined,
    intensity: (r.intensity ?? 'moderada') as ActivityLevel,
    activeDurationMinutes: r.durationMinutes ?? 0,
  }))
}

/**
 * Distancia total de un path GPS en metros (fórmula Haversine).
 * Si hay menos de 2 puntos devuelve 0.
 */
export function haversinePathMeters(points: GpsPoint[]): number {
  if (points.length < 2) { return 0 }
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1].latitude, points[i - 1].longitude, points[i].latitude, points[i].longitude)
  }
  return Math.round(total)
}

/** Distancia Haversine entre dos coordenadas en metros. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/**
 * Selecciona la variante MET más adecuada según la velocidad (km/h).
 * Umbrales documentados: caminar < 9, trotar 9–13, correr > 13;
 * bici < 16 tranquila, 16–19 moderada, > 19 vigorosa.
 * Devuelve null si la actividad no tiene variantes por velocidad.
 */
export function selectVariantBySpeed(activity: Activity, speedKmh: number): string | null {
  const v = activity.variants
  if (v.length === 0) { return null }
  if (activity.id === 'caminar') {
    if (speedKmh < 4) { return 'lento' }
    if (speedKmh < 6) { return 'moderado' }
    if (speedKmh < 8) { return 'rapido' }
    return 'muy_rapido'
  }
  if (activity.id === 'trotar') {
    return speedKmh >= 9 ? 'general' : 'suave'
  }
  if (activity.id === 'correr') {
    if (speedKmh < 9) { return '5mph' }
    if (speedKmh < 11) { return '6mph' }
    if (speedKmh < 13) { return '7mph' }
    return '8mph'
  }
  if (activity.id === 'bicicleta_exterior') {
    if (speedKmh < 16) { return 'tranquilo' }
    if (speedKmh < 20) { return 'moderado' }
    return 'vigoroso'
  }
  if (activity.id === 'bicicleta_fija') {
    return speedKmh > 0 ? 'spin' : 'moderado'
  }
  return null
}

/** Obtener actividades por categoría. */
export function obtenerPorCategoria(categoria: ActivityCategory): Activity[] {
  return getActivitiesByCategory(categoria)
}

/** Obtener actividades por modalidad. */
export function obtenerPorModalidad(modalidad: ActivityModalidad): Activity[] {
  return getActivitiesByModalidad(modalidad)
}

/** Obtener actividades por intensidad. */
export function obtenerPorIntensidad(intensidad: ActivityLevel): Activity[] {
  return getActivitiesByIntensidad(intensidad)
}

/** Calcular gasto calórico (legado). */
export function calcularCalorias(activityId: string, durationMinutes: number, weightKg?: number) {
  const activity = activityCatalog.find(a => a.id === activityId)
  if (!activity) { return null }
  return calculateCalorieExpenditure(activity, durationMinutes, weightKg)
}
