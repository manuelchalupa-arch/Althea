// Tests verificados de sincronización WGER.
// Verifican: idempotencia, push/pull, conflictos, offline/reconnect, retries.
// Estos tests usan mocks controlados pero verifican comportamiento real del motor.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { db } from '@/services/storage/db'
import {
  syncWgerToAlthea,
  syncAltheaToWger,
  syncIncremental,
  retryWithReconnection,
  retryFailedSync,
  type SyncResult,
} from './wgerSyncEngine'
import {
  enqueueOperation,
  getPendingOperations,
  markOperationCompleted,
  markOperationFailed,
  getFailedOperations,
  getQueueStats,
} from './wgerSyncQueue'
import { detectConflict, resolveConflict, getPendingConflicts } from './wgerConflictResolver'
import { getSyncStatus, updateSyncStatus, resetHealthStatus } from './wgerHealth'
import { resetWgerAuth } from './wgerAuth'

vi.mock('./wgerClient', () => ({
  fetchExerciseList: vi.fn(),
  fetchExerciseInfo: vi.fn(),
  fetchRoutines: vi.fn(),
  fetchRoutine: vi.fn(),
  fetchDays: vi.fn(),
  fetchSlots: vi.fn(),
  fetchSlotEntries: vi.fn(),
  fetchWeightConfig: vi.fn(),
  fetchRepetitionsConfig: vi.fn(),
  fetchSetsConfig: vi.fn(),
  fetchRirConfig: vi.fn(),
  fetchRestConfig: vi.fn(),
  fetchIngredients: vi.fn(),
  fetchNutritionPlans: vi.fn(),
  fetchWorkoutSessions: vi.fn(),
  fetchMeasurements: vi.fn(),
  createRoutine: vi.fn(),
  updateRoutine: vi.fn(),
  deleteRoutine: vi.fn(),
  createWorkout: vi.fn(),
  updateWorkout: vi.fn(),
  deleteWorkout: vi.fn(),
  createNutritionPlan: vi.fn(),
  updateNutritionPlan: vi.fn(),
  deleteNutritionPlan: vi.fn(),
  createMeasurement: vi.fn(),
  updateMeasurement: vi.fn(),
  deleteMeasurement: vi.fn(),
}))

import {
  fetchRoutines,
  fetchRoutine,
  fetchDays,
  fetchSlots,
  fetchSlotEntries,
  fetchWeightConfig,
  fetchRepetitionsConfig,
  fetchSetsConfig,
  fetchRirConfig,
  fetchRestConfig,
  fetchExerciseList,
  fetchExerciseInfo,
  fetchIngredients,
  fetchNutritionPlans,
  fetchWorkoutSessions,
  fetchMeasurements,
  createRoutine,
  updateRoutine,
  deleteRoutine,
} from './wgerClient'

vi.mock('./wgerAuth', () => ({
  getWgerAuthState: vi.fn(() => ({
    status: 'authenticated',
    isAuthenticated: true,
    canWrite: true,
    isLinked: true,
    wgerUsername: 'testuser',
  })),
  isWgerAuthenticated: vi.fn(() => true),
  getWgerAuthStatus: vi.fn(() => 'authenticated'),
  resetWgerAuth: vi.fn(),
}))

const mockRoutine = (id: number, name: string, lastUpdate: string = '2026-01-01T00:00:00Z') => ({
  id,
  uuid: `uuid-${id}`,
  name,
  description: null,
  created: '2026-01-01T00:00:00Z',
  last_update: lastUpdate,
  start_date: null,
  end_date: null,
  is_active: true,
  is_template: false,
})

const mockDay = (id: number, routineId: number, dayNum: number) => ({
  id,
  routine: routineId,
  day: dayNum,
  name: `Day ${dayNum}`,
  description: null,
  order: dayNum,
  slots: [],
})

