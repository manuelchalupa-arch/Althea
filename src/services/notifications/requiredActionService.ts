import { db } from '@/services/storage/db'
import { toLocalDateKey } from '@/utils/dates'
import { loadUnifiedConfigs, type UnifiedNotifConfig } from './unifiedNotifications'

export type RequiredStatus = 'pending' | 'completed'

export interface RequiredActionState {
  id: string // `${configId}|${date}`
  configId: string
  date: string // YYYY-MM-DD
  status: RequiredStatus
  completedAt?: string
  createdAt: string
}

function stateId(configId: string, date: string): string {
  return `${configId}|${date}`
}

function todayStr(d = new Date()): string {
  return toLocalDateKey(d)
}

function timeStr(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function dayIdx(d = new Date()): number {
  return (d.getDay() + 6) % 7
}

// Crea pending si la hora ya pasó, día habilitado y no existe estado previo
export async function ensurePendingForDue(date?: string, now?: Date): Promise<RequiredActionState[]> {
  const d = now ?? new Date()
  const dateStr = date ?? todayStr(d)
  const t = timeStr(d)
  const idx = dayIdx(d)
  const cfgs = await loadUnifiedConfigs()
  const required = cfgs.filter(c => c.enabled && c.requiredAction)
  const created: RequiredActionState[] = []
  for (const cfg of required) {
    if (!cfg.days[idx]) {continue}
    const times = cfg.type === 'preparar_habitacion' ? [cfg.time] : cfg.times
    const due = times.some(tm => tm <= t)
    if (!due) {continue}
    const id = stateId(cfg.id, dateStr)
    const existing = await db.requiredActionStates.get(id).catch(() => null) as unknown as RequiredActionState | null
    if (existing) {continue}
    // si RecoveryCheck ya está completado (score existe), no crear pending
    if (cfg.type === 'recuperacion') {
      const rec = await db.recoveryChecks.get(dateStr).catch(() => null) as { score?: number } | null
      if (typeof rec?.score === 'number') {continue}
    }
    const st: RequiredActionState = { id, configId: cfg.id, date: dateStr, status: 'pending', createdAt: new Date().toISOString() }
    await db.requiredActionStates.put(st as never).catch(() => {})
    created.push(st)
  }
  return created
}

export async function getPendingActions(date?: string): Promise<Array<RequiredActionState & { config: UnifiedNotifConfig }>> {
  const dateStr = date ?? todayStr()
  const states = await db.requiredActionStates.where('date').equals(dateStr).toArray().catch(() => []) as unknown as RequiredActionState[]
  const pending = states.filter(s => s.status === 'pending')
  const cfgs = await loadUnifiedConfigs()
  const map = new Map(cfgs.map(c => [c.id, c]))
  return pending
    .map(s => {
      const cfg = map.get(s.configId)
      return cfg ? { ...s, config: cfg } : null
    })
    .filter(Boolean) as Array<RequiredActionState & { config: UnifiedNotifConfig }>
}

export async function isBlocked(date?: string): Promise<boolean> {
  const pending = await getPendingActions(date)
  return pending.length > 0
}

export async function completeAction(configId: string, date?: string): Promise<RequiredActionState> {
  const dateStr = date ?? todayStr()
  const id = stateId(configId, dateStr)
  const existing = await db.requiredActionStates.get(id).catch(() => null) as unknown as RequiredActionState | null
  const now = new Date().toISOString()
  if (existing) {
    const updated: RequiredActionState = { ...existing, status: 'completed', completedAt: now }
    await db.requiredActionStates.put(updated as never)
    return updated
  }
  const st: RequiredActionState = { id, configId, date: dateStr, status: 'completed', completedAt: now, createdAt: now }
  await db.requiredActionStates.put(st as never)
  return st
}

// Para RecoveryCheck: completar crea estado completed y evita pending futuro ese día
export async function completeRecoveryCheck(date?: string): Promise<void> {
  const dateStr = date ?? todayStr()
  // buscar config de recuperacion que sea required
  const cfgs = await loadUnifiedConfigs()
  const recCfg = cfgs.find(c => c.type === 'recuperacion' && c.requiredAction)
  if (recCfg) {
    await completeAction(recCfg.id, dateStr)
  } else {
    // aunque no sea required, marcar genérico para desbloquear futuros checks
    const anyRec = cfgs.find(c => c.type === 'recuperacion')
    if (anyRec) {await completeAction(anyRec.id, dateStr)}
  }
}

export async function getActionStatus(configId: string, date?: string): Promise<RequiredStatus | null> {
  const dateStr = date ?? todayStr()
  const st = await db.requiredActionStates.get(stateId(configId, dateStr)).catch(() => null) as unknown as RequiredActionState | null
  return st?.status ?? null
}

// Reapertura app con acción pendiente: isBlocked usa Dexie, no React state
export async function hasPendingOnReopen(date?: string): Promise<boolean> {
  return isBlocked(date)
}
