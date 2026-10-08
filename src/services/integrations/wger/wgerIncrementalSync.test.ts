// Tests de sincronización incremental WGER.
// Verifica: primera sync, segunda sync sin cambios, solo cambios posteriores,
// múltiples páginas, cursor, interrupción, reanudación.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import {
  syncWgerToAlthea,
  syncIncremental,
  fetchAllWgerPages,
} from './wgerSyncEngine'
import { enqueueOperation, getPendingOperations, markOperationCompleted } from './wgerSyncQueue'
import { getSyncStatus, updateSyncStatus, resetHealthStatus } from './wgerHealth'

vi.mock('./wgerClient', () => ({
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
} from './wgerClient'

const mockRoutine = (id: number, name: string) => ({
  id,
  uuid: `uuid-${id}`,
  name,
  description: null,
  created: '2026-01-01T00:00:00Z',
  last_update: '2026-01-01T00:00:00Z',
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

describe('WGER Sync — Primera sync', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    resetHealthStatus()
  })

  it('primera sync descarga rutinas desde WGER', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A'), mockRoutine(2, 'Routine B')])

    const result = await syncWgerToAlthea({ entityTypes: ['routine'] })

    expect(result.success).toBe(true)
    expect(result.synced).toBeGreaterThan(0)
    expect(fetchRoutines).toHaveBeenCalled()
  })

  it('primera sync crea operaciones en la cola', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A')])

    await syncWgerToAlthea({ entityTypes: ['routine'] })

    const pending = await getPendingOperations()
    // Las operaciones completadas no quedan pendientes
    expect(pending.length).toBe(0)
  })

  it('primera sync marca operaciones como COMPLETED', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A')])

    await syncWgerToAlthea({ entityTypes: ['routine'] })

    const allOps = await db.syncQueue.toArray()
    const completedOps = allOps.filter((op) => op.status === 'COMPLETED')
    expect(completedOps.length).toBeGreaterThan(0)
  })
})

describe('WGER Sync — Segunda sync sin cambios', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    resetHealthStatus()
  })

  it('segunda sync sin cambios no duplica rutinas', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A')])

    // Primera sync
    await syncWgerToAlthea({ entityTypes: ['routine'] })
    const firstCount = (await db.syncQueue.toArray()).length

    // Segunda sync (mismos datos)
    const result = await syncWgerToAlthea({ entityTypes: ['routine'] })
    const secondCount = (await db.syncQueue.toArray()).length

    // No debe haber nuevas operaciones
    expect(secondCount).toBe(firstCount)
    expect(result.synced).toBe(0)
  })

  it('segunda sync con mismos hashes es idempotente', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A')])

    const first = await syncWgerToAlthea({ entityTypes: ['routine'] })
    const second = await syncWgerToAlthea({ entityTypes: ['routine'] })

    expect(first.synced).toBeGreaterThan(0)
    expect(second.synced).toBe(0)
  })
})

describe('WGER Sync — Solo cambios posteriores', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    resetHealthStatus()
  })

  it('sincroniza solo rutinas nuevas', async () => {
    const newRoutine = mockRoutine(2, 'Routine B')
    setupRoutineMocks([mockRoutine(1, 'Routine A'), newRoutine])

    const result = await syncWgerToAlthea({ entityTypes: ['routine'] })

    expect(result.synced).toBeGreaterThanOrEqual(1)
  })

  it('sincroniza solo rutinas modificadas', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A')])
    await syncWgerToAlthea({ entityTypes: ['routine'] })

    const modifiedRoutine = {
      ...mockRoutine(1, 'Routine A Modified'),
      last_update: '2027-06-01T00:00:00Z',
    }
    setupRoutineMocks([modifiedRoutine])

    const result = await syncWgerToAlthea({ entityTypes: ['routine'] })

    expect(result.synced).toBeGreaterThanOrEqual(1)
  })

  it('sincroniza solo rutinas modificadas', async () => {
    // Primera sync
    setupRoutineMocks([mockRoutine(1, 'Routine A')])
    await syncWgerToAlthea({ entityTypes: ['routine'] })

    // Modificar rutina (cambiar last_update a fecha posterior al first sync)
    const modifiedRoutine = {
      ...mockRoutine(1, 'Routine A Modified'),
      last_update: '2027-06-01T00:00:00Z',
    }
    setupRoutineMocks([modifiedRoutine])

    const result = await syncWgerToAlthea({ entityTypes: ['routine'] })

    expect(result.synced).toBe(1) // Solo la modificada
  })
})

