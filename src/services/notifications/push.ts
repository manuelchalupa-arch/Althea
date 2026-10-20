// Envío de notificaciones locales vía Notification API (in-app).
// Honesto: devuelve false si no hay permiso, plataforma o si falla.
// NUNCA pide permiso aquí (solo la UI de Perfil lo pide ante acción explícita).
// Sin topes legacy ni fuentes paralelas: el scheduler deduplica por horario.
import { db } from '@/services/storage/db'

export type PushType = 'seguimiento' | 'pre-entreno' | 'agua' | 'cuestionario' | 'recuperacion' | 'comoEstas' | 'proteina' | 'entrenamiento' | 'coach'

function platformAvailable(): boolean {
  try { return typeof Notification !== 'undefined' && 'Notification' in window } catch { return false }
}

function permissionGranted(): boolean {
  try { return platformAvailable() && Notification.permission === 'granted' } catch { return false }
}

export async function sendNotification(_type: PushType, title: string, body: string, onClick?: () => void): Promise<boolean> {
  if (!platformAvailable()) { return false }
  if (!permissionGranted()) { return false }
  try {
    const n = new Notification(title, { body, icon: '/icons/icon-192.png' })
    if (onClick) { n.onclick = (e) => { e.preventDefault(); try { window.focus() } catch { /* noop */ } onClick() } }
    return true
  } catch { return false }
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
