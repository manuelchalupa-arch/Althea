import { db } from '@/services/storage/db'
import { todayKey, dayKeyOffset } from '@/utils/dates'
import type { HydrationLog, RecoveryCheck } from '@/types'

export async function getTodayHydration(): Promise<number> {
  const today = todayKey()
  const logs = await db.hydrationLogs.where('localDate').equals(today).toArray()
  return logs
    .filter(log => (log as HydrationLog & { isDemo?: boolean }).isDemo !== true)
    .reduce((sum: number, log) => sum + (log.amountMl || 0), 0)
}

export async function addHydration(amountMl: number): Promise<HydrationLog> {
  // Delega en la única ruta de escritura de hidratación: la botella es la fuente
  // canónica y `hydrationLogs` queda como reflejo para los lectores legacy.
  const { addHydrationMl } = await import('@/services/recovery/hydrationBottles')
  const log = await addHydrationMl(amountMl)
  import('@/services/sync/opQueue').then(({ enqueueOp }) => enqueueOp('hydrationLogs', log.id)).catch(() => {})
  return { id: log.id, localDate: log.localDate, amountMl: log.amountMl, time: log.time, isDemo: false }
}

export async function getHydrationHistory(days: number = 7): Promise<HydrationLog[]> {
  const cutoffStr = dayKeyOffset(todayKey(), -days)
  const logs = await db.hydrationLogs
    .where('localDate')
    .aboveOrEqual(cutoffStr)
    .sortBy('localDate')
  return logs.filter(l => (l as HydrationLog & { isDemo?: boolean }).isDemo !== true)
}

export async function getTodayRecovery(): Promise<RecoveryCheck | undefined> {
  const today = todayKey()
  return db.recoveryChecks.get(today)
}

export async function saveRecoveryCheck(data: Omit<RecoveryCheck, 'id' | 'localDate'>): Promise<RecoveryCheck> {
  return updateRecoveryCheck(data)
}

// Actualización parcial NO destructiva: fusiona sobre el registro existente
// sin inventar valores. Los campos no incluidos se conservan intactos.
export async function updateRecoveryCheck(
  patch: Partial<Omit<RecoveryCheck, 'id' | 'localDate'>>,
  localDate?: string,
): Promise<RecoveryCheck> {
  const today = localDate ?? todayKey()
  const existing = await db.recoveryChecks.get(today)
  const check = {
    id: today,
    localDate: today,
    ...(existing || {}),
    ...patch,
    isDemo: false,
  } as RecoveryCheck
  await db.recoveryChecks.put(check)
  try { window.dispatchEvent(new Event('recoveryChange')) } catch { /* noop */ }
  import('@/services/sync/opQueue').then(({ enqueueOp }) => enqueueOp('recoveryChecks', today)).catch(() => {})
  return check
}

export async function getRecoveryHistory(days: number = 30): Promise<RecoveryCheck[]> {
  const cutoffStr = dayKeyOffset(todayKey(), -days)
  return db.recoveryChecks
    .where('localDate')
    .aboveOrEqual(cutoffStr)
    .sortBy('localDate')
}

export async function getHydrationGoal(): Promise<number> {
  const profile = await db.userProfile.toArray()
  return profile[0]?.hydrationGoalMl ?? 2500
}

export async function setHydrationGoal(ml: number): Promise<void> {
  const profile = await db.userProfile.toArray()
  if (profile[0]) {
    await db.userProfile.update(profile[0].id, { hydrationGoalMl: ml })
  }
}