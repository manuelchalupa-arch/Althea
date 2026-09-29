// wgerClient — Cliente HTTP para la API REST Wger /api/v2/.
// FASE 1: Reglas arquitectónicas — capa de acceso a datos externos.
// FASE 3: Autenticación segura — solo lectura pública, sin credenciales.
// FASE 26: Patrón de cliente TypeScript con timeout y manejo de errores.
//
// REGLAS:
// - NO almacenar credenciales permanentes del usuario en el navegador.
// - NO almacenar tokens en localStorage.
// - Solo consume los endpoints necesarios. Sin autenticación para lectura.
// - La API es pública para GET; no se usan tokens.

import type {
  WgerListResponse,
  WgerExerciseListItem,
  WgerExerciseInfo,
  WgerRoutineListItem,
  WgerRoutineDetail,
  WgerDay,
  WgerSlot,
  WgerSlotEntry,
  WgerWeightConfig,
  WgerRepetitionsConfig,
  WgerSetsConfig,
  WgerRirConfig,
  WgerRestConfig,
  ExternalAccountLink,
  ExternalEntityLink,
} from './wgerTypes'
import type { WgerIntegration, IntegrationHealth, FullSyncResult } from './wgerIntegration'
import type { SyncResult } from './wgerSyncEngine'
import { getWgerAuthState, isWgerAuthenticated, getWgerAuthStatus } from './wgerAuth'
import { importWgerSample, listWgerExercises, type WgerExerciseRecord } from './wgerAdapter'
import { getHealthInfo } from './wgerHealth'
import { getQueueStats } from './wgerSyncQueue'
import { syncWgerToAlthea, syncAltheaToWger } from './wgerSyncEngine'

const BASE = 'https://wger.de/api/v2'

// ─── WgerClient — Clase base con timeout y manejo de errores ───
// FASE 26: Patrón de cliente TypeScript.
// NO recibe ni almacena credenciales permanentes del usuario.

export class WgerClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async request<T>(
    path: string,
    options: RequestInit = {},
    accessToken?: string,
  ): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    try {
      const headers = new Headers(options.headers)
      headers.set('Accept', 'application/json')

      if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
      }

      if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`)
      }

      const response = await this.fetchImpl(
        `${this.baseUrl}${path}`,
        {
          ...options,
          headers,
          signal: controller.signal,
        },
      )

      if (!response.ok) {
        const body = await response.text()
        const error = new Error(
          `WGER ${response.status}: ${body.slice(0, 500)}`
        );
        (error as Error & { status?: number }).status = response.status
        throw error
      }

      return response.json() as Promise<T>
    } finally {
      clearTimeout(timeout)
    }
  }
}

// ─── Instancia por defecto ───
const defaultClient = new WgerClient(BASE)

// ─── Helper interno ───
async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const path = url.replace(BASE, '')
  return defaultClient.request<T>(path, { signal })
}

// ─── Endpoints ───
// GET /exercise/           lista de ejercicios (IDs, sin nombres)
// GET /exerciseinfo/{id}/  detalle completo (músculos, equipo, traducciones, licencia)
//
// Taxonomía (muscle/equipment/category), traducciones e ingredientes NO tienen
// fetcher propio: la taxonomía y las traducciones viajan dentro de exerciseinfo
// (las resuelve wgerMapper) y los ingredientes pertenecen al módulo de
// nutrición propio de Althea. Decisión documentada en el cierre de Wger.

export function fetchExerciseList(
  opts: { limit?: number; offset?: number; language?: number } = {},
  signal?: AbortSignal,
): Promise<WgerListResponse<WgerExerciseListItem>> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  if (opts.language) {params.set('language', String(opts.language))}
  return getJSON(`${BASE}/exercise/?${params}`, signal)
}

export function fetchExerciseInfo(
  id: number,
  signal?: AbortSignal,
): Promise<WgerExerciseInfo> {
  return getJSON(`${BASE}/exerciseinfo/${id}/?format=json`, signal)
}

// ─── Routine Endpoints (FASE 5+) ───
// GET /routine/?id={id}
// GET /day/?routine={id}
// GET /slot/?day={id}
// GET /slotentry/?slot={id}
// GET /weightconfig/?slot_entry={id}
// GET /repetitionsconfig/?slot_entry={id}
// GET /setsconfig/?slot_entry={id}
// GET /rirconfig/?slot_entry={id}
// GET /restconfig/?slot_entry={id}

export function fetchRoutines(
  opts: { id?: number; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerListResponse<WgerRoutineListItem>> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.id) {params.set('id', String(opts.id))}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/routine/?${params}`, signal)
}