const mockSlot = (id: number, dayId: number) => ({
  id,
  day: dayId,
  order: 1,
  comment: null,
  entries: [],
})

const mockSlotEntry = (id: number, slotId: number, exerciseId: number) => ({
  id,
  slot: slotId,
  exercise: exerciseId,
  order: 1,
  sets: 3,
  reps: 10,
  weight: null,
  weight_unit: null,
  repetition_unit: null,
  rippetenz: null,
  rest: 60,
  comment: null,
})

const mockConfig = (id: number, slotEntryId: number, value: number) => ({
  id,
  slot_entry: slotEntryId,
  value,
  unit: 1,
  iteration: null,
})

function setupRoutineMocks(routines: ReturnType<typeof mockRoutine>[]) {
  vi.mocked(fetchRoutines).mockResolvedValue({
    count: routines.length,
    next: null,
    previous: null,
    results: routines,
  })

  for (const routine of routines) {
    vi.mocked(fetchRoutine).mockResolvedValue({
      ...routine,
      days: [mockDay(1, routine.id, 1)],
    })

    vi.mocked(fetchDays).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [mockDay(1, routine.id, 1)],
    })

    vi.mocked(fetchSlots).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [mockSlot(1, 1)],
    })

    vi.mocked(fetchSlotEntries).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [mockSlotEntry(1, 1, 100)],
    })

    vi.mocked(fetchWeightConfig).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [mockConfig(1, 1, 60)],
    })

    vi.mocked(fetchRepetitionsConfig).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [mockConfig(2, 1, 10)],
    })

    vi.mocked(fetchSetsConfig).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [mockConfig(3, 1, 3)],
    })

    vi.mocked(fetchRirConfig).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })

    vi.mocked(fetchRestConfig).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [mockConfig(5, 1, 60)],
    })
  }
}

describe('WGER Sync Verificado — Idempotencia', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    resetHealthStatus()
    resetWgerAuth()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sync() x3 mismo estado no duplica operaciones', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A')])

    const first = await syncWgerToAlthea({ entityTypes: ['routine'] })
    const firstOps = await db.syncQueue.toArray()

    const second = await syncWgerToAlthea({ entityTypes: ['routine'] })
    const secondOps = await db.syncQueue.toArray()

    const third = await syncWgerToAlthea({ entityTypes: ['routine'] })
    const thirdOps = await db.syncQueue.toArray()

    expect(first.synced).toBeGreaterThan(0)
    expect(second.synced).toBe(0)
    expect(third.synced).toBe(0)

    expect(thirdOps.length).toBe(firstOps.length)
    expect(thirdOps.length).toBe(secondOps.length)
  })

  it('sync() x3 no crea duplicados por localEntityId', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A'), mockRoutine(2, 'Routine B')])

    await syncWgerToAlthea({ entityTypes: ['routine'] })
    await syncWgerToAlthea({ entityTypes: ['routine'] })
    await syncWgerToAlthea({ entityTypes: ['routine'] })

    const allOps = await db.syncQueue.toArray()
    const localEntityIds = allOps.map((op) => op.localEntityId)
    const uniqueIds = new Set(localEntityIds)

    expect(uniqueIds.size).toBe(localEntityIds.length)
  })

  it('syncIncremental es idempotente', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A')])

    const first = await syncIncremental({ entityTypes: ['routine'] })
    const firstOps = await db.syncQueue.toArray()

    const second = await syncIncremental({ entityTypes: ['routine'] })
    const secondOps = await db.syncQueue.toArray()

    expect(first.synced).toBeGreaterThan(0)
    expect(second.synced).toBe(0)
    expect(secondOps.length).toBe(firstOps.length)
  })
})

