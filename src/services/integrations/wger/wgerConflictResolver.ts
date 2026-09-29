// wgerConflictResolver — Detección y resolución de conflictos.
// FASE 16: Conflictos.
//
// REGLAS:
// - No elegir automáticamente una fuente y borrar la otra.
// - Crear registro SyncConflict con snapshots de ambos lados.
// - Resoluciones: KEEP_LOCAL, KEEP_REMOTE, MERGE, SKIP.
// - Para campos que no puedan fusionarse de manera segura: SKIP + revisión.

import { db } from '@/services/storage/db'
import type { SyncOperation } from './wgerSyncEngine'

// ─── Tipos ───

export type ConflictResolution = 'KEEP_LOCAL' | 'KEEP_REMOTE' | 'MERGE' | 'SKIP'

export interface SyncConflict {
  id: string
  entityType: 'exercise' | 'routine' | 'ingredient'
  entityId: string
  provider: 'wger'
  localSnapshot: unknown
  remoteSnapshot: unknown
  detectedAt: string
  resolution: ConflictResolution | null
  resolvedAt: string | null
  resolvedBy: 'user' | 'system' | null
  mergeResult?: unknown
}

export interface ConflictDetectionResult {
  hasConflict: boolean
  conflict?: SyncConflict
  reason?: string
}

// ─── Detección de conflictos ───

export async function detectConflict(operation: {
  operation: SyncOperation | 'CONFLICT'
  entityType: string
  localEntityId: string
  remoteEntityId?: string
  payload?: unknown
}): Promise<ConflictDetectionResult> {
  const { entityType, localEntityId, remoteEntityId, payload } = operation

  // Buscar si existe una versión previa sincronizada
  const previousSync = await db.syncQueue
    .filter((op) =>
      op.localEntityId === localEntityId &&
      op.status === 'COMPLETED' &&
      op.entityType === entityType,
    )
    .first()

  if (!previousSync) {
    return { hasConflict: false }
  }

  // Si no hay remoteEntityId, no hay forma de comparar con el servidor
  if (!remoteEntityId) {
    return { hasConflict: false }
  }

  // Obtener el snapshot remoto actual
  // Para esto, necesitaríamos hacer fetch del recurso remoto
  // Por ahora, comparamos el hash del payload con el hash previo
  const previousHash = previousSync.payload?.hash
  const currentHash = payload && typeof payload === 'object' && 'hash' in payload
    ? (payload as { hash: string }).hash
    : null

  if (previousHash && currentHash && previousHash === currentHash) {
    return { hasConflict: false }
  }

  // Si llegamos aquí, hay un cambio desde la última sincronización
  // Verificamos si el cambio es solo local o también remoto
  const localChanged = previousHash !== currentHash

  // Para detectar si el remoto también cambió, necesitaríamos hacer fetch
  // del recurso remoto y comparar hashes. Por ahora, asumimos que si
  // el hash local cambió, podría haber conflicto.
  if (localChanged) {
    const conflict: SyncConflict = {
      id: `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      entityType: entityType as 'exercise' | 'routine' | 'ingredient',
      entityId: localEntityId,
      provider: 'wger',
      localSnapshot: payload,
      remoteSnapshot: null,
      detectedAt: new Date().toISOString(),
      resolution: null,
      resolvedAt: null,
      resolvedBy: null,
    }

    // Guardar el conflicto en la base de datos
    await db.syncQueue.add({
      id: conflict.id,
      operation: 'CONFLICT',
      entityType: conflict.entityType,
      localEntityId: conflict.entityId,
      remoteEntityId,
      payload: conflict,
      attempts: 0,
      createdAt: new Date().toISOString(),
      status: 'CONFLICT',
    })

    return {
      hasConflict: true,
      conflict,
      reason: 'Local changes detected since last sync',
    }
  }

  return { hasConflict: false }
}

// ─── Resolución de conflictos ───

export async function resolveConflict(
  conflictId: string,
  resolution: ConflictResolution,
): Promise<boolean> {
  try {
    const conflict = await db.syncQueue.get(conflictId)
    if (!conflict) {
      return false
    }

    const now = new Date().toISOString()

    switch (resolution) {
      case 'KEEP_LOCAL':
        // Mantener la versión local, marcar como resuelto
        await db.syncQueue.update(conflictId, {
          status: 'RESOLVED',
          payload: {
            ...conflict.payload,
            resolution: 'KEEP_LOCAL',
            resolvedAt: now,
            resolvedBy: 'user',
          },
        })
        break

      case 'KEEP_REMOTE':
        // Mantener la versión remota, marcar como resuelto
        await db.syncQueue.update(conflictId, {
          status: 'RESOLVED',
          payload: {
            ...conflict.payload,
            resolution: 'KEEP_REMOTE',
            resolvedAt: now,
            resolvedBy: 'user',
          },
        })
        break

      case 'MERGE':
        // Intentar fusionar ambas versiones
        const merged = await mergeSnapshots(conflict.payload)
        await db.syncQueue.update(conflictId, {
          status: 'RESOLVED',
          payload: {
            ...conflict.payload,
            resolution: 'MERGE',
            resolvedAt: now,
            resolvedBy: 'user',
            mergeResult: merged,
          },
        })
        break

      case 'SKIP':
        // Saltar este conflicto, requiere revisión manual
        await db.syncQueue.update(conflictId, {
          status: 'SKIPPED',
          payload: {
            ...conflict.payload,
            resolution: 'SKIP',
            resolvedAt: now,
            resolvedBy: 'user',
          },
        })
        break
    }

    return true
  } catch {
    return false
  }
}

// ─── Merge de snapshots ───

async function mergeSnapshots(payload: unknown): Promise<unknown> {
  if (!payload || typeof payload !== 'object') {
    return payload
  }

  const p = payload as { localSnapshot?: unknown; remoteSnapshot?: unknown }

  if (!p.localSnapshot || !p.remoteSnapshot) {
    return p.localSnapshot || p.remoteSnapshot
  }

  // Merge simple: combinar propiedades de ambos objetos
  // Para campos que no puedan fusionarse, se mantiene el valor local
  // y se marca para revisión
  const local = p.localSnapshot as Record<string, unknown>
  const remote = p.remoteSnapshot as Record<string, unknown>

  const merged: Record<string, unknown> = {}
  const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)])

  for (const key of allKeys) {
    const localVal = local[key]
    const remoteVal = remote[key]

    if (JSON.stringify(localVal) === JSON.stringify(remoteVal)) {
      merged[key] = localVal
    } else if (localVal === undefined) {
      merged[key] = remoteVal
    } else if (remoteVal === undefined) {
      merged[key] = localVal
    } else {
      // Conflicto en este campo: mantener local y marcar para revisión
      merged[key] = localVal
      merged[`_${key}_conflict`] = { local: localVal, remote: remoteVal }
    }
  }

  return merged
}

// ─── Obtener conflictos pendientes ───

export async function getPendingConflicts(): Promise<SyncConflict[]> {
  const conflicts = await db.syncQueue
    .filter((op) => op.status === 'CONFLICT')
    .toArray()

  return conflicts.map((op) => op.payload as SyncConflict)
}

// ─── Obtener conflictos resueltos ───

export async function getResolvedConflicts(): Promise<SyncConflict[]> {
  const conflicts = await db.syncQueue
    .filter((op) => op.status === 'RESOLVED' || op.status === 'SKIPPED')
    .toArray()

  return conflicts.map((op) => op.payload as SyncConflict)
}
