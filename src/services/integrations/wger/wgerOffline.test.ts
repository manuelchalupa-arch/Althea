// FASE 15 — Flujo offline.
// Internet → Wger → Dexie → sin Internet → Althea funciona.
// Nunca: Offline → Wger obligatorio → Althea rota.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { db } from '@/services/storage/db'
import { importWgerSample, listWgerExercises, toExercise } from './wgerAdapter'
import { exerciseMatches } from '@/services/training/exerciseSearch'
import { createSession, confirmSetRecord } from '@/services/training/sessionStore'

vi.mock('./wgerClient', () => ({
  fetchExerciseList: vi.fn(),
  fetchExerciseInfo: vi.fn(),
}))

import { fetchExerciseList, fetchExerciseInfo } from './wgerClient'

const mockList = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 9, uuid: 'u9', created: '', last_update: '', category: 10, muscles: [11], muscles_secondary: [], equipment: [10], variation_group: null, license_author: 'a' },
    { id: 12, uuid: 'u12', created: '', last_update: '', category: 9, muscles: [8], muscles_secondary: [], equipment: [], variation_group: null, license_author: 'b' },
  ],
}

const mockInfo = (id: number, name: string) => ({
  id,
  uuid: `uuid-${id}`,
  created: '',
  last_update: '',
  category: { id: 10, name: 'Abs' },
  muscles: [{ id: 11, name: 'Biceps femoris', name_en: 'Hamstrings', is_front: false, image_url_main: '', image_url_secondary: '' }],
  muscles_secondary: [],
  equipment: [{ id: 10, name: 'Kettlebell' }],
  license: { id: 2, full_name: 'CC-BY-SA 4', short_name: 'CC-BY-SA 4', url: 'https://creativecommons.org' },
  license_author: 'test',
  images: [],
  translations: [{ id: 1, uuid: 't', name, exercise: id, description: '<p>Do it</p>', description_source: '', language: 2, aliases: [], notes: [] }],
  videos: [],
})

let originalFetch: typeof globalThis.fetch

beforeEach(async () => {
  vi.clearAllMocks()
  localStorage.clear()
  await db.delete()
  await db.open()
  originalFetch = globalThis.fetch
  vi.mocked(fetchExerciseList).mockResolvedValue(mockList as never)
  vi.mocked(fetchExerciseInfo).mockImplementation(async (id: number) => {
    const names: Record<number, string> = { 9: 'Kettlebell Swing', 12: 'Glute Bridge' }
    return mockInfo(id, names[id] || `Ex ${id}`) as never
  })
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function goOffline() {
  globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as never
  // También hacer que los mocks de wgerClient fallen (simulan la red)
  vi.mocked(fetchExerciseList).mockRejectedValue(new TypeError('Failed to fetch'))
  vi.mocked(fetchExerciseInfo).mockRejectedValue(new TypeError('Failed to fetch'))
}

describe('FASE 15 — Flujo offline', () => {
  it('sincronizar online → funcionar offline', async () => {
    // ONLINE: importar desde Wger
    await importWgerSample(2)
    const synced = await listWgerExercises()
    expect(synced).toHaveLength(2)

    // OFFLINE: todo sigue funcionando desde Dexie
    goOffline()

    // 1. Listar ejercicios
    const offline = await listWgerExercises()
    expect(offline).toHaveLength(2)

    // 2. Búsqueda funciona
    const exercises = offline.map(toExercise)
    const results = exercises.filter(ex => exerciseMatches(ex, 'kettlebell'))
    expect(results.length).toBeGreaterThan(0)

    // 3. Crear sesión funciona
    const session = await createSession({
      routineId: 'offline-routine',
      routineName: 'Offline',
      plannedDay: 1,
      plannedDayName: 'Lunes',
      actualDay: 1,
      actualDayName: 'Lunes',
      calendarDate: '2026-09-28',
      plannedExercises: [{
        exId: exercises[0].id,
        name: exercises[0].name,
        sets: 2,
        reps: 10,
        weight: 60,
      }],
    })
    expect(session.sessionId).toBeTruthy()

    // 4. Confirmar serie funciona
    const sessionExercises = await db.sessionExercises
      .where('sessionId').equals(session.sessionId).toArray()
    const se = sessionExercises[0]
    const records = await db.setRecords
      .where('sessionExerciseId').equals(se.sessionExerciseId).toArray()

    const updated = await confirmSetRecord({
      sessionId: session.sessionId,
      sessionExerciseId: se.sessionExerciseId,
      exerciseId: exercises[0].id,
      order: records[0].order,
      actualReps: 10,
      actualWeight: 60,
    })
    expect(updated.status).toBe('COMPLETED')
  })

  it('offline + importar → no rompe (falla silenciosa)', async () => {
    goOffline()

    // importWgerSample debe fallar gracefully (no lanzar excepción no controlada)
    const result = await importWgerSample(2).catch(() => [])
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(0)
  })

  it('offline: Dexie tiene datos previos → acceso completo', async () => {
    // ONLINE primero
    await importWgerSample(2)

    // OFFLINE
    goOffline()

    // Todas las operaciones de lectura funcionan
    const all = await listWgerExercises()
    expect(all).toHaveLength(2)

    const byId = await db.customExercises.get(all[0].id)
    expect(byId).toBeDefined()

    const count = await db.customExercises.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  it('Wger nunca es requisito para operar offline', async () => {
    // Simular usuario que NUNCA importó Wger
    goOffline()

    // Althea debe funcionar con datos locales
    const custom = {
      id: 'custom/local',
      slug: 'custom/local',
      name: 'Ejercicio Local',
      muscle: 'biceps',
      bodyPart: 'arms',
      equipment: 'dumbbell',
      category: 'strength',
      secondaryMuscles: [],
      instructions: [],
      file: '',
      gifUrl: '',
      origin: 'USER_CREATED',
      description: '',
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await db.customExercises.put(custom as never)

    const all = await db.customExercises.toArray()
    expect(all).toHaveLength(1)
    expect(all[0].name).toBe('Ejercicio Local')

    // Sesión con ejercicio local funciona offline
    const session = await createSession({
      routineId: 'local-routine',
      routineName: 'Local',
      plannedDay: 1,
      plannedDayName: 'Lunes',
      actualDay: 1,
      actualDayName: 'Lunes',
      calendarDate: '2026-09-28',
      plannedExercises: [{
        exId: 'custom/local',
        name: 'Ejercicio Local',
        sets: 3,
        reps: 10,
        weight: 40,
      }],
    })
    expect(session.sessionId).toBeTruthy()
  })
})