describe('WGER Sync Verificado — Push/Pull', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    resetHealthStatus()
    resetWgerAuth()
  })

  it('pull descarga y guarda operaciones', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A')])

    const result = await syncWgerToAlthea({ entityTypes: ['routine'] })

    expect(result.success).toBe(true)
    expect(result.synced).toBeGreaterThan(0)

    const ops = await db.syncQueue.toArray()
    expect(ops.length).toBeGreaterThan(0)
    expect(ops.every((op) => op.status === 'COMPLETED')).toBe(true)
  })

  it('push envía operaciones pendientes', async () => {
    await enqueueOperation({
      operation: 'create',
      entityType: 'routine',
      localEntityId: 'local-routine-1',
      payload: { data: { name: 'New Routine' }, hash: 'abc123' },
    })

    vi.mocked(createRoutine).mockResolvedValue({ ...mockRoutine(1, 'New Routine'), days: [] })

    const result = await syncAltheaToWger({ entityTypes: ['routine'] })

    expect(result.success).toBe(true)
    expect(result.synced).toBe(1)
    expect(createRoutine).toHaveBeenCalled()
  })

  it('push con operación update', async () => {
    await enqueueOperation({
      operation: 'update',
      entityType: 'routine',
      localEntityId: 'local-routine-1',
      remoteEntityId: '1',
      payload: { data: { name: 'Updated' }, hash: 'def456' },
    })

    vi.mocked(updateRoutine).mockResolvedValue({ ...mockRoutine(1, 'Updated'), days: [] })

    const result = await syncAltheaToWger({ entityTypes: ['routine'] })

    expect(result.success).toBe(true)
    expect(result.synced).toBe(1)
    expect(updateRoutine).toHaveBeenCalledWith(1, expect.any(Object))
  })

  it('push con operación delete', async () => {
    await enqueueOperation({
      operation: 'delete',
      entityType: 'routine',
      localEntityId: 'local-routine-1',
      remoteEntityId: '1',
      payload: {},
    })

    vi.mocked(deleteRoutine).mockResolvedValue(undefined)

    const result = await syncAltheaToWger({ entityTypes: ['routine'] })

    expect(result.success).toBe(true)
    expect(result.synced).toBe(1)
    expect(deleteRoutine).toHaveBeenCalledWith(1)
  })

  it('push falla sin autenticación', async () => {
    const { getWgerAuthState } = await import('./wgerAuth')
    vi.mocked(getWgerAuthState).mockReturnValue({
      status: 'public-only',
      isAuthenticated: false,
      canWrite: false,
      isLinked: false,
    })

    const result = await syncAltheaToWger({ entityTypes: ['routine'] })

    expect(result.success).toBe(false)
    expect(result.errors).toContain('WGER write operations require authentication')
  })
})

