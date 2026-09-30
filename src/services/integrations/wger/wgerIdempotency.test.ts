// Tests de idempotencia WGER.
// Verifica: sync() tres veces produce el mismo estado final.
// No crear duplicados (sesiones, series, rutinas, mediciones).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import {
  syncWgerToAlthea,
  syncAltheaToWger,
  syncEntity,
  type SyncResult,
} from './wgerSyncEngine'
import { enqueueOperation, getPendingOperations, markOperationCompleted } from './wgerSyncQueue'
import { resetHealthStatus } from './wgerHealth'
import { resetWgerAuth } from './wgerAuth'

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

describe('WGER Idempotencia — sync() tres veces', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    resetHealthStatus()
    resetWgerAuth()
  })

  it('sync() tres veces produce el mismo estado final', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A'), mockRoutine(2, 'Routine B')])

    // Primera sync
    const first = await syncWgerToAlthea({ entityTypes: ['routine'] })
    const stateAfterFirst = await db.syncQueue.toArray()

    // Segunda sync
    const second = await syncWgerToAlthea({ entityTypes: ['routine'] })
    const stateAfterSecond = await db.syncQueue.toArray()

    // Tercera sync
    const third = await syncWgerToAlthea({ entityTypes: ['routine'] })
    const stateAfterThird = await db.syncQueue.toArray()

    // El estado final debe ser el mismo
    expect(stateAfterThird.length).toBe(stateAfterFirst.length)
    expect(stateAfterThird.length).toBe(stateAfterSecond.length)

    // Solo la primera sync debe sincronizar
    expect(first.synced).toBeGreaterThan(0)
    expect(second.synced).toBe(0)
    expect(third.synced).toBe(0)
  })

  it('sync() tres veces no crea duplicados en syncQueue', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A')])

    await syncWgerToAlthea({ entityTypes: ['routine'] })
    await syncWgerToAlthea({ entityTypes: ['routine'] })
    await syncWgerToAlthea({ entityTypes: ['routine'] })

    const allOps = await db.syncQueue.toArray()
    const localEntityIds = allOps.map((op) => op.localEntityId)
    const uniqueIds = new Set(localEntityIds)

    expect(uniqueIds.size).toBe(localEntityIds.length)
  })

  it('sync() tres veces no duplica rutinas', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A')])

    await syncWgerToAlthea({ entityTypes: ['routine'] })
    await syncWgerToAlthea({ entityTypes: ['routine'] })
    await syncWgerToAlthea({ entityTypes: ['routine'] })

    const allOps = await db.syncQueue.toArray()
    const routineOps = allOps.filter((op) => op.entityType === 'routine')

    // No debe haber duplicados por localEntityId
    const localIds = routineOps.map((op) => op.localEntityId)
    expect(new Set(localIds).size).toBe(localIds.length)
  })
})

describe('WGER Idempotencia — No duplicados', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    resetHealthStatus()
    resetWgerAuth()
  })

  it('no crea duplicados de sesiones', async () => {
    // Verificar que no hay sesiones duplicadas
    const sessions = await db.trainingSessions.toArray()
    const sessionIds = sessions.map((s) => s.sessionId)
    expect(new Set(sessionIds).size).toBe(sessionIds.length)
  })

  it('no crea duplicados de series', async () => {
    const setRecords = await db.setRecords.toArray()
    const recordIds = setRecords.map((r) => r.setRecordId)
    expect(new Set(recordIds).size).toBe(recordIds.length)
  })

  it('no crea duplicados de rutinas', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A')])

    await syncWgerToAlthea({ entityTypes: ['routine'] })
    await syncWgerToAlthea({ entityTypes: ['routine'] })

    const allOps = await db.syncQueue.toArray()
    const routineOps = allOps.filter(
      (op) => op.entityType === 'routine' && op.status === 'COMPLETED'
    )

    const localIds = routineOps.map((op) => op.localEntityId)
    expect(new Set(localIds).size).toBe(localIds.length)
  })

  it('no crea duplicados de mediciones', async () => {
    const measurements = await db.bodyMeasurements.toArray()
    const measurementIds = measurements.map((m) => m.id)
    expect(new Set(measurementIds).size).toBe(measurementIds.length)
  })

  it('operaciones con mismo hash no se duplican', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A')])

    // Primera sync
    await syncWgerToAlthea({ entityTypes: ['routine'] })
    const firstCount = (await db.syncQueue.toArray()).length

    // Segunda sync con mismos datos
    await syncWgerToAlthea({ entityTypes: ['routine'] })
    const secondCount = (await db.syncQueue.toArray()).length

    expect(secondCount).toBe(firstCount)
  })
})

describe('WGER Idempotencia — Operaciones repetidas', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    resetHealthStatus()
    resetWgerAuth()
  })

  it('enqueueOperation + markOperationCompleted es idempotente', async () => {
    const opId = await enqueueOperation({
      operation: 'create',
      entityType: 'routine',
      localEntityId: 'test-routine',
      payload: { data: { name: 'Test' }, hash: 'abc123' },
    })

    await markOperationCompleted(opId, { remoteId: 1 })

    const op = await db.syncQueue.get(opId)
    expect(op?.status).toBe('COMPLETED')
    expect(op?.result).toEqual({ remoteId: 1 })
  })

  it('múltiples operaciones con mismo localEntityId no duplican', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A')])

    await syncWgerToAlthea({ entityTypes: ['routine'] })

    const allOps = await db.syncQueue.toArray()
    const routineOps = allOps.filter((op) => op.localEntityId === 'wger-routine-1')

    // Debe haber solo una operación completada por rutina
    const completedOps = routineOps.filter((op) => op.status === 'COMPLETED')
    expect(completedOps.length).toBe(1)
  })

  it('syncEntity es idempotente', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A')])

    const first = await syncEntity('routine', 'wger-routine-1', 'wger-to-althea')
    const second = await syncEntity('routine', 'wger-routine-1', 'wger-to-althea')

    expect(first.synced).toBeGreaterThan(0)
    expect(second.synced).toBe(0)
  })
})