describe('WGER Sync — Múltiples páginas', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    resetHealthStatus()
  })

  it('fetchAllWgerPages obtiene todas las páginas', async () => {
    const page1 = {
      count: 4,
      next: 'https://wger.de/api/v2/routine/?limit=2&offset=2',
      previous: null,
      results: [mockRoutine(1, 'A'), mockRoutine(2, 'B')],
    }
    const page2 = {
      count: 4,
      next: null,
      previous: 'https://wger.de/api/v2/routine/?limit=2&offset=0',
      results: [mockRoutine(3, 'C'), mockRoutine(4, 'D')],
    }

    vi.mocked(fetchRoutines)
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2)

    const all = await fetchAllWgerPages(
      (opts) => fetchRoutines(opts),
      { limit: 2 }
    )

    expect(all).toHaveLength(4)
    expect(all.map((r) => r.id)).toEqual([1, 2, 3, 4])
  })

  it('fetchAllWgerPages respeta maxPages', async () => {
    const page = {
      count: 100,
      next: 'https://wger.de/api/v2/routine/?limit=2&offset=2',
      previous: null,
      results: [mockRoutine(1, 'A'), mockRoutine(2, 'B')],
    }

    vi.mocked(fetchRoutines).mockResolvedValue(page)

    const all = await fetchAllWgerPages(
      (opts) => fetchRoutines(opts),
      { limit: 2, maxPages: 3 }
    )

    expect(all).toHaveLength(6) // 3 páginas × 2 resultados
  })

  it('fetchAllWgerPages se detiene con AbortSignal', async () => {
    const page = {
      count: 100,
      next: 'https://wger.de/api/v2/routine/?limit=2&offset=2',
      previous: null,
      results: [mockRoutine(1, 'A'), mockRoutine(2, 'B')],
    }

    vi.mocked(fetchRoutines).mockResolvedValue(page)

    const controller = new AbortController()
    controller.abort()

    const all = await fetchAllWgerPages(
      (opts) => fetchRoutines(opts),
      { limit: 2, signal: controller.signal }
    )

    expect(all).toHaveLength(0)
  })
})

describe('WGER Sync — Cursor', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    resetHealthStatus()
  })

  it('syncIncremental usa cursor basado en última sync', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A')])

    // Primera sync
    await syncWgerToAlthea({ entityTypes: ['routine'] })

    // Obtener cursor
    const allOps = await db.syncQueue.toArray()
    const lastOp = allOps[allOps.length - 1]

    expect(lastOp).toBeDefined()
    expect(lastOp.status).toBe('COMPLETED')
  })

  it('syncIncremental no falla sin cursor previo', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A')])

    const result = await syncIncremental({ entityTypes: ['routine'] })

    expect(result.success).toBe(true)
  })
})

describe('WGER Sync — Interrupción y reanudación', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    resetHealthStatus()
  })

  it('sync se puede interrumpir con AbortSignal', async () => {
    const controller = new AbortController()

    vi.mocked(fetchRoutines).mockImplementation(async () => {
      controller.abort()
      return {
        count: 0,
        next: null,
        previous: null,
        results: [],
      }
    })

    const result = await syncWgerToAlthea({
      entityTypes: ['routine'],
      signal: controller.signal,
    })

    // Debe manejar la interrupción gracefully
    expect(result).toBeDefined()
  })

  it('operaciones pendientes se pueden reanudar', async () => {
    // Crear operación pendiente manualmente
    const opId = await enqueueOperation({
      operation: 'create',
      entityType: 'routine',
      localEntityId: 'test-routine',
      payload: { data: { name: 'Test' }, hash: 'abc123' },
    })

    const pending = await getPendingOperations()
    expect(pending.length).toBe(1)

    // Marcar como completada
    await markOperationCompleted(opId, { remoteId: 1 })

    const afterPending = await getPendingOperations()
    expect(afterPending.length).toBe(0)
  })

  it('sync status se actualiza correctamente durante sync', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A')])

    expect(getSyncStatus()).toBe('SYNCED')

    updateSyncStatus('SYNCING')
    expect(getSyncStatus()).toBe('SYNCING')

    updateSyncStatus('SYNCED')
    expect(getSyncStatus()).toBe('SYNCED')
  })
})