describe('WGER Sync Verificado — Conflictos', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    resetHealthStatus()
    resetWgerAuth()
  })

  it('detecta conflicto cuando hash cambia', async () => {
    await enqueueOperation({
      operation: 'create',
      entityType: 'routine',
      localEntityId: 'routine-1',
      payload: { data: { name: 'Original' }, hash: 'hash-v1' },
    })
    const ops = await getPendingOperations()
    await markOperationCompleted(ops[0].id, { remoteId: 1 })

    const result = await detectConflict({
      operation: 'update',
      entityType: 'routine',
      localEntityId: 'routine-1',
      remoteEntityId: '1',
      payload: { data: { name: 'Modified' }, hash: 'hash-v2' },
    })

    expect(result.hasConflict).toBe(true)
    expect(result.conflict).toBeDefined()
  })

  it('no detecta conflicto cuando hash es igual', async () => {
    await enqueueOperation({
      operation: 'create',
      entityType: 'routine',
      localEntityId: 'routine-1',
      payload: { data: { name: 'Same' }, hash: 'hash-v1' },
    })
    const ops = await getPendingOperations()
    await markOperationCompleted(ops[0].id, { remoteId: 1 })

    const result = await detectConflict({
      operation: 'update',
      entityType: 'routine',
      localEntityId: 'routine-1',
      remoteEntityId: '1',
      payload: { data: { name: 'Same' }, hash: 'hash-v1' },
    })

    expect(result.hasConflict).toBe(false)
  })

  it('resuelve conflicto con KEEP_LOCAL', async () => {
    await enqueueOperation({
      operation: 'create',
      entityType: 'routine',
      localEntityId: 'routine-1',
      payload: { data: { name: 'Local' }, hash: 'hash-v1' },
    })
    const ops = await getPendingOperations()
    await markOperationCompleted(ops[0].id, { remoteId: 1 })

    const conflictResult = await detectConflict({
      operation: 'update',
      entityType: 'routine',
      localEntityId: 'routine-1',
      remoteEntityId: '1',
      payload: { data: { name: 'Remote' }, hash: 'hash-v2' },
    })

    const resolved = await resolveConflict(conflictResult.conflict!.id, 'KEEP_LOCAL')

    expect(resolved).toBe(true)

    const conflict = await db.syncQueue.get(conflictResult.conflict!.id)
    expect(conflict!.status).toBe('RESOLVED')
  })

  it('resuelve conflicto con KEEP_REMOTE', async () => {
    await enqueueOperation({
      operation: 'create',
      entityType: 'routine',
      localEntityId: 'routine-1',
      payload: { data: { name: 'Local' }, hash: 'hash-v1' },
    })
    const ops = await getPendingOperations()
    await markOperationCompleted(ops[0].id, { remoteId: 1 })

    const conflictResult = await detectConflict({
      operation: 'update',
      entityType: 'routine',
      localEntityId: 'routine-1',
      remoteEntityId: '1',
      payload: { data: { name: 'Remote' }, hash: 'hash-v2' },
    })

    const resolved = await resolveConflict(conflictResult.conflict!.id, 'KEEP_REMOTE')

    expect(resolved).toBe(true)
  })

  it('resuelve conflicto con SKIP', async () => {
    await enqueueOperation({
      operation: 'create',
      entityType: 'routine',
      localEntityId: 'routine-1',
      payload: { data: { name: 'Local' }, hash: 'hash-v1' },
    })
    const ops = await getPendingOperations()
    await markOperationCompleted(ops[0].id, { remoteId: 1 })

    const conflictResult = await detectConflict({
      operation: 'update',
      entityType: 'routine',
      localEntityId: 'routine-1',
      remoteEntityId: '1',
      payload: { data: { name: 'Remote' }, hash: 'hash-v2' },
    })

    const resolved = await resolveConflict(conflictResult.conflict!.id, 'SKIP')

    expect(resolved).toBe(true)

    const conflict = await db.syncQueue.get(conflictResult.conflict!.id)
    expect(conflict!.status).toBe('SKIPPED')
  })

  it('getPendingConflicts retorna conflictos pendientes', async () => {
    await enqueueOperation({
      operation: 'create',
      entityType: 'routine',
      localEntityId: 'routine-1',
      payload: { data: { name: 'Local' }, hash: 'hash-v1' },
    })
    const ops = await getPendingOperations()
    await markOperationCompleted(ops[0].id, { remoteId: 1 })

    await detectConflict({
      operation: 'update',
      entityType: 'routine',
      localEntityId: 'routine-1',
      remoteEntityId: '1',
      payload: { data: { name: 'Remote' }, hash: 'hash-v2' },
    })

    const conflicts = await getPendingConflicts()
    expect(conflicts.length).toBeGreaterThan(0)
  })
})