export function fetchRoutine(
  id: number,
  signal?: AbortSignal,
): Promise<WgerRoutineDetail> {
  return getJSON(`${BASE}/routine/${id}/?format=json`, signal)
}

export function fetchDays(
  opts: { routine?: number; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerListResponse<WgerDay>> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.routine) {params.set('routine', String(opts.routine))}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/day/?${params}`, signal)
}

export function fetchSlots(
  opts: { day?: number; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerListResponse<WgerSlot>> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.day) {params.set('day', String(opts.day))}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/slot/?${params}`, signal)
}

export function fetchSlotEntries(
  opts: { slot?: number; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerListResponse<WgerSlotEntry>> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.slot) {params.set('slot', String(opts.slot))}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/slotentry/?${params}`, signal)
}

export function fetchWeightConfig(
  opts: { slot_entry?: number; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerListResponse<WgerWeightConfig>> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.slot_entry) {params.set('slot_entry', String(opts.slot_entry))}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/weightconfig/?${params}`, signal)
}

export function fetchRepetitionsConfig(
  opts: { slot_entry?: number; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerListResponse<WgerRepetitionsConfig>> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.slot_entry) {params.set('slot_entry', String(opts.slot_entry))}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/repetitionsconfig/?${params}`, signal)
}

export function fetchSetsConfig(
  opts: { slot_entry?: number; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerListResponse<WgerSetsConfig>> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.slot_entry) {params.set('slot_entry', String(opts.slot_entry))}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/setsconfig/?${params}`, signal)
}

export function fetchRirConfig(
  opts: { slot_entry?: number; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerListResponse<WgerRirConfig>> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.slot_entry) {params.set('slot_entry', String(opts.slot_entry))}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/rirconfig/?${params}`, signal)
}

export function fetchRestConfig(
  opts: { slot_entry?: number; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerListResponse<WgerRestConfig>> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.slot_entry) {params.set('slot_entry', String(opts.slot_entry))}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/restconfig/?${params}`, signal)
}

// ─── Implementación de WgerIntegration ───
// FASE 1: Toda interacción pasa por servicios. Nunca UI → WGER directamente.
// FASE 24: API interna estable — interfaz unificada para toda la integración.

