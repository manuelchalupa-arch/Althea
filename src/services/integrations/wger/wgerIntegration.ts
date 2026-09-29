// wgerIntegration — Interfaz estable de integración WGER.
// FASE 1: Reglas arquitectónicas — toda interacción pasa por servicios.
// FASE 2: Identidad y vínculos — ExternalAccountLink y ExternalEntityLink.
// FASE 3: Autenticación segura — no almacenar credenciales en Dexie.
// FASE 24: API interna estable — interfaz unificada para toda la integración.
//
// REGLAS:
// - No acoplar componentes React a esta interfaz.
// - Toda la lógica de negocio vive en servicios.
// - La interfaz es el único punto de contacto con el exterior.

import type { ExternalAccountLink, ExternalEntityLink } from './wgerTypes'
import type { WgerExerciseInfo, WgerExerciseListItem, WgerListResponse } from './wgerTypes'
import type { WgerExerciseRecord } from './wgerAdapter'
import type { SyncResult } from './wgerSyncEngine'
import type { WgerHealthInfo } from './wgerHealth'

// ─── Tipos de la interfaz estable ───

export interface IntegrationHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  isOnline: boolean
  lastSyncAt: string | null
  remoteVersion: string | null
  queuePending: number
  queueFailed: number
  message: string
}

export interface FullSyncResult {
  success: boolean
  exercises: SyncResult
  ingredients: SyncResult
  routines: SyncResult
  trainingHistory: SyncResult
  nutritionPlans: SyncResult
  measurements: SyncResult
  totalDurationMs: number
  errors: string[]
}

// ─── Interfaz estable WGER ───

export interface WgerIntegration {
  // ─── Salud y estado ───
  healthCheck(): Promise<IntegrationHealth>

  // ─── Lectura pública (sin auth) ───
  fetchExerciseList(opts?: { limit?: number; offset?: number; language?: number }, signal?: AbortSignal): Promise<WgerListResponse<WgerExerciseListItem>>
  fetchExerciseInfo(id: number, signal?: AbortSignal): Promise<WgerExerciseInfo>

  // ─── Importación a Dexie ───
  importSample(sampleSize?: number, onProgress?: (imported: number, total: number) => void): Promise<WgerExerciseRecord[]>
  listImported(): Promise<WgerExerciseRecord[]>

  // ─── Vinculación de entidades (FASE 2) ───
  linkEntity(altheaEntityId: string, externalEntityId: string, externalEntityUuid: string, entityType: ExternalEntityLink['entityType']): Promise<ExternalEntityLink>
  unlinkEntity(linkId: string): Promise<void>
  getEntityLink(altheaEntityId: string): Promise<ExternalEntityLink | null>
  getEntityLinkByExternal(externalEntityId: string): Promise<ExternalEntityLink | null>
  listEntityLinks(): Promise<ExternalEntityLink[]>

  // ─── Vinculación de cuentas (FASE 2) ───
  linkAccount(altheaUserId: string, externalUserId: string, externalUsername: string): Promise<ExternalAccountLink>
  unlinkAccount(linkId: string): Promise<void>
  getAccountLink(altheaUserId: string): Promise<ExternalAccountLink | null>
  getAccountLinkByExternal(externalUserId: string): Promise<ExternalAccountLink | null>
  listAccountLinks(): Promise<ExternalAccountLink[]>

  // ─── Autenticación (FASE 3) ───
  isAuthenticated(): boolean
  getAuthStatus(): 'public-only' | 'authenticated'

  // ─── Pull: WGER → Althea ───
  pullExercises(): Promise<SyncResult>
  pullIngredients(): Promise<SyncResult>
  pullRoutines(): Promise<SyncResult>
  pullTrainingHistory(): Promise<SyncResult>
  pullNutritionPlans(): Promise<SyncResult>
  pullMeasurements(): Promise<SyncResult>

  // ─── Push: Althea → WGER ───
  pushRoutine(id: string): Promise<SyncResult>
  pushTrainingSession(id: string): Promise<SyncResult>
  pushNutritionPlan(id: string): Promise<SyncResult>

  // ─── Sincronización completa ───
  sync(): Promise<FullSyncResult>
}
