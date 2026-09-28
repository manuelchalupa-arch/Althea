import { db } from '@/services/storage/db'

export type NotifType = 'comer' | 'agua' | 'recuperacion' | 'entrenamiento' | 'preparar_habitacion' | 'otro'

export interface UnifiedNotifConfig {
  id: string
  type: NotifType
  title: string
  enabled: boolean
  time: string // HH:MM - horario principal (preparar_habitacion usa solo este)
  times: string[] // horarios adicionales (recurrencia)
  days: boolean[] // Lun(0)..Dom(6)
  recurrence: 'daily' | 'weekdays' | 'custom'
  requiredAction: boolean
  updatedAt: string
}

export const NOTIF_TYPE_LABEL: Record<NotifType, string> = {
  comer: 'Comer',
  agua: 'Tomar agua',
  recuperacion: 'Recuperación',
  entrenamiento: 'Entrenamiento',
  preparar_habitacion: 'Preparar habitación',
  otro: 'Otro recordatorio',
}

function nowIso() {
  return new Date().toISOString()
}

function allDays(): boolean[] {
  return [true, true, true, true, true, true, true]
}
function weekdays(): boolean[] {
  return [true, true, true, true, true, false, false]
}

export function defaultUnifiedConfigs(): UnifiedNotifConfig[] {
  const ts = nowIso()
  return [
    { id: 'comer-1', type: 'comer', title: 'Recordatorio para comer', enabled: false, time: '13:00', times: ['08:00', '13:00', '20:00'], days: weekdays(), recurrence: 'weekdays', requiredAction: false, updatedAt: ts },
    { id: 'agua-1', type: 'agua', title: 'Tomar agua', enabled: false, time: '10:00', times: ['10:00', '14:00', '18:00'], days: allDays(), recurrence: 'daily', requiredAction: false, updatedAt: ts },
    { id: 'recuperacion-1', type: 'recuperacion', title: 'Check-in de recuperación', enabled: false, time: '21:00', times: ['21:00'], days: allDays(), recurrence: 'daily', requiredAction: false, updatedAt: ts },
    { id: 'entrenamiento-1', type: 'entrenamiento', title: 'Entrenamiento programado', enabled: false, time: '07:30', times: ['07:30'], days: weekdays(), recurrence: 'weekdays', requiredAction: false, updatedAt: ts },
    // Preparar habitación: notificación simple — horario + título + activar/desactivar
    { id: 'preparar_habitacion-1', type: 'preparar_habitacion', title: 'Preparar habitación', enabled: false, time: '22:00', times: ['22:00'], days: allDays(), recurrence: 'daily', requiredAction: false, updatedAt: ts },
    { id: 'otro-1', type: 'otro', title: 'Recordatorio', enabled: false, time: '09:00', times: ['09:00'], days: allDays(), recurrence: 'daily', requiredAction: false, updatedAt: ts },
  ]
}

export async function loadUnifiedConfigs(): Promise<UnifiedNotifConfig[]> {
  const rows = await db.unifiedNotifConfigs.toArray().catch(() => []) as unknown as UnifiedNotifConfig[]
  if (rows.length === 0) {
    const defaults = defaultUnifiedConfigs()
    await db.unifiedNotifConfigs.bulkPut(defaults as never[]).catch(() => {})
    return defaults
  }
  // asegurar que existen los 6 tipos base (idempotente)
  const haveTypes = new Set(rows.map(r => r.type))
  const defaults = defaultUnifiedConfigs()
  const missing = defaults.filter(d => !haveTypes.has(d.type) && !rows.some(r => r.id === d.id))
  if (missing.length) {
    await db.unifiedNotifConfigs.bulkPut(missing as never[]).catch(() => {})
    return [...rows, ...missing]
  }
  return rows
}

export async function saveUnifiedConfig(cfg: UnifiedNotifConfig): Promise<void> {
  const toSave = { ...cfg, updatedAt: nowIso() }
  // Preparar habitación: si el usuario cambia time, espejar en times[0] para mantener consistencia simple
  if (toSave.type === 'preparar_habitacion') {
    toSave.times = [toSave.time]
  }
  await db.unifiedNotifConfigs.put(toSave as never)
}

export async function saveUnifiedConfigs(cfgs: UnifiedNotifConfig[]): Promise<void> {
  const normalized = cfgs.map(c => {
    const n = { ...c, updatedAt: nowIso() } as UnifiedNotifConfig
    if (n.type === 'preparar_habitacion') {n.times = [n.time]}
    return n
  })
  await db.unifiedNotifConfigs.bulkPut(normalized as never[])
  const ids = new Set(normalized.map(c => c.id))
  const existing = await db.unifiedNotifConfigs.toArray().catch(() => []) as unknown as UnifiedNotifConfig[]
  const toDelete = existing.filter(e => !ids.has(e.id)).map(e => e.id)
  if (toDelete.length) {await db.unifiedNotifConfigs.bulkDelete(toDelete).catch(() => {})}
}

export async function updateUnifiedConfig(id: string, patch: Partial<Omit<UnifiedNotifConfig, 'id' | 'updatedAt'>>): Promise<UnifiedNotifConfig> {
  const existing = await db.unifiedNotifConfigs.get(id).catch(() => null) as unknown as UnifiedNotifConfig | null
  if (!existing) {throw new Error(`Config no encontrada: ${id}`)}
  const updated = { ...existing, ...patch, updatedAt: nowIso() } as UnifiedNotifConfig
  if (updated.type === 'preparar_habitacion' && patch.time) {updated.times = [patch.time]}
  await db.unifiedNotifConfigs.put(updated as never)
  return updated
}

// Helpers puros para tests
export function isEnabled(cfg: UnifiedNotifConfig): boolean {
  return cfg.enabled
}
export function getSchedule(cfg: UnifiedNotifConfig): string[] {
  return cfg.type === 'preparar_habitacion' ? [cfg.time] : cfg.times
}