export const wgerIntegration: WgerIntegration = {
  // ─── Salud y estado (FASE 24) ───
  healthCheck: async (): Promise<IntegrationHealth> => {
    const healthInfo = await getHealthInfo()
    const queueStats = await getQueueStats()

    let status: IntegrationHealth['status'] = 'healthy'
    if (healthInfo.status === 'FAILED') {
      status = 'unhealthy'
    } else if (queueStats.failed > 0 || queueStats.pending > 0) {
      status = 'degraded'
    }

    return {
      status,
      isOnline: healthInfo.isOnline,
      lastSyncAt: healthInfo.lastSuccessfulSyncAt,
      remoteVersion: healthInfo.remoteVersion,
      queuePending: queueStats.pending,
      queueFailed: queueStats.failed,
      message: healthInfo.message,
    }
  },

  // ─── Lectura pública (sin auth) ───
  fetchExerciseList,
  fetchExerciseInfo,

  // ─── Importación a Dexie ───
  importSample: importWgerSample,
  listImported: listWgerExercises,

  // ─── Vinculación de entidades (FASE 2) ───
  // TODO: Implementar cuando se cree la tabla externalEntityLinks en Dexie
  linkEntity: async (altheaEntityId, externalEntityId, externalEntityUuid, entityType) => {
    const link: ExternalEntityLink = {
      id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      altheaEntityId,
      externalProvider: 'wger',
      externalEntityId,
      externalEntityUuid,
      entityType,
      linkedAt: new Date().toISOString(),
      lastSyncAt: null,
      metadata: {},
    }
    // TODO: Persistir en db.externalEntityLinks
    return link
  },

  unlinkEntity: async (_linkId) => {
    // TODO: Implementar cuando se cree la tabla externalEntityLinks en Dexie
  },

  getEntityLink: async (_altheaEntityId) => {
    // TODO: Implementar cuando se cree la tabla externalEntityLinks en Dexie
    return null
  },

  getEntityLinkByExternal: async (_externalEntityId) => {
    // TODO: Implementar cuando se cree la tabla externalEntityLinks en Dexie
    return null
  },

  listEntityLinks: async () => {
    // TODO: Implementar cuando se cree la tabla externalEntityLinks en Dexie
    return []
  },

  // ─── Vinculación de cuentas (FASE 2) ───
  // TODO: Implementar cuando se cree la tabla externalAccountLinks en Dexie
  linkAccount: async (altheaUserId, externalUserId, externalUsername) => {
    const link: ExternalAccountLink = {
      id: `acct-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      altheaUserId,
      externalProvider: 'wger',
      externalUserId,
      externalUsername,
      linkedAt: new Date().toISOString(),
      lastSyncAt: null,
      status: 'active',
    }
    // TODO: Persistir en db.externalAccountLinks
    return link
  },

  unlinkAccount: async (_linkId) => {
    // TODO: Implementar cuando se cree la tabla externalAccountLinks en Dexie
  },

  getAccountLink: async (_altheaUserId) => {
    // TODO: Implementar cuando se cree la tabla externalAccountLinks en Dexie
    return null
  },

  getAccountLinkByExternal: async (_externalUserId) => {
    // TODO: Implementar cuando se cree la tabla externalAccountLinks en Dexie
    return null
  },

  listAccountLinks: async () => {
    // TODO: Implementar cuando se cree la tabla externalAccountLinks en Dexie
    return []
  },

  // ─── Autenticación (FASE 3) ───
  isAuthenticated: isWgerAuthenticated,
  getAuthStatus: getWgerAuthStatus,

  // ─── Pull: WGER → Althea (FASE 24) ───
  pullExercises: async (): Promise<SyncResult> => {
    return syncWgerToAlthea({ entityTypes: ['exercise'] })
  },

  pullIngredients: async (): Promise<SyncResult> => {
    return syncWgerToAlthea({ entityTypes: ['ingredient'] })
  },

  pullRoutines: async (): Promise<SyncResult> => {
    return syncWgerToAlthea({ entityTypes: ['routine'] })
  },

  pullTrainingHistory: async (): Promise<SyncResult> => {
    return syncWgerToAlthea({ entityTypes: ['trainingSession'] })
  },

  pullNutritionPlans: async (): Promise<SyncResult> => {
    return syncWgerToAlthea({ entityTypes: ['nutritionPlan'] })
  },

  pullMeasurements: async (): Promise<SyncResult> => {
    return syncWgerToAlthea({ entityTypes: ['measurement'] })
  },

  // ─── Push: Althea → WGER (FASE 24) ───
  pushRoutine: async (_id: string): Promise<SyncResult> => {
    return syncAltheaToWger({ entityTypes: ['routine'] })
  },

  pushTrainingSession: async (_id: string): Promise<SyncResult> => {
    return syncAltheaToWger({ entityTypes: ['trainingSession'] })
  },

  pushNutritionPlan: async (_id: string): Promise<SyncResult> => {
    return syncAltheaToWger({ entityTypes: ['nutritionPlan'] })
  },

  // ─── Sincronización completa (FASE 24) ───
  sync: async (): Promise<FullSyncResult> => {
    const startTime = Date.now()
    const errors: string[] = []

    const [exercises, ingredients, routines, trainingHistory, nutritionPlans, measurements] = await Promise.all([
      syncWgerToAlthea({ entityTypes: ['exercise'] }).catch((err) => {
        errors.push(`exercises: ${err instanceof Error ? err.message : String(err)}`)
        return { success: false, synced: 0, failed: 0, conflicts: 0, errors: [String(err)] }
      }),
      syncWgerToAlthea({ entityTypes: ['ingredient'] }).catch((err) => {
        errors.push(`ingredients: ${err instanceof Error ? err.message : String(err)}`)
        return { success: false, synced: 0, failed: 0, conflicts: 0, errors: [String(err)] }
      }),
      syncWgerToAlthea({ entityTypes: ['routine'] }).catch((err) => {
        errors.push(`routines: ${err instanceof Error ? err.message : String(err)}`)
        return { success: false, synced: 0, failed: 0, conflicts: 0, errors: [String(err)] }
      }),
      syncWgerToAlthea({ entityTypes: ['trainingSession'] }).catch((err) => {
        errors.push(`trainingHistory: ${err instanceof Error ? err.message : String(err)}`)
        return { success: false, synced: 0, failed: 0, conflicts: 0, errors: [String(err)] }
      }),
      syncWgerToAlthea({ entityTypes: ['nutritionPlan'] }).catch((err) => {
        errors.push(`nutritionPlans: ${err instanceof Error ? err.message : String(err)}`)
        return { success: false, synced: 0, failed: 0, conflicts: 0, errors: [String(err)] }
      }),
      syncWgerToAlthea({ entityTypes: ['measurement'] }).catch((err) => {
        errors.push(`measurements: ${err instanceof Error ? err.message : String(err)}`)
        return { success: false, synced: 0, failed: 0, conflicts: 0, errors: [String(err)] }
      }),
    ])

    return {
      success: errors.length === 0,
      exercises,
      ingredients,
      routines,
      trainingHistory,
      nutritionPlans,
      measurements,
      totalDurationMs: Date.now() - startTime,
      errors,
    }
  },
}
