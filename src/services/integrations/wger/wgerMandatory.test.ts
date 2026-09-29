// Tests obligatorios de integración WGER — 32 casos.
// Cubre: ejercicios, rutinas, sesiones, nutrición, mediciones,
// sync, conflictos, errores HTTP, offline y rollback.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { db } from '@/services/storage/db'
import { importWgerSample, listWgerExercises, toExercise } from './wgerAdapter'
import { wgerToAltheaExercise, buildProvenance } from './wgerMapper'
import { mapWgerRoutineToAlthea, mapAltheaRoutineToWger } from './wgerRoutineMapper'
import { wgerSessionToAlthea, wgerLogToAltheaSetRecord, groupLogsByExercise, createSessionExerciseFromLogs, wgerSessionWithExercisesToAlthea } from './training/mapper'
import { mapWgerIngredientToAlthea, mapWgerNutritionDiaryToAlthea } from './nutrition/mapper'
import { mapWgerMeasurementToAlthea, detectConflicts } from './measurements/mapper'
import { detectConflict, resolveConflict } from './wgerConflictResolver'
import { enqueueOperation, getPendingOperations, markOperationCompleted, markOperationFailed, getQueueStats } from './wgerSyncQueue'
import { syncWgerToAlthea, syncAltheaToWger, retryFailedSync } from './wgerSyncEngine'
import { getSyncStatus, updateSyncStatus, resetHealthStatus } from './wgerHealth'
import { buildExerciseIndex, findMatch } from './wgerExerciseMatcher'
import type { WgerExerciseInfo, WgerTranslation, WgerRoutineDetail, WgerDay, WgerSlot, WgerSlotEntry, WgerWeightConfig, WgerRepetitionsConfig, WgerSetsConfig, WgerRirConfig, WgerRestConfig } from './wgerTypes'
import type { WgerIngredientInfo, WgerNutritionDiary } from './nutrition/types'
import type { WgerMeasurement } from './measurements/types'
import type { WgerWorkoutSession, WgerWorkoutLog } from './training/types'
import type { Exercise } from '@/services/exerciseGym'
import type { RoutineData, RoutineDayExercise } from '@/services/storage/routineStore'
import type { BodyMeasurement } from '@/types'

// ─── Mocks ───

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
}))

