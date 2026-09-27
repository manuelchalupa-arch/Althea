import { db } from '@/services/storage/db'
import { dayKeyOffset, todayKey } from '@/utils/dates'

export type BottleConfig = {
  id: string
  name?: string
  capacityMl: number
  capacityLiters: number
  active: boolean
  order: number
}

export type BottleLog = {
  id: string
  localDate: string
  bottleId: string
  amountMl: number
  time: string
}

export type BottleDailySummary = {
  date: string
  perBottle: Array<{
    bottleId: string
    name?: string
    capacityMl: number
    capacityLiters: number
    count: number
    totalMl: number
    totalLiters: number
  }>
  /** ml cargados sin botella asociada (botón rápido o registros previos). */
  manualMl: number
  totalMl: number
  totalLiters: number
}

const DEFAULT_BOTTLES: Omit<BottleConfig, 'capacityLiters'>[] = [
  { id: 'bottle-1', name: 'Botella 1', capacityMl: 750, active: true, order: 1 },
  { id: 'bottle-2', name: 'Botella 2', capacityMl: 1000, active: true, order: 2 },
  { id: 'bottle-3', name: 'Botella 3', capacityMl: 1500, active: false, order: 3 },
]

/**
 * Id sintético para cantidades cargadas sin botella (botón "+250 ml", avisos).
 * No es una botella configurable: suma al total del día pero no aparece en el
 * desglose por botella, para no inventar una botella que el usuario no definió.
 */
export const MANUAL_BOTTLE_ID = 'manual'

function toConfig(raw: { id: string; name?: string; capacityMl: number; active: boolean; order: number }): BottleConfig {
  return {
    ...raw,
    capacityLiters: raw.capacityMl / 1000,
  }
}

export function validateBottles(bottles: BottleConfig[]): string | null {
  const active = bottles.filter(b => b.active)
  if (active.length < 2 || active.length > 3) return 'Debe haber entre 2 y 3 botellas activas'
  for (const b of bottles) {
    if (!Number.isFinite(b.capacityMl) || b.capacityMl <= 0) return `Capacidad inválida para ${b.id}`
    if (b.capacityMl < 100 || b.capacityMl > 5000) return `Capacidad fuera de rango para ${b.id}`
  }
  return null
}

export async function getBottleConfigs(): Promise<BottleConfig[]> {
  const rows = await db.hydrationBottles.toArray().catch(() => [])
  if (rows.length === 0) {
    // seed defaults en Dexie (fuente de verdad)
    const now = new Date().toISOString()
    const toPut = DEFAULT_BOTTLES.map(b => ({ ...b, updatedAt: now }))
    await db.hydrationBottles.bulkPut(toPut as any)
    return toPut.map(toConfig)
  }
  return rows.sort((a, b) => a.order - b.order).map(toConfig)
}

export async function saveBottleConfigs(configs: BottleConfig[]): Promise<void> {
  const err = validateBottles(configs)
  if (err) throw new Error(err)
  const now = new Date().toISOString()
  const rows = configs.map(c => ({
    id: c.id,
    name: c.name?.trim() || undefined,
    capacityMl: Math.round(c.capacityMl),
    active: c.active,
    order: c.order,
    updatedAt: now,
  }))
  await db.hydrationBottles.bulkPut(rows as any)
  // limpiar configs huérfanas si se envió menos de 3? No borrar, mantener 3 slots siempre
}

export async function updateBottleConfig(id: string, patch: Partial<Pick<BottleConfig, 'name' | 'capacityMl' | 'capacityLiters' | 'active'>>): Promise<BottleConfig[]> {
  const current = await getBottleConfigs()
  const idx = current.findIndex(b => b.id === id)
  if (idx === -1) throw new Error(`Botella no encontrada: ${id}`)
  const updated = [...current]
  const target = { ...updated[idx] }
  if (patch.name !== undefined) target.name = patch.name?.trim() || undefined
  if (patch.capacityMl !== undefined) target.capacityMl = Math.round(patch.capacityMl)
  else if (patch.capacityLiters !== undefined) target.capacityMl = Math.round(patch.capacityLiters * 1000)
  if (patch.active !== undefined) target.active = patch.active
  target.capacityLiters = target.capacityMl / 1000
  updated[idx] = target
  await saveBottleConfigs(updated)
  return updated
}

/**
 * ÚNICO punto de escritura de hidratación.
 * Guarda el registro en `hydrationBottleLogs` (fuente canónica de la botella) y
 * lo refleja en `hydrationLogs` con el MISMO id, para los lectores legacy
 * (`getTodayHydration`, informes, notificaciones) sin crear una segunda fuente
 * de verdad ni posibilidad de doble conteo.
 */
async function writeHydrationLog(bottleId: string, amountMl: number, localDate?: string): Promise<BottleLog> {
  const ml = Math.round(Number(amountMl))
  if (!Number.isFinite(ml) || ml <= 0) throw new Error('Cantidad de hidratación inválida')
  const log: BottleLog = {
    id: crypto.randomUUID(),
    localDate: localDate ?? todayKey(),
    bottleId,
    amountMl: ml,
    time: new Date().toISOString(),
  }
  await db.hydrationBottleLogs.put(log as any)
  await db.hydrationLogs.put({
    id: log.id,
    localDate: log.localDate,
    amountMl: log.amountMl,
    time: log.time,
    isDemo: false,
  } as any)
  return log
}

export async function completeBottle(bottleId: string, localDate?: string): Promise<BottleLog> {
  const configs = await getBottleConfigs()
  const cfg = configs.find(c => c.id === bottleId)
  if (!cfg) throw new Error(`Botella no encontrada: ${bottleId}`)
  if (!cfg.active) throw new Error(`Botella inactiva: ${bottleId}`)
  if (cfg.capacityMl <= 0) throw new Error(`Capacidad inválida para ${bottleId}`)
  return writeHydrationLog(bottleId, cfg.capacityMl, localDate)
}

