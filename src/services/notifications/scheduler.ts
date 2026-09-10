// Scheduler de notificaciones locales (§24-29). Hora LOCAL del dispositivo, sin servidor.
// Limitación honesta: disparan mientras la app (o su contexto) está viva; en background
// dependen de la plataforma. Todo se persiste en localStorage.
import { sendNotification } from './push'

export type NotifKind = 'agua' | 'cuestionario' | 'recuperacion' | 'comoEstas' | 'proteina' | 'entrenamiento'

export interface NotifConfig {
  id: string
  kind: NotifKind
  title: string
  enabled: boolean
  times: string[] // ["10:00", ...] hora local HH:MM
  days: boolean[] // Lun..Dom (índice 0=Lunes)
  extra?: string // ej. objetivo proteína en g
}

const KEY = 'althea:notifs:v1'
const FIRED = 'althea:notifs:fired'

export const KIND_LABEL: Record<NotifKind, string> = {
  agua: 'Tomar agua',
  cuestionario: 'Completar cuestionario de recuperación',
  recuperacion: 'Recordatorio de recuperación',
  comoEstas: '¿Cómo estás hoy?',
  proteina: 'Objetivo de proteína',
  entrenamiento: 'Entrenamiento programado',
}

export const KIND_BODY: Record<NotifKind, string> = {
  agua: 'Hora de hidratarte 💧',
  cuestionario: 'Completá tu check-in diario de recuperación',
  recuperacion: 'Revisá tu recuperación de hoy',
  comoEstas: '¿Cómo estás hoy? Tocá para abrir el cuestionario',
  proteina: 'Revisá tu objetivo de proteína del día',
  entrenamiento: 'Hoy tenés entrenamiento programado',
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
  ]
}

export function loadConfigs(): NotifConfig[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const arr = JSON.parse(raw) as NotifConfig[]
      if (Array.isArray(arr)) return arr
    }
  } catch { /* noop */ }
  return defaultConfigs()
}

export function saveConfigs(cfgs: NotifConfig[]) {
  try { localStorage.setItem(KEY, JSON.stringify(cfgs)) } catch { /* noop */ }
}

function firedMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(FIRED) || '{}') } catch { return {} }
}
function markFired(id: string, date: string, time: string) {
  try {
    const m = firedMap()
    m[`${id}|${date}|${time}`] = new Date().toISOString()
    localStorage.setItem(FIRED, JSON.stringify(m))
  } catch { /* noop */ }
}
function wasFired(id: string, date: string, time: string): boolean {
  return !!firedMap()[`${id}|${date}|${time}`]
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

// Pura y testeable: qué notificaciones vencen AHORA (hora local, día habilitado, no disparadas hoy).
export function dueNotifications(cfgs: NotifConfig[], now: Date, isTrainingDay: (dateStr: string) => boolean = () => true): NotifConfig[] {
  const date = localDateStr(now)
  const time = localTimeStr(now)
  const day = localDayIdx(now)
  return cfgs.filter((c) => {
    if (!c.enabled || !c.days[day]) return false
    if (c.kind === 'entrenamiento' && !isTrainingDay(date)) return false
    return c.times.some((t) => t <= time && !wasFired(c.id, date, t))
  })
}

// Revisa y dispara (marca cada horario vencido). onOpen se usa para deep-link (cuestionario).
export async function checkAndFire(
  onOpen: (kind: NotifKind) => void = () => {},
  isTrainingDay: (dateStr: string) => boolean | Promise<boolean> = () => true,
): Promise<string[]> {
  const cfgs = loadConfigs()
  const now = new Date()
  const date = localDateStr(now)
  const time = localTimeStr(now)
  const trainingDay = await isTrainingDay(date)
  const due = dueNotifications(cfgs, now, () => trainingDay)
  const fired: string[] = []
  for (const c of due) {
    for (const t of c.times) {
      if (t <= time && !wasFired(c.id, date, t)) {
        const body = c.kind === 'proteina' && c.extra ? `Objetivo: ${c.extra}g de proteína hoy` : KIND_BODY[c.kind]
        try {
          const needsOpen = c.kind === 'comoEstas' || c.kind === 'cuestionario'
          const ok = await sendNotification(c.kind, c.title, body, needsOpen ? () => onOpen(c.kind) : undefined)
          if (ok) {
            markFired(c.id, date, t)
            fired.push(`${c.id}@${t}`)
          }
        } catch { /* noop: sin permiso o bloqueado, no reintentar en este ciclo */ }
      }
    }
  }
  return fired
}

export async function permissionStatus(): Promise<NotificationPermission> {
  try {
    if (!('Notification' in window)) return 'denied'
    return Notification.permission
  } catch { return 'denied' }
}

export async function requestPermission(): Promise<NotificationPermission> {
  try {
    if (!('Notification' in window)) return 'denied'
    return await Notification.requestPermission()
  } catch { return 'denied' }
}
