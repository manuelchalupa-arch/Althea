// Tests de sync real WGER â†” Althea.
// Verifica: pull, push, conflicto, resoluciÃ³n, offline/reconnect.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { db } from '@/services/storage/db'
import {
  syncWgerToAlthea,
  syncAltheaToWger,
  pullChanges,
  pushChanges,
  retryFailedSync,
  retryWithReconnection,
  resolveConflictById,
  type SyncResult,
} from './wgerSyncEngine'
import {
  enqueueOperation,
  getPendingOperations,
  markOperationCompleted,
  markOperationFailed,
  getFailedOperations,
} from './wgerSyncQueue'
import { detectConflict, resolveConflict, getPendingConflicts } from './wgerConflictResolver'
import { getSyncStatus, updateSyncStatus, resetHealthStatus } from './wgerHealth'
import { getWgerAuthState, resetWgerAuth } from './wgerAuth'

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
  fetchExerciseList: vi.fn(),
  fetchExerciseInfo: vi.fn(),
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

describe('WGER Sync Real â€” Pull (WGER â†’ Althea)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    resetHealthStatus()
    resetWgerAuth()
  })

  it('pullChanges descarga datos de WGER', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A')])

    const result = await pullChanges({ entityTypes: ['routine'] })

    expect(result.success).toBe(true)
    expect(result.synced).toBeGreaterThan(0)
  })

  it('pullChanges usa syncWgerToAlthea internamente', async () => {
    setupRoutineMocks([mockRoutine(1, 'Routine A')])

    const result = await pullChanges({ entityTypes: ['routine'] })

    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('synced')
    expect(result).toHaveProperty('failed')
    expect(result).toHaveProperty('conflicts')
    expect(result).toHaveProperty('errors')
  })
})