describe('WGER Sync Verificado — Offline/Reconnect', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    resetHealthStatus()
    resetWgerAuth()
  })

  it('retryWithReconnection reintenta en caso de fallo', async () => {
    let attempts = 0
    const result = await retryWithReconnection(async () => {
      attempts++
      if (attempts < 2) {
        throw new Error('Network error')
      }
      return { success: true, synced: 1, failed: 0, conflicts: 0, errors: [] }
    }, 3)

    expect(result.success).toBe(true)
    expect(attempts).toBe(2)
  })

  it('retryWithReconnection falla después de maxRetries', async () => {
    const result = await retryWithReconnection(async () => {
      throw new Error('Persistent error')
    }, 2)

    expect(result.success).toBe(false)
    expect(result.failed).toBeGreaterThan(0)
  })

  it('retryFailedSync reintenta operaciones fallidas', async () => {
    const opId = await enqueueOperation({
      operation: 'create',
      entityType: 'routine',
      localEntityId: 'failed-routine',
      payload: { data: { name: 'Failed' }, hash: 'abc' },
    })
    await markOperationFailed(opId, 'Network error')

    const failed = await getFailedOperations()
    expect(failed.length).toBe(1)

    vi.mocked(createRoutine).mockResolvedValue({ ...mockRoutine(1, 'Failed'), days: [] })

    const result = await retryFailedSync()

    expect(result).toHaveProperty('success')
  })

  it('operaciones offline se guardan en la cola', async () => {
    await enqueueOperation({
      operation: 'create',
      entityType: 'routine',
      localEntityId: 'offline-routine',
      payload: { data: { name: 'Offline' }, hash: 'xyz' },
    })

    const pending = await getPendingOperations()
    expect(pending.length).toBe(1)
    expect(pending[0].localEntityId).toBe('offline-routine')
  })

  it('sync status se actualiza correctamente', () => {
    expect(getSyncStatus()).toBe('SYNCED')

    updateSyncStatus('SYNCING')
    expect(getSyncStatus()).toBe('SYNCING')

    updateSyncStatus('SYNCED')
    expect(getSyncStatus()).toBe('SYNCED')
  })
})

describe('WGER Sync Verificado — Retries (HTTP)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    resetHealthStatus()
    resetWgerAuth()
  })

  it('maneja error 401 Unauthorized', async () => {
    vi.mocked(fetchRoutines).mockRejectedValue(new Error('WGER 401'))

    const result = await syncWgerToAlthea({ entityTypes: ['routine'] })

    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.includes('401'))).toBe(true)
  })

  it('maneja error 403 Forbidden', async () => {
    vi.mocked(fetchRoutines).mockRejectedValue(new Error('WGER 403'))

    const result = await syncWgerToAlthea({ entityTypes: ['routine'] })

    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.includes('403'))).toBe(true)
  })

  it('maneja error 409 Conflict', async () => {
    vi.mocked(fetchRoutines).mockRejectedValue(new Error('WGER 409'))

    const result = await syncWgerToAlthea({ entityTypes: ['routine'] })

    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.includes('409'))).toBe(true)
  })

  it('maneja error 422 Unprocessable Entity', async () => {
    vi.mocked(fetchRoutines).mockRejectedValue(new Error('WGER 422'))

    const result = await syncWgerToAlthea({ entityTypes: ['routine'] })

    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.includes('422'))).toBe(true)
  })

  it('maneja error 429 Rate Limited', async () => {
    vi.mocked(fetchRoutines).mockRejectedValue(new Error('WGER 429'))

    const result = await syncWgerToAlthea({ entityTypes: ['routine'] })

    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.includes('429'))).toBe(true)
  })

  it('maneja error 500 Server Error', async () => {
    vi.mocked(fetchRoutines).mockRejectedValue(new Error('WGER 500'))

    const result = await syncWgerToAlthea({ entityTypes: ['routine'] })

    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.includes('500'))).toBe(true)
  })

  it('maneja timeout de red', async () => {
    vi.mocked(fetchRoutines).mockRejectedValue(new Error('The operation was aborted'))

    const result = await syncWgerToAlthea({ entityTypes: ['routine'] })

    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.includes('aborted'))).toBe(true)
  })
})

