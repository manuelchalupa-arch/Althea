import { db } from '@/services/storage/db'

// Cola de operaciones de sincronización (FASE 8) sobre la tabla Dexie
// `syncQueue` existente. Las operaciones son punteros (tabla + clave), no
// snapshots: el motor lee la fila actual de Dexie al sincronizar, por lo
// que reintentos y reprocesos usan siempre el dato más fresco.
//
// - id determinista `${table}:${key}` → reencolar no duplica;
// - una operación solo se elimina tras éxito confirmado;
// - fallos quedan recuperables (attempts + error) y sobreviven al reload.
export type SyncOpStatus = 'pending' | 'syncing' | 'error'

export interface SyncOp {
  id: string
  table: string
  key: string
  status: SyncOpStatus
  attempts: number
  error?: string
  createdAt: string
  updatedAt: string
}

export const MAX_ATTEMPTS = 10

// Destino remoto de sincronización. La implementación real es Firestore;
// los tests inyectan un fake en memoria. Solo transporte: nunca lógica de dominio.
export interface RemoteAdapter {
  upload(table: string, docId: string, data: Record<string, unknown>): Promise<void>
}

export function opIdFor(table: string, key: string): string {
  return `${table}:${key}`
}

// Encola (idempotente). Nunca falla hacia el llamante: lo local ya está guardado.
export async function enqueueOp(table: string, key: string): Promise<void> {
  try {
    const id = opIdFor(table, key)
    const now = new Date().toISOString()
    const existing = await db.syncQueue.get(id).catch(() => null) as unknown as SyncOp | null
    if (existing) {
      // Si estaba en vuelo, vuelve a pendiente con el payload fresco al procesar.
      if (existing.status === 'syncing') {
        await db.syncQueue.update(id, { status: 'pending', updatedAt: now } as never).catch(() => {})
      }
      return
    }
    await db.syncQueue.put({
      id, table, key, status: 'pending', attempts: 0, createdAt: now, updatedAt: now,
    } as never)
  } catch { /* noop: la escritura local ya ocurrió */ }
}

export async function pendingOps(limit = 200): Promise<SyncOp[]> {
  const all = await db.syncQueue.toArray().catch(() => []) as unknown as SyncOp[]
  return all
    .filter(o => o && (o.status === 'pending' || (o.status === 'error' && o.attempts < MAX_ATTEMPTS)))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .slice(0, limit)
}

export async function pendingCount(): Promise<number> {
  const all = await db.syncQueue.toArray().catch(() => []) as unknown as SyncOp[]
  return all.filter(o => o && (o.status === 'pending' || (o.status === 'error' && o.attempts < MAX_ATTEMPTS))).length
}

export async function errorCount(): Promise<number> {
  const all = await db.syncQueue.toArray().catch(() => []) as unknown as SyncOp[]
  return all.filter(o => o && o.status === 'error').length
}

export async function markSyncing(id: string): Promise<void> {
  await db.syncQueue.update(id, { status: 'syncing', updatedAt: new Date().toISOString() } as never).catch(() => {})
}

// Elimina solo si nadie la reencoló mientras se procesaba (updatedAt igual).
export async function markDoneIfUnchanged(id: string, updatedAtAtRead: string): Promise<void> {
  try {
    const cur = await db.syncQueue.get(id).catch(() => null) as unknown as SyncOp | null
    if (cur && cur.updatedAt === updatedAtAtRead) {
      await db.syncQueue.delete(id)
    }
  } catch { /* noop */ }
}

export async function markError(id: string, message: string): Promise<void> {
  try {
    const cur = await db.syncQueue.get(id).catch(() => null) as unknown as SyncOp | null
    if (!cur) { return }
    await db.syncQueue.update(id, {
      status: 'error',
      attempts: (cur.attempts || 0) + 1,
      error: String(message || 'error').slice(0, 300),
      updatedAt: new Date().toISOString(),
    } as never)
  } catch { /* noop */ }
}

export async function clearDoneOps(): Promise<void> {
  // Las done se eliminan al confirmar; esto es solo higiene ante restos.
  try {
    const all = await db.syncQueue.toArray().catch(() => []) as unknown as SyncOp[]
    const stale = all.filter(o => o && o.status !== 'pending' && o.status !== 'syncing' && o.status !== 'error')
    for (const o of stale) { await db.syncQueue.delete(o.id).catch(() => {}) }
  } catch { /* noop */ }
}