/**
 * Alta de hidratación en ml sin botella asociada (botón rápido, avisos).
 * Delega en el mismo punto de escritura que `completeBottle`.
 */
export async function addHydrationMl(amountMl: number, localDate?: string): Promise<BottleLog> {
  return writeHydrationLog(MANUAL_BOTTLE_ID, amountMl, localDate)
}

export async function getBottleDailySummary(localDate?: string): Promise<BottleDailySummary> {
  const date = localDate ?? todayKey()
  const configs = await getBottleConfigs()
  const activeConfigs = configs.filter(c => c.active)
  const logs = await db.hydrationBottleLogs.where('localDate').equals(date).toArray().catch(() => []) as BottleLog[]

  // Registros previos a la unificación: existen en `hydrationLogs` sin espejo en
  // `hydrationBottleLogs`. Se suman al total real (nunca se duplican porque se
  // excluyen los ids ya canónicos) pero no se atribuyen a ninguna botella.
  const canonicalIds = new Set(logs.map(l => l.id))
  const legacyLogs = (await db.hydrationLogs.where('localDate').equals(date).toArray().catch(() => []) as Array<{ id: string; amountMl: number; isDemo?: boolean }>)
    .filter(l => !l.isDemo && !canonicalIds.has(l.id))
  const manualMl = logs.filter(l => l.bottleId === MANUAL_BOTTLE_ID).reduce((s, l) => s + (l.amountMl || 0), 0)
    + legacyLogs.reduce((s, l) => s + (l.amountMl || 0), 0)

  const perBottle = activeConfigs.map(cfg => {
    const bottleLogs = logs.filter(l => l.bottleId === cfg.id)
    const count = bottleLogs.length
    const totalMl = bottleLogs.reduce((sum, l) => sum + (l.amountMl || 0), 0)
    return {
      bottleId: cfg.id,
      name: cfg.name,
      capacityMl: cfg.capacityMl,
      capacityLiters: cfg.capacityLiters,
      count,
      totalMl,
      totalLiters: totalMl / 1000,
    }
  })
  // incluir también logs de botellas que hoy están inactivas pero tuvieron consumo ese día (historial fiel).
  // El bucket manual NO es una botella: cuenta en el total pero no en el desglose.
  const inactiveBottleIds = logs.map(l => l.bottleId).filter(id => id !== MANUAL_BOTTLE_ID && !activeConfigs.some(c => c.id === id))
  const uniqueInactive = [...new Set(inactiveBottleIds)]
  for (const bid of uniqueInactive) {
    const cfg = configs.find(c => c.id === bid)
    const capacityMl = cfg?.capacityMl ?? logs.find(l => l.bottleId === bid)?.amountMl ?? 0
    const bottleLogs = logs.filter(l => l.bottleId === bid)
    const totalMl = bottleLogs.reduce((s, l) => s + (l.amountMl || 0), 0)
    perBottle.push({
      bottleId: bid,
      name: cfg?.name,
      capacityMl,
      capacityLiters: capacityMl / 1000,
      count: bottleLogs.length,
      totalMl,
      totalLiters: totalMl / 1000,
    })
  }
  const totalMl = logs.reduce((s, l) => s + (l.amountMl || 0), 0) + legacyLogs.reduce((s, l) => s + (l.amountMl || 0), 0)
  return {
    date,
    perBottle: perBottle.sort((a, b) => a.bottleId.localeCompare(b.bottleId)),
    manualMl,
    totalMl,
    totalLiters: totalMl / 1000,
  }
}

export async function getBottleHistory(days: number = 7): Promise<BottleDailySummary[]> {
  const cutoffStr = dayKeyOffset(todayKey(), -(days - 1))
  const logs = await db.hydrationBottleLogs.where('localDate').aboveOrEqual(cutoffStr).toArray().catch(() => []) as BottleLog[]
  const dates = [...new Set(logs.map(l => l.localDate))].sort()
  const result: BottleDailySummary[] = []
  for (const d of dates) {
    result.push(await getBottleDailySummary(d))
  }
  return result
}

export function calcHydrationGoalMl(opts: {
  weightKg?: number
  activityLevel?: string
  hasTrainingToday?: boolean
  tempC?: number
}): number {
  const w = opts.weightKg
  if (!w || !Number.isFinite(w) || w <= 0) return 2500
  // Base: 35 ml/kg (estándar EFSA)
  let goal = w * 35
  // Actividad
  const act = (opts.activityLevel || 'moderado').toLowerCase()
  if (act.includes('muy_activo') || act.includes('muy activo')) goal += 300
  else if (act.includes('extremadamente')) goal += 500
  else if (act.includes('moderado')) goal += 150
  else if (act.includes('poco')) goal += 50
  // Entrenamiento hoy
  if (opts.hasTrainingToday) goal += 500
  // Clima cálido
  if (opts.tempC !== undefined && opts.tempC >= 28) goal += 300
  else if (opts.tempC !== undefined && opts.tempC >= 24) goal += 150
  return Math.round(goal / 100) * 100 // redondear a 100 ml
}

export async function getCalculatedHydrationGoal(): Promise<number> {
  const profile = (await db.userProfile.toArray().catch(() => []))[0] as any
  const today = todayKey()
  const sessions = await db.trainingSessions.where('calendarDate').equals(today).toArray().catch(() => []) as any[]
  const hasTrainingToday = sessions.length > 0
  return calcHydrationGoalMl({
    weightKg: profile?.weightKg,
    activityLevel: profile?.activityLevel,
    hasTrainingToday,
  })
}