describe('WGER Sync Verificado — Recursos incrementales', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    resetHealthStatus()
    resetWgerAuth()
  })

  it('syncIncremental procesa exercises', async () => {
    vi.mocked(fetchExerciseList).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{ id: 9, uuid: 'uuid-9', created: '', last_update: '2026-01-01', category: 10, muscles: [11], muscles_secondary: [], equipment: [10], variation_group: null, license_author: 'test' }] as never,
    })
    vi.mocked(fetchExerciseInfo).mockResolvedValue({
      id: 9,
      uuid: 'uuid-9',
      created: '2023-01-01',
      last_update: '2026-01-01',
      category: { id: 10, name: 'Abs' },
      muscles: [],
      muscles_secondary: [],
      equipment: [],
      license: { id: 2, full_name: 'CC-BY-SA 4', short_name: 'CC-BY-SA 4', url: '' },
      license_author: 'test',
      images: [],
      translations: [],
      videos: [],
    } as never)

    const result = await syncIncremental({ entityTypes: ['exercise'] })

    expect(result.success).toBe(true)
  })

  it('syncIncremental procesa ingredients', async () => {
    vi.mocked(fetchIngredients).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{
        id: 100,
        uuid: 'ing-100',
        code: '',
        name: 'Chicken',
        common_name: '',
        brand: '',
        energy: 165,
        protein: '31',
        carbohydrates: '0',
        carbohydrates_sugar: '0',
        fat: '3.6',
        fat_saturated: '1',
        fiber: '0',
        sodium: '74',
        is_vegan: false,
        is_vegetarian: false,
        nutriscore: 'A',
        weight_units: [],
        license: 2,
        license_title: '',
        license_object_url: '',
        license_author: '',
        language: 2,
      } as never],
    })

    const result = await syncIncremental({ entityTypes: ['ingredient'] })

    expect(result.success).toBe(true)
  })

  it('syncIncremental procesa training sessions', async () => {
    vi.mocked(fetchWorkoutSessions).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{
        id: 1000,
        uuid: 'ws-1000',
        workout: 1,
        date: '2026-09-28',
        start_time: '2026-09-28T10:00:00',
        end_time: '2026-09-28T11:00:00',
        notes: null,
        impression: '3',
        time_start: '2026-09-28T10:00:00',
        time_end: '2026-09-28T11:00:00',
        created: '2026-09-28T10:00:00',
        last_update: '2026-09-28T11:00:00',
      }],
    })

    const result = await syncIncremental({ entityTypes: ['trainingSession'] })

    expect(result.success).toBe(true)
  })

  it('syncIncremental procesa nutrition plans', async () => {
    vi.mocked(fetchNutritionPlans).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{
        id: 1,
        uuid: 'np-1',
        name: 'Plan',
        description: null,
        created: '2026-01-01',
        last_update: '2026-01-01',
        start_date: null,
        end_date: null,
        is_active: true,
        is_template: false,
      }],
    })

    const result = await syncIncremental({ entityTypes: ['nutritionPlan'] })

    expect(result.success).toBe(true)
  })

  it('syncIncremental procesa measurements', async () => {
    vi.mocked(fetchMeasurements).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{
        id: 200,
        category: 1,
        category_name: 'weight',
        date: '2026-09-28',
        value: 75.5,
        unit: 'kg',
        notes: null,
      }],
    })

    const result = await syncIncremental({ entityTypes: ['measurement'] })

    expect(result.success).toBe(true)
  })
})

describe('WGER Sync Verificado — Estado de salud', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    resetHealthStatus()
    resetWgerAuth()
  })

  it('getQueueStats retorna conteos', async () => {
    const stats = await getQueueStats()

    expect(stats).toHaveProperty('pending')
    expect(stats).toHaveProperty('completed')
    expect(stats).toHaveProperty('failed')
    expect(stats).toHaveProperty('total')
  })

  it('resetHealthStatus limpia el estado', () => {
    updateSyncStatus('FAILED')
    resetHealthStatus()
    expect(getSyncStatus()).toBe('SYNCED')
  })
})
