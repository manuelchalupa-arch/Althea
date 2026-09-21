import { db } from '@/services/storage/db'
import { pendingOps, markSyncing, markDoneIfUnchanged, markError, pendingCount, type SyncOp, type RemoteAdapter } from './opQueue'
import { remoteDocId } from '@/services/firebase/sync'

// Motor de sincronización (FASE 8): Dexie manda, el remoto es backup.
// - Lee la fila actual al sincronizar (payload fresco, reintentos seguros).
// - Idempotent: doc ids estables + merge → reprocesar no duplica.
// - Nunca elimina la operación antes de confirmar el éxito.
// - Tolera offline, cierre, recarga y errores parciales.
export interface ProcessSummary {
  done: string[]
  failed: { id: string; error: string }[]
  pending: number
  offline: boolean
}

function isDemoRow(row: unknown): boolean {
  return (row as { isDemo?: boolean })?.isDemo === true
}

async function readRow(table: string, key: string): Promise<Record<string, unknown> | null> {
  try {
    const t = db.table(table)
    const direct = await t.get(key).catch(() => null)
    if (direct) { return direct as Record<string, unknown> }
    for (const field of ['sessionId', 'setRecordId', 'sessionExerciseId', 'id', 'date', 'localDate']) {
      try {
        const found = await t.where(field).equals(key).first().catch(() => null)
        if (found) { return found as Record<string, unknown> }
      } catch { /* índice inexistente: seguir */ }
    }
  } catch { /* noop */ }
  return null
}

async function collectSessionDocs(sessionId: string): Promise<Array<{ table: string; row: Record<string, unknown> }>> {
  const out: Array<{ table: string; row: Record<string, unknown> }> = []
  try {
    const sessions = await db.trainingSessions.where('sessionId').equals(sessionId).toArray().catch(() => [])
    const legacy = await db.sessions.where('id').equals(sessionId).toArray().catch(() => [])
    const allSessions = [...sessions, ...legacy]
    if (allSessions.length === 0) {
      const byId = await db.trainingSessions.get(sessionId).catch(() => null)
      if (byId) { allSessions.push(byId as never) }
    }
    for (const s of allSessions) { out.push({ table: 'trainingSessions', row: s as unknown as Record<string, unknown> }) }
    const seIds = new Set<string>()
    const seList = await db.sessionExercises.where('sessionId').equals(sessionId).toArray().catch(() => [])
    for (const se of seList) {
      out.push({ table: 'sessionExercises', row: se as unknown as Record<string, unknown> })
      if ((se as { sessionExerciseId?: string }).sessionExerciseId) { seIds.add((se as { sessionExerciseId: string }).sessionExerciseId) }
    }
    const sets = await db.setRecords.where('sessionId').equals(sessionId).toArray().catch(() => [])
    for (const r of sets) {
      out.push({ table: 'setRecords', row: r as unknown as Record<string, unknown> })
      if ((r as { sessionExerciseId?: string }).sessionExerciseId) { seIds.add((r as { sessionExerciseId: string }).sessionExerciseId) }
    }
    for (const t of ['sessionEvents', 'postWorkoutSurveys', 'negativeSets', 'exerciseObservations'] as const) {
      try {
        const rows = await db.table(t).where('sessionId').equals(sessionId).toArray().catch(() => [])
        for (const r of rows) { out.push({ table: t, row: r as Record<string, unknown> }) }
      } catch { /* tabla sin índice sessionId: omitir */ }
    }
    void seIds
  } catch { /* noop */ }
  return out.filter(d => !isDemoRow(d.row))
}

async function uploadDoc(remote: RemoteAdapter, table: string, row: Record<string, unknown>, index: number): Promise<void> {
  const clean = JSON.parse(JSON.stringify(row)) as Record<string, unknown>
  delete (clean as { isDemo?: boolean }).isDemo
  await remote.upload(table, remoteDocId(table, clean, index), clean)
}

export async function processQueue(uid: string, remote: RemoteAdapter): Promise<ProcessSummary> {
  void uid
  const done: string[] = []
  const failed: { id: string; error: string }[] = []
  let offline = false
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) { offline = true }
  } catch { /* noop */ }
  if (offline) {
    return { done, failed, pending: await pendingCount(), offline: true }
  }
  const ops: SyncOp[] = await pendingOps()
  let index = 0
  for (const op of ops) {
    const readAt = op.updatedAt
    await markSyncing(op.id)
    try {
      if (op.table === 'trainingSessions') {
        const docs = await collectSessionDocs(op.key)
        for (const d of docs) {
          await uploadDoc(remote, d.table, d.row, index++)
        }
      } else {
        const row = await readRow(op.table, op.key)
        if (row) {
          if (isDemoRow(row)) {
            await markDoneIfUnchanged(op.id, readAt)
            done.push(op.id)
            continue
          }
          await uploadDoc(remote, op.table, row, index++)
        }
        // Fila inexistente localmente: nada que subir → se confirma igual.
      }
      await markDoneIfUnchanged(op.id, readAt)
      done.push(op.id)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'error de sincronización'
      await markError(op.id, message)
      failed.push({ id: op.id, error: message })
    }
  }
  return { done, failed, pending: await pendingCount(), offline: false }
}
