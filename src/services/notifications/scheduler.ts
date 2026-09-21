// Scheduler de notificaciones locales (§24-29). Hora LOCAL del dispositivo, sin servidor.
// Limitación honesta: disparan mientras la app (o su contexto) está viva; en background
// dependen de la plataforma. Fuente canónica: Dexie (notifConfigs + notifLog).
import { sendNotification } from './push'
import { db } from '@/services/storage/db'

export type NotifKind = 'agua' | 'cuestionario' | 'recuperacion' | 'comoEstas' | 'proteina' | 'entrenamiento' | 'coach'

export interface NotifConfig {
  id: string
  kind: NotifKind
  title: string
  enabled: boolean
  times: string[] // ["10:00", ...] hora local HH:MM
  days: boolean[] // Lun..Dom (índice 0=Lunes)
  extra?: string // ej. objetivo proteína en g
}

const LEGACY_KEY = 'althea:notifs:v1'
const LEGACY_FIRED = 'althea:notifs:fired'

export const KIND_LABEL: Record<NotifKind, string> = {
  agua: 'Tomar agua',
  cuestionario: 'Completar cuestionario de recuperación',
  recuperacion: 'Recordatorio de recuperación',
  comoEstas: '¿Cómo estás hoy?',
  proteina: 'Objetivo de proteína',
  entrenamiento: 'Entrenamiento programado',
  coach: 'Revisar progreso con el Coach',
}

export const KIND_BODY: Record<NotifKind, string> = {
  agua: 'Hora de hidratarte 💧',
  cuestionario: 'Completá tu check-in diario de recuperación',
  recuperacion: 'Revisá tu recuperación de hoy',
  comoEstas: '¿Cómo estás hoy? Tocá para abrir el cuestionario',
  proteina: 'Revisá tu objetivo de proteína del día',
  entrenamiento: 'Hoy tenés entrenamiento programado',
  coach: 'Tenés datos nuevos para revisar con el Coach',
}

export function defaultConfigs(): NotifConfig[] {
  const allDays = [true, true, true, true, true, false, false]
  return [
    { id: 'agua', kind: 'agua', title: 'Tomar agua', enabled: false, times: ['10:00', '12:00', '14:00', '16:00', '18:00'], days: allDays },
    { id: 'cuestionario', kind: 'cuestionario', title: 'Check-in de recuperación', enabled: false, times: ['21:00'], days: allDays },
    { id: 'recuperacion', kind: 'recuperacion', title: 'Recordatorio de recuperación', enabled: false, times: ['09:00'], days: allDays },
    { id: 'comoEstas', kind: 'comoEstas', title: '¿Cómo estás hoy?', enabled: false, times: ['08:00'], days: allDays },
    { id: 'proteina', kind: 'proteina', title: 'Objetivo de proteína', enabled: false, times: ['13:00'], days: allDays, extra: '' },
    { id: 'entrenamiento', kind: 'entrenamiento', title: 'Entrenamiento programado', enabled: false, times: ['07:30'], days: allDays },
    { id: 'coach', kind: 'coach', title: 'Revisar progreso con el Coach', enabled: false, times: ['19:00'], days: allDays },
  ]
}

// Completa kinds faltantes (p. ej. 'coach' en instalaciones previas) sin tocar el resto.
export function ensureKinds(cfgs: NotifConfig[]): NotifConfig[] {
  const have = new Set(cfgs.map(c => c.id))
  const missing = defaultConfigs().filter(d => !have.has(d.id))
  return missing.length ? [...cfgs, ...missing] : cfgs
}

async function migrateFromLocalStorage(): Promise<void> {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (raw) {
      const arr = JSON.parse(raw) as NotifConfig[]
      if (Array.isArray(arr) && arr.length > 0) {
        const existing = await db.notifConfigs.toArray().catch(() => [])
        if (existing.length === 0) {
          await db.notifConfigs.bulkPut(arr as never[]).catch(() => {})
        }
      }
      localStorage.removeItem(LEGACY_KEY)
    }
    const firedRaw = localStorage.getItem(LEGACY_FIRED)
    if (firedRaw) {
      try {
        const m = JSON.parse(firedRaw) as Record<string, string>
        const rows = Object.entries(m).map(([id, at]) => {
          const [configId, date, time] = id.split('|')
          return { id, configId, date, time, at }
        })
        if (rows.length > 0) {
          await db.notifLog.bulkPut(rows as never[]).catch(() => {})
        }
      } catch { /* noop */ }
      localStorage.removeItem(LEGACY_FIRED)
    }
  } catch { /* best-effort */ }
}

export async function loadConfigs(): Promise<NotifConfig[]> {
  await migrateFromLocalStorage()
  const rows = await db.notifConfigs.toArray().catch(() => []) as unknown as NotifConfig[]
  if (rows.length === 0) {
    const defaults = defaultConfigs()
    await db.notifConfigs.bulkPut(defaults as never[]).catch(() => {})
    return defaults
  }
  const merged = ensureKinds(rows)
  if (merged.length !== rows.length) {
    await db.notifConfigs.bulkPut(merged as never[]).catch(() => {})
  }
  return merged
}

export async function saveConfigs(cfgs: NotifConfig[]): Promise<void> {
  const ids = new Set(cfgs.map(c => c.id))
  const existing = await db.notifConfigs.toArray().catch(() => []) as unknown as NotifConfig[]
  const toDelete = existing.filter(e => !ids.has(e.id)).map(e => e.id)
  if (toDelete.length) { await db.notifConfigs.bulkDelete(toDelete).catch(() => {}) }
  if (cfgs.length) { await db.notifConfigs.bulkPut(cfgs as never[]).catch(() => {}) }
}

export function firedId(id: string, date: string, time: string): string {
  return `${id}|${date}|${time}`
}