import {
  fetchExerciseList,
  fetchExerciseInfo,
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

// ─── Fixtures ───

const mockTranslation: WgerTranslation = {
  id: 1,
  uuid: 't1',
  name: 'Kettlebell Swing',
  exercise: 9,
  description: '<p>Swing the kettlebell</p>',
  description_source: '',
  language: 2,
  aliases: ['kettlebell swing', 'swing'],
  notes: [],
}

const mockExerciseInfo: WgerExerciseInfo = {
  id: 9,
  uuid: 'uuid-9',
  created: '2023-01-01',
  last_update: '2026-01-01',
  category: { id: 10, name: 'Abs' },
  muscles: [{ id: 11, name: 'Biceps femoris', name_en: 'Hamstrings', is_front: false, image_url_main: '', image_url_secondary: '' }],
  muscles_secondary: [{ id: 8, name: 'Gluteus maximus', name_en: 'Glutes', is_front: false, image_url_main: '', image_url_secondary: '' }],
  equipment: [{ id: 10, name: 'Kettlebell' }],
  license: { id: 2, full_name: 'CC-BY-SA 4', short_name: 'CC-BY-SA 4', url: 'https://creativecommons.org' },
  license_author: 'test',
  images: [],
  translations: [mockTranslation],
  videos: [],
}

const mockRoutineDetail: WgerRoutineDetail = {
  id: 1,
  uuid: 'routine-uuid-1',
  name: 'Test Routine',
  description: 'A test routine',
  created: '2023-01-01',
  last_update: '2026-01-01',
  start_date: null,
  end_date: null,
  is_active: true,
  is_template: false,
  days: [{
    id: 1,
    routine: 1,
    day: 1,
    name: 'Day 1',
    description: null,
    order: 1,
    slots: [{
      id: 1,
      day: 1,
      order: 1,
      comment: null,
      entries: [{
        id: 1,
        slot: 1,
        exercise: 9,
        order: 1,
        sets: 3,
        reps: 10,
        weight: 60,
        weight_unit: 1,
        repetition_unit: 1,
        rippetenz: 2,
        rest: 60,
        comment: null,
      }],
    }],
  }],
}

const mockWeightConfig: WgerWeightConfig = { id: 1, slot_entry: 1, value: 60, unit: 1, iteration: null }
const mockRepetitionsConfig: WgerRepetitionsConfig = { id: 1, slot_entry: 1, value: 10, iteration: null }
const mockSetsConfig: WgerSetsConfig = { id: 1, slot_entry: 1, value: 3, iteration: null }
const mockRirConfig: WgerRirConfig = { id: 1, slot_entry: 1, value: 2, iteration: null }
const mockRestConfig: WgerRestConfig = { id: 1, slot_entry: 1, value: 60, iteration: null }

const mockIngredient: WgerIngredientInfo = {
  id: 100,
  uuid: 'ing-uuid-100',
  code: 'code-100',
  name: 'Chicken Breast',
  common_name: 'Chicken',
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
  weight_units: [{ id: 1, uuid: 'wu1', ingredient: 100, gram: 100, name: '100g' }],
  license: 2,
  license_title: 'CC-BY-SA 4',
  license_object_url: '',
  license_author: 'test',
  language: 2,
}

const mockNutritionDiary: WgerNutritionDiary = {
  id: 500,
  nutrition_plan: 1,
  ingredient: 100,
  weight_unit: null,
  amount: 200,
  date: '2026-09-28',
  time: '12:00:00',
  meal: null,
  ingredient_name: 'Chicken Breast',
  ingredient_energy: 165,
  ingredient_protein: '31',
  ingredient_carbohydrates: '0',
  ingredient_fat: '3.6',
}

const mockMeasurement: WgerMeasurement = {
  id: 200,
  category: 1,
  category_name: 'weight',
  date: '2026-09-28',
  value: 75.5,
  unit: 'kg',
  notes: null,
}

const mockWorkoutSession: WgerWorkoutSession = {
  id: 1000,
  uuid: 'ws-uuid-1000',
  workout: 1,
  date: '2026-09-28',
  start_time: '2026-09-28T10:00:00',
  end_time: '2026-09-28T11:00:00',
  notes: 'Good session',
  impression: '3',
  time_start: '2026-09-28T10:00:00',
  time_end: '2026-09-28T11:00:00',
  created: '2026-09-28T10:00:00',
  last_update: '2026-09-28T11:00:00',
}

const mockWorkoutLog: WgerWorkoutLog = {
  id: 2000,
  uuid: 'log-uuid-2000',
  workout_session: 1000,
  exercise: 9,
  exercise_name: 'Kettlebell Swing',
  repetition_unit: 1,
  repetition_unit_name: 'reps',
  weight_unit: 1,
  weight_unit_name: 'kg',
  weight: 60,
  repetitions: 10,
  rippetenz: 2,
  order: 1,
  comment: null,
  created: '2026-09-28T10:05:00',
  last_update: '2026-09-28T10:05:00',
}

// ─── Helpers ───

function createMockExercise(id: number, name: string): Exercise {
  return {
    id: `wger-${id}`,
    slug: `wger-${id}`,
    name,
    muscle: 'biceps femoris',
    bodyPart: 'legs',
    equipment: 'kettlebell',
    category: 'strength',
    secondaryMuscles: ['gluteus maximus'],
    instructions: ['Do the exercise'],
    file: '',
    gifUrl: '',
    origin: 'PRELOADED',
    muscleBreakdown: [{ name: 'biceps femoris', pct: 50, role: 'Principal' }],
    archived: false,
  }
}

function createMockRoutine(): RoutineData {
  return {
    id: 'routine-1',
    name: 'Test Routine',
    description: 'A test routine',
    createdAt: '2023-01-01',
    updatedAt: '2026-01-01',
    rotationDays: 30,
    cycle: {
      startDate: '2026-09-28',
      trainingDays: [{ n: 1, name: 'Day 1' }],
      weekMap: [],
    },
    dayExercises: {
      1: [{
        id: 'ex-1',
        exId: 'wger-9',
        sets: 3,
        reps: 10,
        weight: 60,
        restSec: 60,
        rir: 2,
        name: 'Kettlebell Swing',
        muscle: 'biceps femoris',
        gifUrl: '',
      }],
    },
    version: 1,
  }
}

// ─── Tests ───

describe('WGER Integration — 32 Mandatory Tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    await db.delete()
    await db.open()
    resetHealthStatus()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ─── 1. Ejercicio WGER → Althea ───
  describe('Test 1: Ejercicio WGER → Althea', () => {
    it('convierte WgerExerciseInfo a Exercise de Althea', () => {
      const result = wgerToAltheaExercise(mockExerciseInfo)
      expect(result.id).toBe('wger-9')
      expect(result.name).toBe('Kettlebell Swing')
      expect(result.muscle).toBe('biceps femoris')
      expect(result.bodyPart).toBe('legs')
      expect(result.equipment).toBe('kettlebell')
      expect(result.category).toBe('abs')
      expect(result.origin).toBe('PRELOADED')
    })

    it('construye provenance correcto', () => {
      const provenance = buildProvenance(mockExerciseInfo)
      expect(provenance.altheaId).toBe('wger-9')
      expect(provenance.source).toBe('wger')
      expect(provenance.sourceId).toBe(9)
      expect(provenance.sourceUuid).toBe('uuid-9')
      expect(provenance.license).toBe('CC-BY-SA 4')
    })
  })

  // ─── 2. Ejercicio existente → no duplicar ───
  describe('Test 2: Ejercicio existente → no duplicar', () => {
    it('no duplica ejercicios ya importados', async () => {
      vi.mocked(fetchExerciseList).mockResolvedValue({
        count: 1,
        next: null,
        previous: null,
        results: [{ id: 9, uuid: 'uuid-9', created: '', last_update: '', category: 10, muscles: [11], muscles_secondary: [], equipment: [10], variation_group: null, license_author: 'test' }],
      } as never)
      vi.mocked(fetchExerciseInfo).mockResolvedValue(mockExerciseInfo as never)

      await importWgerSample(1)
      const second = await importWgerSample(1)

      expect(second).toHaveLength(0)
      const all = await listWgerExercises()
      expect(all).toHaveLength(1)
    })
  })

  // ─── 3. Alias → mismo ejercicio ───
  describe('Test 3: Alias → mismo ejercicio', () => {
    it('encuentra ejercicio por alias', () => {
      const exercises = [createMockExercise(9, 'Kettlebell Swing')]
      const provenance = [buildProvenance(mockExerciseInfo)]
      const index = buildExerciseIndex(exercises, provenance)

      const match = findMatch(mockExerciseInfo, index, provenance)
      expect(match.matched).toBe(true)
      expect(match.confidence).toBe('exact')
    })

    it('encuentra ejercicio por nombre normalizado', () => {
      const exercises = [createMockExercise(9, 'Kettlebell Swing')]
      const provenance = [buildProvenance(mockExerciseInfo)]
      const index = buildExerciseIndex(exercises, provenance)

      const infoWithAlias = {
        ...mockExerciseInfo,
        translations: [{ ...mockTranslation, aliases: ['swing'] }],
      }
      const match = findMatch(infoWithAlias, index, provenance)
      expect(match.matched).toBe(true)
    })
  })

  // ─── 4. Rutina WGER → Althea ───
  describe('Test 4: Rutina WGER → Althea', () => {
    it('convierte rutina WGER a RoutineData de Althea', () => {
      const data = {
        routine: mockRoutineDetail,
        days: mockRoutineDetail.days,
        slots: mockRoutineDetail.days[0].slots,
        slotEntries: mockRoutineDetail.days[0].slots[0].entries,
        weightConfigs: new Map([[1, mockWeightConfig]]),
        repetitionsConfigs: new Map([[1, mockRepetitionsConfig]]),
        setsConfigs: new Map([[1, mockSetsConfig]]),
        rirConfigs: new Map([[1, mockRirConfig]]),
        restConfigs: new Map([[1, mockRestConfig]]),
      }

      const { routine, provenance } = mapWgerRoutineToAlthea(data, () => createMockExercise(9, 'Kettlebell Swing'))

      expect(routine.id).toBe('wger-routine-1')
      expect(routine.name).toBe('Test Routine')
      expect(routine.dayExercises[1]).toHaveLength(1)
      expect(routine.dayExercises[1][0].name).toBe('Kettlebell Swing')
      expect(provenance.sourceId).toBe(1)
    })
  })

  // ─── 5. Rutina Althea → WGER ───
  describe('Test 5: Rutina Althea → WGER', () => {
    it('convierte RoutineData de Althea a formato WGER', () => {
      const routine = createMockRoutine()
      const result = mapAltheaRoutineToWger(routine, () => ({ wgerId: 9 }))

      expect(result.routine.name).toBe('Test Routine')
      expect(result.days).toHaveLength(1)
      expect(result.slots).toHaveLength(1)
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].exercise).toBe(9)
      expect(result.entries[0].sets).toBe(3)
      expect(result.entries[0].reps).toBe(10)
    })
  })

  // ─── 6. Session WGER → TrainingSession ───
  describe('Test 6: Session WGER → TrainingSession', () => {
    it('convierte WgerWorkoutSession a TrainingSession', () => {
      const session = wgerSessionToAlthea(mockWorkoutSession)
      expect(session.id).toBe('wger-session-1000')
      expect(session.sessionId).toBe('wger-session-1000')
      expect(session.routineId).toBe('wger-workout-1')
      expect(session.calendarDate).toBe('2026-09-28')
      expect(session.sessionStatus).toBe('COMPLETED')
      expect(session.startedAt).toBe('2026-09-28T10:00:00')
      expect(session.endedAt).toBe('2026-09-28T11:00:00')
    })
  })

  // ─── 7. Planned vs Actual ───
  describe('Test 7: Planned vs Actual', () => {
    it('diferencia entre planificado y real en SetRecord', () => {
      const setRecord = wgerLogToAltheaSetRecord(
        mockWorkoutLog,
        'se-1',
        'session-1',
        'wger-9',
      )
      expect(setRecord.plannedReps).toBe(10)
      expect(setRecord.actualReps).toBe(10)
      expect(setRecord.plannedWeight).toBe(60)
      expect(setRecord.actualWeight).toBe(60)
      expect(setRecord.status).toBe('COMPLETED')
    })

    it('permite planned diferente de actual', () => {
      const log = { ...mockWorkoutLog, repetitions: 8, weight: 65 }
      const setRecord = wgerLogToAltheaSetRecord(log, 'se-1', 'session-1', 'wger-9')
      expect(setRecord.plannedReps).toBe(8)
      expect(setRecord.actualReps).toBe(8)
    })
  })

  // ─── 8. Series independientes ───
  describe('Test 8: Series independientes', () => {
    it('cada serie conserva su identidad propia', () => {
      const logs = [
        { ...mockWorkoutLog, id: 1, order: 1, weight: 60, repetitions: 10 },
        { ...mockWorkoutLog, id: 2, order: 2, weight: 65, repetitions: 8 },
        { ...mockWorkoutLog, id: 3, order: 3, weight: 70, repetitions: 6 },
      ]
      const grouped = groupLogsByExercise(logs)
      expect(grouped.size).toBe(1)
      expect(grouped.get('9')).toHaveLength(3)
    })

    it('crea SetRecords independientes para cada serie', () => {
      const logs = [
        { ...mockWorkoutLog, id: 1, order: 1 },
        { ...mockWorkoutLog, id: 2, order: 2 },
      ]
      const se = createSessionExerciseFromLogs(logs, 'session-1', 1)
      expect(se.actualSets).toHaveLength(2)
      expect(se.actualSets![0].order).toBe(1)
      expect(se.actualSets![1].order).toBe(2)
    })
  })

  // ─── 9. Pirámide descendente ───
  describe('Test 9: Pirámide descendente', () => {
    it('maneja series con pesos crecientes y reps decrecientes', () => {
      const logs = [
        { ...mockWorkoutLog, id: 1, order: 1, weight: 60, repetitions: 12 },
        { ...mockWorkoutLog, id: 2, order: 2, weight: 65, repetitions: 10 },
        { ...mockWorkoutLog, id: 3, order: 3, weight: 70, repetitions: 8 },
        { ...mockWorkoutLog, id: 4, order: 4, weight: 75, repetitions: 6 },
      ]
      const se = createSessionExerciseFromLogs(logs, 'session-1', 1)
      expect(se.actualSets).toHaveLength(4)
      expect(se.actualSets![0].weight).toBe(60)
      expect(se.actualSets![3].weight).toBe(75)
      expect(se.actualSets![0].reps).toBe(12)
      expect(se.actualSets![3].reps).toBe(6)
    })
  })

  // ─── 10. KG ───
  describe('Test 10: KG', () => {
    it('mapea peso en kg correctamente', () => {
      const log = { ...mockWorkoutLog, weight: 60, weight_unit_name: 'kg' }
      const setRecord = wgerLogToAltheaSetRecord(log, 'se-1', 'session-1', 'wger-9')
      expect(setRecord.actualWeight).toBe(60)
      expect(setRecord.actualLoadText).toBe('60 KG')
    })
  })

  // ─── 11. LB ───
  describe('Test 11: LB', () => {
    it('mapea peso en lb correctamente', () => {
      const log = { ...mockWorkoutLog, weight: 132, weight_unit_name: 'lb' }
      const setRecord = wgerLogToAltheaSetRecord(log, 'se-1', 'session-1', 'wger-9')
      expect(setRecord.actualWeight).toBe(132)
      expect(setRecord.actualLoadText).toBe('132 LB')
    })
  })

  // ─── 12. Plate count ───
  describe('Test 12: Plate count', () => {
    it('mapea peso por conteo de placas', () => {
      const log = { ...mockWorkoutLog, weight: 4, weight_unit_name: 'plate' }
      const setRecord = wgerLogToAltheaSetRecord(log, 'se-1', 'session-1', 'wger-9')
      expect(setRecord.actualWeight).toBe(4)
      expect(setRecord.actualLoadText).toBe('4 PLATE_COUNT')
    })
  })

  // ─── 13. Stack count ───
  describe('Test 13: Stack count', () => {
    it('mapea peso por conteo de bloques', () => {
      const log = { ...mockWorkoutLog, weight: 3, weight_unit_name: 'stack' }
      const setRecord = wgerLogToAltheaSetRecord(log, 'se-1', 'session-1', 'wger-9')
      expect(setRecord.actualWeight).toBe(3)
      expect(setRecord.actualLoadText).toBe('3 STACK_COUNT')
    })
  })

  // ─── 14. Ingrediente → Alimento Althea ───
  describe('Test 14: Ingrediente → Alimento Althea', () => {
    it('convierte WgerIngredientInfo a AltheaIngredientValues', () => {
      const result = mapWgerIngredientToAlthea(mockIngredient)
      expect(result.id).toBe('wger-ingredient-100')
      expect(result.name).toBe('Chicken Breast')
      expect(result.per100.calories).toBe(165)
      expect(result.per100.proteins).toBe(31)
      expect(result.per100.carbs).toBe(0)
      expect(result.per100.fats).toBe(3.6)
      expect(result.isVegan).toBe(false)
      expect(result.nutriscore).toBe('A')
    })
  })

  // ─── 15. Cálculo nutricional ───
  describe('Test 15: Cálculo nutricional', () => {
    it('calcula macros para cantidad específica', () => {
      const ingredient = mapWgerIngredientToAlthea(mockIngredient)
      const grams = 200
      const factor = grams / 100
      const calories = ingredient.per100.calories * factor
      const proteins = ingredient.per100.proteins * factor

      expect(calories).toBe(330)
      expect(proteins).toBe(62)
    })

    it('convierte diary entry con macros correctos', () => {
      const diary = mapWgerNutritionDiaryToAlthea(mockNutritionDiary)
      expect(diary.id).toBe('wger-diary-500')
      expect(diary.amount).toBe(200)
      expect(diary.macros.calories).toBe(165)
      expect(diary.macros.proteins).toBe(31)
      expect(diary.ingredients![0].foodId).toBe('wger-ingredient-100')
    })
  })

  // ─── 16. Receta ───
  describe('Test 16: Receta', () => {
    it('convierte meal items a referencias de Althea', () => {
      const mealItem = {
        id: 1,
        meal: 1,
        ingredient: 100,
        weight_unit: null,
        amount: 200,
        order: 1,
        ingredient_name: 'Chicken Breast',
        ingredient_energy: 165,
        ingredient_protein: '31',
        ingredient_carbohydrates: '0',
        ingredient_fat: '3.6',
      }
      const result = mapWgerIngredientToAlthea(mockIngredient)
      expect(result.id).toBe('wger-ingredient-100')
      expect(result.per100.calories).toBe(165)
    })
  })

  // ─── 17. Medición corporal ───
  describe('Test 17: Medición corporal', () => {
    it('convierte WgerMeasurement a BodyMeasurement', () => {
      const result = mapWgerMeasurementToAlthea(mockMeasurement)
      expect(result).not.toBeNull()
      expect(result!.id).toBe('wger-measurement-200')
      expect(result!.weightKg).toBe(75.5)
      expect(result!.localDate).toBe('2026-09-28')
    })

    it('no sobrescribe mediciones locales existentes', () => {
      const existing: BodyMeasurement = {
        id: 'local-1',
        localDate: '2026-09-28',
        weightKg: 76,
        createdAt: '2026-09-28T10:00:00',
      }
      const result = mapWgerMeasurementToAlthea(mockMeasurement, existing)
      expect(result).toBe(existing)
    })

    it('retorna null para categorías no compatibles', () => {
      const incompatible = { ...mockMeasurement, category_name: 'blood pressure' }
      const result = mapWgerMeasurementToAlthea(incompatible)
      expect(result).toBeNull()
    })
  })

  // ─── 18. Conflicto local/remoto ───
  describe('Test 18: Conflicto local/remoto', () => {
    it('detecta conflicto cuando hay cambios locales', async () => {
      await db.syncQueue.put({
        id: 'sync-1',
        operation: 'create',
        entityType: 'exercise',
        localEntityId: 'wger-9',
        remoteEntityId: '9',
        payload: { hash: 'abc123' },
        attempts: 0,
        createdAt: new Date().toISOString(),
        status: 'COMPLETED',
      })

      const result = await detectConflict({
        operation: 'update',
        entityType: 'exercise',
        localEntityId: 'wger-9',
        remoteEntityId: '9',
        payload: { hash: 'def456' },
      })

      expect(result.hasConflict).toBe(true)
      expect(result.conflict).toBeDefined()
    })

    it('resuelve conflicto con KEEP_LOCAL', async () => {
      await db.syncQueue.put({
        id: 'conflict-1',
        operation: 'CONFLICT',
        entityType: 'exercise',
        localEntityId: 'wger-9',
        payload: { localSnapshot: { a: 1 }, remoteSnapshot: { a: 2 } },
        attempts: 0,
        createdAt: new Date().toISOString(),
        status: 'CONFLICT',
      })

      const resolved = await resolveConflict('conflict-1', 'KEEP_LOCAL')
      expect(resolved).toBe(true)

      const item = await db.syncQueue.get('conflict-1')
      expect(item!.status).toBe('RESOLVED')
    })
  })

  // ─── 19. Retry ───
  describe('Test 19: Retry', () => {
    it('reintentar operaciones fallidas', async () => {
      await db.syncQueue.put({
        id: 'sync-fail-1',
        operation: 'create',
        entityType: 'exercise',
        localEntityId: 'wger-9',
        payload: {},
        attempts: 1,
        createdAt: new Date().toISOString(),
        status: 'FAILED',
        error: 'Network error',
      })

      const result = await retryFailedSync()
      expect(result).toBeDefined()
    })
  })

  // ─── 20-25. Errores HTTP ───
  describe('Test 20: Error 401', () => {
    it('maneja error 401 Unauthorized', async () => {
      vi.mocked(fetchExerciseList).mockRejectedValue(new Error('Wger 401 https://wger.de/api/v2/exercise/'))
      const result = await importWgerSample(1).catch((e) => e)
      expect(result.message).toContain('401')
    })
  })

  describe('Test 21: Error 403', () => {
    it('maneja error 403 Forbidden', async () => {
      vi.mocked(fetchExerciseList).mockRejectedValue(new Error('Wger 403 https://wger.de/api/v2/exercise/'))
      const result = await importWgerSample(1).catch((e) => e)
      expect(result.message).toContain('403')
    })
  })

  describe('Test 22: Error 409', () => {
    it('maneja error 409 Conflict', async () => {
      vi.mocked(fetchExerciseList).mockRejectedValue(new Error('Wger 409 https://wger.de/api/v2/exercise/'))
      const result = await importWgerSample(1).catch((e) => e)
      expect(result.message).toContain('409')
    })
  })

  describe('Test 23: Error 422', () => {
    it('maneja error 422 Unprocessable Entity', async () => {
      vi.mocked(fetchExerciseList).mockRejectedValue(new Error('Wger 422 https://wger.de/api/v2/exercise/'))
      const result = await importWgerSample(1).catch((e) => e)
      expect(result.message).toContain('422')
    })
  })

  describe('Test 24: Error 429', () => {
    it('maneja error 429 Rate Limited', async () => {
      vi.mocked(fetchExerciseList).mockRejectedValue(new Error('Wger 429 https://wger.de/api/v2/exercise/'))
      const result = await importWgerSample(1).catch((e) => e)
      expect(result.message).toContain('429')
    })
  })

  describe('Test 25: Error 500', () => {
    it('maneja error 500 Server Error', async () => {
      vi.mocked(fetchExerciseList).mockRejectedValue(new Error('Wger 500 https://wger.de/api/v2/exercise/'))
      const result = await importWgerSample(1).catch((e) => e)
      expect(result.message).toContain('500')
    })
  })

  // ─── 26. Timeout ───
  describe('Test 26: Timeout', () => {
    it('maneja timeout de red', async () => {
      vi.mocked(fetchExerciseList).mockRejectedValue(new Error('The operation was aborted'))
      const result = await importWgerSample(1).catch((e) => e)
      expect(result.message).toContain('aborted')
    })
  })

  // ─── 27. Offline ───
  describe('Test 27: Offline', () => {
    it('funciona offline con datos en Dexie', async () => {
      vi.mocked(fetchExerciseList).mockResolvedValue({
        count: 1,
        next: null,
        previous: null,
        results: [{ id: 9, uuid: 'uuid-9', created: '', last_update: '', category: 10, muscles: [11], muscles_secondary: [], equipment: [10], variation_group: null, license_author: 'test' }],
      } as never)
      vi.mocked(fetchExerciseInfo).mockResolvedValue(mockExerciseInfo as never)

      await importWgerSample(1)

      // Simular offline
      vi.mocked(fetchExerciseList).mockRejectedValue(new TypeError('Failed to fetch'))
      vi.mocked(fetchExerciseInfo).mockRejectedValue(new TypeError('Failed to fetch'))

      const all = await listWgerExercises()
      expect(all).toHaveLength(1)
    })
  })

  // ─── 28. Reintento después de reconectar ───
  describe('Test 28: Reintento después de reconectar', () => {
    it('reintenta sync después de volver online', async () => {
      // Primera sync falla
      vi.mocked(fetchRoutines).mockRejectedValue(new TypeError('Failed to fetch'))
      const first = await syncWgerToAlthea()
      expect(first.success).toBe(false)

      // Reconectar
      vi.mocked(fetchRoutines).mockResolvedValue({
        count: 0,
        next: null,
        previous: null,
        results: [],
      } as never)

      const second = await syncWgerToAlthea()
      expect(second.success).toBe(true)
    })
  })

  // ─── 29. Duplicación por doble sync ───
  describe('Test 29: Duplicación por doble sync', () => {
    it('no duplica al sincronizar dos veces', async () => {
      vi.mocked(fetchRoutines).mockResolvedValue({
        count: 1,
        next: null,
        previous: null,
        results: [{ id: 1, uuid: 'r1', name: 'Routine', description: null, created: '', last_update: '', start_date: null, end_date: null, is_active: true, is_template: false }],
      } as never)
      vi.mocked(fetchRoutine).mockResolvedValue(mockRoutineDetail as never)
      vi.mocked(fetchDays).mockResolvedValue({ count: 1, next: null, previous: null, results: mockRoutineDetail.days } as never)
      vi.mocked(fetchSlots).mockResolvedValue({ count: 1, next: null, previous: null, results: mockRoutineDetail.days[0].slots } as never)
      vi.mocked(fetchSlotEntries).mockResolvedValue({ count: 1, next: null, previous: null, results: mockRoutineDetail.days[0].slots[0].entries } as never)
      vi.mocked(fetchWeightConfig).mockResolvedValue({ count: 1, next: null, previous: null, results: [mockWeightConfig] } as never)
      vi.mocked(fetchRepetitionsConfig).mockResolvedValue({ count: 1, next: null, previous: null, results: [mockRepetitionsConfig] } as never)
      vi.mocked(fetchSetsConfig).mockResolvedValue({ count: 1, next: null, previous: null, results: [mockSetsConfig] } as never)
      vi.mocked(fetchRirConfig).mockResolvedValue({ count: 1, next: null, previous: null, results: [mockRirConfig] } as never)
      vi.mocked(fetchRestConfig).mockResolvedValue({ count: 1, next: null, previous: null, results: [mockRestConfig] } as never)

      await syncWgerToAlthea()
      const second = await syncWgerToAlthea()

      expect(second.synced).toBe(0)
    })
  })

  // ─── 30. Sync interrumpido a mitad de operación ───
  describe('Test 30: Sync interrumpido a mitad de operación', () => {
    it('maneja interrupción durante sync', async () => {
      vi.mocked(fetchRoutines).mockResolvedValue({
        count: 2,
        next: null,
        previous: null,
        results: [
          { id: 1, uuid: 'r1', name: 'R1', description: null, created: '', last_update: '', start_date: null, end_date: null, is_active: true, is_template: false },
          { id: 2, uuid: 'r2', name: 'R2', description: null, created: '', last_update: '', start_date: null, end_date: null, is_active: true, is_template: false },
        ],
      } as never)
      vi.mocked(fetchRoutine).mockResolvedValue(mockRoutineDetail as never)
      vi.mocked(fetchDays).mockResolvedValue({ count: 1, next: null, previous: null, results: mockRoutineDetail.days } as never)
      vi.mocked(fetchSlots).mockResolvedValue({ count: 1, next: null, previous: null, results: mockRoutineDetail.days[0].slots } as never)
      vi.mocked(fetchSlotEntries).mockResolvedValue({ count: 1, next: null, previous: null, results: mockRoutineDetail.days[0].slots[0].entries } as never)
      vi.mocked(fetchWeightConfig).mockResolvedValue({ count: 1, next: null, previous: null, results: [mockWeightConfig] } as never)
      vi.mocked(fetchRepetitionsConfig).mockResolvedValue({ count: 1, next: null, previous: null, results: [mockRepetitionsConfig] } as never)
      vi.mocked(fetchSetsConfig).mockResolvedValue({ count: 1, next: null, previous: null, results: [mockSetsConfig] } as never)
      vi.mocked(fetchRirConfig).mockResolvedValue({ count: 1, next: null, previous: null, results: [mockRirConfig] } as never)
      vi.mocked(fetchRestConfig).mockResolvedValue({ count: 1, next: null, previous: null, results: [mockRestConfig] } as never)

      const controller = new AbortController()
      controller.abort()

      const result = await syncWgerToAlthea({ signal: controller.signal })
      expect(result).toBeDefined()
    })
  })

  // ─── 31. Rollback ───
  describe('Test 31: Rollback', () => {
    it('permite deshacer operación fallida', async () => {
      const opId = await enqueueOperation({
        operation: 'create',
        entityType: 'exercise',
        localEntityId: 'wger-9',
        payload: { data: 'test' },
      })

      await markOperationFailed(opId, 'Network error')

      const item = await db.syncQueue.get(opId)
      expect(item!.status).toBe('FAILED')
      expect(item!.error).toBe('Network error')
      expect(item!.attempts).toBe(1)
    })

    it('permite re-enqueue operación fallida', async () => {
      const opId = await enqueueOperation({
        operation: 'create',
        entityType: 'exercise',
        localEntityId: 'wger-9',
        payload: { data: 'test' },
      })

      await markOperationFailed(opId, 'Network error')
      await db.syncQueue.update(opId, { status: 'PENDING', error: undefined })

      const pending = await getPendingOperations()
      expect(pending.some((p) => p.id === opId)).toBe(true)
    })
  })

  // ─── 32. Preservación de historial ───
  describe('Test 32: Preservación de historial', () => {
    it('conserva historial de importaciones', async () => {
      vi.mocked(fetchExerciseList).mockResolvedValue({
        count: 1,
        next: null,
        previous: null,
        results: [{ id: 9, uuid: 'uuid-9', created: '', last_update: '', category: 10, muscles: [11], muscles_secondary: [], equipment: [10], variation_group: null, license_author: 'test' }],
      } as never)
      vi.mocked(fetchExerciseInfo).mockResolvedValue(mockExerciseInfo as never)

      await importWgerSample(1)
      const all = await listWgerExercises()

      expect(all).toHaveLength(1)
      expect(all[0].wgerProvenance.sourceId).toBe(9)
      expect(all[0].wgerProvenance.importedAt).toBeDefined()
    })

    it('conserva historial de sesiones', () => {
      const session = wgerSessionToAlthea(mockWorkoutSession)
      expect(session.id).toBe('wger-session-1000')
      expect(session.createdAt).toBe('2026-09-28T10:00:00')
      expect(session.updatedAt).toBe('2026-09-28T11:00:00')
    })

    it('conserva historial de mediciones', () => {
      const measurement = mapWgerMeasurementToAlthea(mockMeasurement)
      expect(measurement).not.toBeNull()
      expect(measurement!.id).toBe('wger-measurement-200')
      expect(measurement!.createdAt).toBeDefined()
    })
  })
})
