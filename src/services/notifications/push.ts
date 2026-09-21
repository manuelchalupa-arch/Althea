// Envío de notificaciones locales vía Notification API (in-app).
// Honesto: devuelve false si no hay permiso, plataforma o si falla.
// NUNCA pide permiso aquí (solo la UI de Perfil lo pide ante acción explícita).
// Sin topes legacy ni fuentes paralelas: el scheduler deduplica por horario.
import { db } from '@/services/storage/db'

export type PushType = 'seguimiento' | 'pre-entreno' | 'agua' | 'cuestionario' | 'recuperacion' | 'comoEstas' | 'proteina' | 'entrenamiento' | 'coach'

function todayStr() { return new Date().toISOString().slice(0, 10) }

function platformAvailable(): boolean {
  try { return typeof Notification !== 'undefined' && 'Notification' in window } catch { return false }
}

function permissionGranted(): boolean {
  try { return platformAvailable() && Notification.permission === 'granted' } catch { return false }
}

export async function sendNotification(type: PushType, title: string, body: string, onClick?: () => void): Promise<boolean> {
  if (!platformAvailable()) { return false }
  if (!permissionGranted()) { return false }
  try {
    const n = new Notification(title, { body, icon: '/icons/icon-192.png' })
    if (onClick) { n.onclick = (e) => { e.preventDefault(); try { window.focus() } catch { /* noop */ } onClick() } }
    return true
  } catch { return false }
}

export function schedulePreEntreno(trainingTime: string) {
  // trainingTime "18:00" → notif 45 min antes si es hoy y aún no entrenó.
  // Solo in-app (setTimeout): si la app está cerrada no dispara (limitación declarada).
  const [h, m] = trainingTime.split(':').map(Number)
  const now = new Date(); const target = new Date(); target.setHours(h, m - 45, 0, 0)
  const delay = target.getTime() - now.getTime()
  if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
    setTimeout(() => sendNotification('pre-entreno', 'En 45 min entrenás', 'Revisá la rutina y preparate.'), delay)
  }
}

// ===== Notification Log API (Dexie; estados verificables) =====
export interface NotificationLogEntry {
  id: string
  type: PushType
  title: string
  body: string
  date: string
  time: string
  sent: boolean
  error?: string
}

export async function getNotificationLog(): Promise<NotificationLogEntry[]> {
  const rows = await db.notifLog.toArray().catch(() => []) as unknown as NotificationLogEntry[]
  return rows
    .filter(r => r && r.type)
    .sort((a, b) => (String(a.date) + String(a.time) < String(b.date) + String(b.time) ? 1 : -1))
    .slice(0, 100)
}

export async function addNotificationLog(entry: Omit<NotificationLogEntry, 'id'>): Promise<string> {
  const id = `${entry.date}T${entry.time}:${entry.type}`
  await db.notifLog.put({ ...entry, id } as never).catch(() => {})
  return id
}

export async function clearNotificationLog(): Promise<void> {
  await db.notifLog.clear().catch(() => {})
}