export async function loadFiredSet(date: string): Promise<Set<string>> {
  const rows = await db.notifLog.where('date').equals(date).toArray().catch(() => []) as unknown as { id: string }[]
  return new Set(rows.map(r => r.id))
}

async function markFired(id: string, date: string, time: string): Promise<void> {
  await db.notifLog.put({ id: firedId(id, date, time), configId: id, date, time, at: new Date().toISOString() } as never).catch(() => {})
}

export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function localTimeStr(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
// 0=Lunes..6=Domingo en hora local
export function localDayIdx(d: Date = new Date()): number {
  return (d.getDay() + 6) % 7
}

// Pura y testeable: qué notificaciones vencen AHORA (hora local, día habilitado,
// no disparadas hoy según el set persistido).
export function dueNotifications(
  cfgs: NotifConfig[],
  now: Date,
  isTrainingDay: (dateStr: string) => boolean = () => true,
  fired: Set<string> = new Set(),
): NotifConfig[] {
  const date = localDateStr(now)
  const time = localTimeStr(now)
  const day = localDayIdx(now)
  return cfgs.filter((c) => {
    if (!c.enabled || !c.days[day]) { return false }
    if (c.kind === 'entrenamiento' && !isTrainingDay(date)) { return false }
    return c.times.some((t) => t <= time && !fired.has(firedId(c.id, date, t)))
  })
}

export interface GateContext {
  hydrationMet: boolean
  recoveryDone: boolean
  goalsPersonalized: boolean
  hasCoachData: boolean
}

// Puertas de realidad por categoría: sin la condición que la justifica,
// la notificación no se genera (aunque esté vencida y habilitada).
export function passesGates(c: NotifConfig, gates: GateContext): boolean {
  switch (c.kind) {
    case 'agua':
      return !gates.hydrationMet
    case 'cuestionario':
    case 'comoEstas':
    case 'recuperacion':
      return !gates.recoveryDone
    case 'proteina':
      return gates.goalsPersonalized
    case 'coach':
      return gates.hasCoachData
    case 'entrenamiento':
      return true
    default:
      return true
  }
}

async function buildGates(): Promise<GateContext> {
  const today = localDateStr()
  let hydrationMet = false
  try {
    const { getTodayHydration, getHydrationGoal } = await import('@/services/recovery/recoveryService')
    const [h, g] = await Promise.all([getTodayHydration(), getHydrationGoal()])
    hydrationMet = h >= g
  } catch { /* noop */ }
  let recoveryDone = false
  try {
    const rec = await db.recoveryChecks.get(today).catch(() => null) as { score?: number } | null
    recoveryDone = typeof rec?.score === 'number'
  } catch { /* noop */ }
  let goalsPersonalized = false
  try {
    const p = await db.userProfile.get('me').catch(() => null) as { weightKg?: number; heightCm?: number } | null
    goalsPersonalized = Boolean(p?.weightKg && p?.heightCm)
  } catch { /* noop */ }
  let hasCoachData = false
  try {
    const [sessions, decisions] = await Promise.all([
      db.trainingSessions.count().catch(() => 0),
      db.coachMemory.count().catch(() => 0),
    ])
    hasCoachData = sessions > 0 || decisions > 0
  } catch { /* noop */ }
  return { hydrationMet, recoveryDone, goalsPersonalized, hasCoachData }
}

// Revisa y dispara (marca cada horario vencido). onOpen se usa para deep-link (cuestionario).
// Nunca crea datos de dominio: solo notifica. No pide permiso (solo Perfil lo pide).
export async function checkAndFire(
  onOpen: (kind: NotifKind) => void = () => {},
  isTrainingDay: (dateStr: string) => boolean | Promise<boolean> = () => true,
): Promise<string[]> {
  const cfgs = await loadConfigs()
  const now = new Date()
  const date = localDateStr(now)
  const time = localTimeStr(now)
  const trainingDay = await isTrainingDay(date)
  const fired = await loadFiredSet(date)
  const gates = await buildGates()
  const due = dueNotifications(cfgs, now, () => trainingDay, fired).filter(c => passesGates(c, gates))
  const firedOut: string[] = []
  for (const c of due) {
    for (const t of c.times) {
      const key = firedId(c.id, date, t)
      if (t <= time && !fired.has(key)) {
        const body = c.kind === 'proteina' && c.extra ? `Objetivo: ${c.extra}g de proteína hoy` : KIND_BODY[c.kind] ?? c.title
        try {
          const needsOpen = c.kind === 'comoEstas' || c.kind === 'cuestionario'
          const ok = await sendNotification(c.kind, c.title, body, needsOpen ? () => onOpen(c.kind) : undefined)
          if (ok) {
            await markFired(c.id, date, t)
            fired.add(key)
            firedOut.push(`${c.id}@${t}`)
          }
        } catch { /* noop: sin permiso o bloqueado, no reintentar en este ciclo */ }
      }
    }
  }
  return firedOut
}

export async function permissionStatus(): Promise<NotificationPermission> {
  try {
    if (!('Notification' in window)) { return 'denied' }
    return Notification.permission
  } catch { return 'denied' }
}

export function platformSupport(): { api: boolean; serviceWorker: boolean } {
  let api = false
  let sw = false
  try { api = 'Notification' in window } catch { /* noop */ }
  try { sw = 'serviceWorker' in navigator } catch { /* noop */ }
  return { api, serviceWorker: sw }
}

export async function requestPermission(): Promise<NotificationPermission> {
  try {
    if (!('Notification' in window)) { return 'denied' }
    if (Notification.permission === 'granted' || Notification.permission === 'denied') { return Notification.permission }
    return await Notification.requestPermission()
  } catch { return 'denied' }
}
