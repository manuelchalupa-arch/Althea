// wgerHealth — Estado de sincronización y salud de la integración.
// FASE 20: Cache + offline-first.
//
// REGLAS:
// - ONLINE: WGER → actualiza Dexie.
// - OFFLINE: Dexie → Althea funciona normalmente.
// - Nunca: WGER caído → Althea rota.
// - Permitir al usuario saber: Última sincronización: fecha y hora, Estado: Sincronizado.

import { db } from '@/services/storage/db'
import { getQueueStats, type QueueStats } from './wgerSyncQueue'

// ─── Tipos ───

export type WgerSyncStatus =
  | 'SYNCED'
  | 'SYNCING'
  | 'FAILED'
  | 'CONFLICT'
  | 'PENDING'
  | 'SKIPPED'
  | 'READ_ONLY'

export interface WgerHealthInfo {
  status: WgerSyncStatus
  lastRemoteSyncAt: string | null
  lastSuccessfulSyncAt: string | null
  syncStatus: WgerSyncStatus
  remoteVersion: string | null
  remoteHash: string | null
  queueStats: QueueStats
  isOnline: boolean
  message: string
}

// ─── Estado en memoria (persistente en Dexie) ───

let currentStatus: WgerSyncStatus = 'SYNCED'
let lastRemoteSyncAt: string | null = null
let lastSuccessfulSyncAt: string | null = null
let remoteVersion: string | null = null
let remoteHash: string | null = null

// ─── Obtener estado de sincronización ───

export function getSyncStatus(): WgerSyncStatus {
  return currentStatus
}

export function getLastRemoteSyncAt(): string | null {
  return lastRemoteSyncAt
}

export function getLastSuccessfulSyncAt(): string | null {
  return lastSuccessfulSyncAt
}

export function getRemoteVersion(): string | null {
  return remoteVersion
}

export function getRemoteHash(): string | null {
  return remoteHash
}

// ─── Actualizar estado ───

export function updateSyncStatus(status: WgerSyncStatus): void {
  currentStatus = status
  lastRemoteSyncAt = new Date().toISOString()

  if (status === 'SYNCED') {
    lastSuccessfulSyncAt = lastRemoteSyncAt
  }

  // Persistir en Dexie para sobrevivir recargas
  persistHealthStatus()
}

export function setRemoteVersion(version: string): void {
  remoteVersion = version
  persistHealthStatus()
}

export function setRemoteHash(hash: string): void {
  remoteHash = hash
  persistHealthStatus()
}

// ─── Persistencia en Dexie ───

async function persistHealthStatus(): Promise<void> {
  try {
    await db.syncQueue.put({
      id: 'health-status',
      operation: 'update',
      entityType: 'exercise',
      localEntityId: 'health-status',
      payload: {
        status: currentStatus,
        lastRemoteSyncAt,
        lastSuccessfulSyncAt,
        remoteVersion,
        remoteHash,
        updatedAt: new Date().toISOString(),
      },
      attempts: 0,
      createdAt: new Date().toISOString(),
      status: 'COMPLETED',
    })
  } catch {
    // No crashear si no se puede persistir
  }
}

export async function loadHealthStatus(): Promise<void> {
  try {
    const saved = await db.syncQueue.get('health-status')
    if (saved?.payload && typeof saved.payload === 'object') {
      const p = saved.payload as {
        status?: WgerSyncStatus
        lastRemoteSyncAt?: string
        lastSuccessfulSyncAt?: string
        remoteVersion?: string
        remoteHash?: string
      }
      currentStatus = p.status || 'SYNCED'
      lastRemoteSyncAt = p.lastRemoteSyncAt || null
      lastSuccessfulSyncAt = p.lastSuccessfulSyncAt || null
      remoteVersion = p.remoteVersion || null
      remoteHash = p.remoteHash || null
    }
  } catch {
    // No crashear si no se puede cargar
  }
}

// ─── Obtener información completa de salud ───

export async function getHealthInfo(): Promise<WgerHealthInfo> {
  const queueStats = await getQueueStats()
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

  let message = 'Sincronizado'

  if (!isOnline) {
    message = 'Sin conexión — usando datos locales'
  } else if (currentStatus === 'SYNCING') {
    message = 'Sincronizando...'
  } else if (currentStatus === 'FAILED') {
    message = 'Error de sincronización'
  } else if (currentStatus === 'CONFLICT') {
    message = 'Conflictos pendientes de resolución'
  } else if (queueStats.pending > 0) {
    message = `${queueStats.pending} operaciones pendientes`
  }

  return {
    status: currentStatus,
    lastRemoteSyncAt,
    lastSuccessfulSyncAt,
    syncStatus: currentStatus,
    remoteVersion,
    remoteHash,
    queueStats,
    isOnline,
    message,
  }
}

// ─── Verificar si está sincronizado ───

export function isSynced(): boolean {
  return currentStatus === 'SYNCED'
}

// ─── Verificar si hay conflictos ───

export function hasConflicts(): boolean {
  return currentStatus === 'CONFLICT'
}

// ─── Verificar si hay operaciones pendientes ───

export async function hasPendingOperations(): Promise<boolean> {
  const stats = await getQueueStats()
  return stats.pending > 0
}

// ─── Resetear estado (para testing o logout) ───

export function resetHealthStatus(): void {
  currentStatus = 'SYNCED'
  lastRemoteSyncAt = null
  lastSuccessfulSyncAt = null
  remoteVersion = null
  remoteHash = null
}

// ─── Formatear fecha para mostrar al usuario ───

export function formatLastSyncTime(date: string | null): string {
  if (!date) {
    return 'Nunca'
  }

  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) {
    return 'Ahora mismo'
  }
  if (diffMins < 60) {
    return `Hace ${diffMins} min`
  }
  if (diffHours < 24) {
    return `Hace ${diffHours} h`
  }
  if (diffDays < 7) {
    return `Hace ${diffDays} días`
  }

  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
