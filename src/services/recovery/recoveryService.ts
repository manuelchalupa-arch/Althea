import { db } from '@/services/storage/db'
import type { HydrationLog, RecoveryCheck } from '@/types'

export async function getTodayHydration(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const logs = await db.hydrationLogs.where('localDate').equals(today).toArray()
  return logs
    .filter(log => (log as HydrationLog & { isDemo?: boolean }).isDemo !== true)
    .reduce((sum: number, log) => sum + (log.amountMl || 0), 0)
}

export async function addHydration(amountMl: number): Promise<HydrationLog> {
  const today = new Date().toISOString().slice(0, 10)
  const log: HydrationLog = {
    id: crypto.randomUUID(),
    localDate: today,
    amountMl,
    time: new Date().toISOString(),
    isDemo: false,
  }
  await db.hydrationLogs.put(log)
  import('@/services/sync/opQueue').then(({ enqueueOp }) => enqueueOp('hydrationLogs', log.id)).catch(() => {})
  return log
}

export async function getHydrationHistory(days: number = 7): Promise<HydrationLog[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const logs = await db.hydrationLogs
    .where('localDate')
    .aboveOrEqual(cutoffStr)
    .sortBy('localDate')
  return logs.filter(l => (l as HydrationLog & { isDemo?: boolean }).isDemo !== true)
}

export async function getTodayRecovery(): Promise<RecoveryCheck | undefined> {
  const today = new Date().toISOString().slice(0, 10)
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
  const today = localDate ?? new Date().toISOString().slice(0, 10)
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
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
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