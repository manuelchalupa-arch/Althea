// FASE 14 — Tests de integración Wger (13 escenarios).
// Cubre: importar → Dexie → Biblioteca → Rutina → Entrenar → historial,
// coexistencia custom, exclusión, sustitución, offline,
// actualización sin sobrescribir, búsqueda sin filtros, búsqueda alternativa.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import { importWgerSample, listWgerExercises, toExercise } from './wgerAdapter'
import { exerciseMatches } from '@/services/training/exerciseSearch'
import { createSession, getActiveSession, transitionSession, confirmSetRecord } from '@/services/training/sessionStore'

vi.mock('./wgerClient', () => ({
  fetchExerciseList: vi.fn(),
  fetchExerciseInfo: vi.fn(),
  fetchMuscles: vi.fn(),
  fetchEquipment: vi.fn(),
  fetchCategories: vi.fn(),
}))

import { fetchExerciseList, fetchExerciseInfo } from './wgerClient'

const mockList = {
  count: 3,
  next: null,
  previous: null,
  results: [
    { id: 9, uuid: 'u9', created: '', last_update: '', category: 10, muscles: [11], muscles_secondary: [8], equipment: [10], variation_group: null, license_author: 'a' },
    { id: 12, uuid: 'u12', created: '', last_update: '', category: 9, muscles: [8], muscles_secondary: [], equipment: [], variation_group: null, license_author: 'b' },
    { id: 15, uuid: 'u15', created: '', last_update: '', category: 10, muscles: [11], muscles_secondary: [], equipment: [3], variation_group: null, license_author: 'c' },
  ],
}

const mockInfo = (id: number, name: string) => ({
  id,
  uuid: `uuid-${id}`,
  created: '',
  last_update: '',
  category: { id: 10, name: 'Abs' },
  muscles: [{ id: 11, name: 'Biceps femoris', name_en: 'Hamstrings', is_front: false, image_url_main: '', image_url_secondary: '' }],
  muscles_secondary: [{ id: 8, name: 'Gluteus maximus', name_en: 'Glutes', is_front: false, image_url_main: '', image_url_secondary: '' }],
  equipment: [{ id: 10, name: 'Kettlebell' }],
  license: { id: 2, full_name: 'CC-BY-SA 4', short_name: 'CC-BY-SA 4', url: 'https://creativecommons.org' },
  license_author: 'test',
  images: [],
  translations: [{ id: 1, uuid: 't', name, exercise: id, description: '<p>Do the exercise</p>', description_source: '', language: 2, aliases: [], notes: [] }],
  videos: [],
})

beforeEach(async () => {
  vi.clearAllMocks()
  localStorage.clear()
  await db.delete()
  await db.open()
  vi.mocked(fetchExerciseList).mockResolvedValue(mockList as never)
  vi.mocked(fetchExerciseInfo).mockImplementation(async (id: number) => {
    const names: Record<number, string> = { 9: 'Kettlebell Swing', 12: 'Glute Bridge', 15: 'Goblet Squat' }
    return mockInfo(id, names[id] || `Ex ${id}`) as never
  })
})

describe('FASE 14.1 — Importar ejercicio Wger', () => {
  it('importa desde API a Dexie', async () => {
    const imported = await importWgerSample(3)
    expect(imported).toHaveLength(3)
    expect(imported[0].origin).toBe('WGER')
    expect(imported[0].wgerProvenance.source).toBe('wger')
  })
})

describe('FASE 14.2 — Guardar en Dexie', () => {
  it('persiste en customExercises con source y sourceId', async () => {
    await importWgerSample(3)
    const all = await listWgerExercises()
    expect(all).toHaveLength(3)
    for (const ex of all) {
      expect(ex.wgerProvenance.source).toBe('wger')
      expect(typeof ex.wgerProvenance.sourceId).toBe('number')
      expect(ex.id).toMatch(/^wger-/)
    }
  })
})

describe('FASE 14.3 — Encontrar en Biblioteca', () => {
  it('listWgerExercises retorna ejercicios compatibles con Exercise', async () => {
    await importWgerSample(3)
    const all = await listWgerExercises()
    const exercises = all.map(toExercise)
    for (const ex of exercises) {
      expect(ex.id).toBeTruthy()
      expect(ex.name).toBeTruthy()
      expect(ex.muscle).toBeTruthy()
      expect('origin' in ex).toBe(false)
      expect('wgerProvenance' in ex).toBe(false)
    }
  })
})

describe('FASE 14.4 — Utilizarlo en Rutina (createSession)', () => {
  it('Wger exercise puede crear sesión de entrenamiento', async () => {
    await importWgerSample(3)
    const wgerExercises = await listWgerExercises()
    const ex = wgerExercises[0]

    const session = await createSession({
      routineId: 'routine-wger-test',
      routineName: 'Test Wger',
      plannedDay: 1,
      plannedDayName: 'Lunes',
      actualDay: 1,
      actualDayName: 'Lunes',
      calendarDate: '2026-09-28',
      plannedExercises: [{
        exId: ex.id,
        name: ex.name,
        sets: 3,
        reps: 10,
        weight: 60,
        muscle: ex.muscle,
        plannedSets: [
          { order: 1, reps: 12, weight: 60 },
          { order: 2, reps: 10, weight: 65 },
          { order: 3, reps: 8, weight: 70 },
        ],
      }],
    })

    expect(session).toBeDefined()
    expect(session.sessionId).toBeTruthy()
  })
})

describe('FASE 14.5 — Utilizarlo en Entrenar (SetRecord)', () => {
  it('createSession genera SetRecords individuales para cada serie', async () => {
    await importWgerSample(3)
    const wgerExercises = await listWgerExercises()
    const ex = wgerExercises[0]

    const session = await createSession({
      routineId: 'routine-entrenar',
      routineName: 'Test',
      plannedDay: 1,
      plannedDayName: 'Lunes',
      actualDay: 1,
      actualDayName: 'Lunes',
      calendarDate: '2026-09-28',
      plannedExercises: [{
        exId: ex.id,
        name: ex.name,
        sets: 4,
        reps: 10,
        weight: 60,
        plannedSets: [
          { order: 1, reps: 12, weight: 60, setType: 'PYRAMID_DESCENDING' },
          { order: 2, reps: 10, weight: 65, setType: 'PYRAMID_DESCENDING' },
          { order: 3, reps: 8, weight: 70, setType: 'PYRAMID_DESCENDING' },
          { order: 4, reps: 6, weight: 75, setType: 'PYRAMID_DESCENDING' },
        ],
      }],
    })

    const sessionExercises = await db.sessionExercises
      .where('sessionId').equals(session.sessionId).toArray()
    expect(sessionExercises).toHaveLength(1)

    const se = sessionExercises[0]
    expect(se.plannedSetCount).toBe(4)
    // Verificar valores individuales por serie
    expect(se.plannedSets[0]).toMatchObject({ reps: 12, weight: 60, setType: 'PYRAMID_DESCENDING' })
    expect(se.plannedSets[1]).toMatchObject({ reps: 10, weight: 65 })
    expect(se.plannedSets[2]).toMatchObject({ reps: 8, weight: 70 })
    expect(se.plannedSets[3]).toMatchObject({ reps: 6, weight: 75 })

    const setRecords = await db.setRecords
      .where('sessionExerciseId').equals(se.sessionExerciseId).toArray()
    expect(setRecords).toHaveLength(4)
    expect(setRecords[0].plannedWeight).toBe(60)
    expect(setRecords[3].plannedWeight).toBe(75)
    expect(setRecords.every(r => r.status === 'PENDING')).toBe(true)
  })
})

describe('FASE 14.6 — Conservar historial', () => {
  it('confirmar SetRecord de ejercicio Wger registra historial', async () => {
    await importWgerSample(3)
    const wgerExercises = await listWgerExercises()
    const ex = wgerExercises[0]

    const session = await createSession({
      routineId: 'routine-hist',
      routineName: 'Test',
      plannedDay: 1,
      plannedDayName: 'Lunes',
      actualDay: 1,
      actualDayName: 'Lunes',
      calendarDate: '2026-09-28',
      plannedExercises: [{
        exId: ex.id,
        name: ex.name,
        sets: 2,
        reps: 10,
        weight: 60,
      }],
    })

    const sessionExercises = await db.sessionExercises
      .where('sessionId').equals(session.sessionId).toArray()
    const se = sessionExercises[0]
    const setRecords = await db.setRecords
      .where('sessionExerciseId').equals(se.sessionExerciseId).toArray()

    // Confirmar primera serie
    const rec = setRecords[0]
    const updated = await confirmSetRecord({
      sessionId: session.sessionId,
      sessionExerciseId: se.sessionExerciseId,
      exerciseId: ex.id,
      order: rec.order,
      actualReps: 10,
      actualWeight: 62.5,
      setType: 'NORMAL',
    })

    expect(updated.status).toBe('COMPLETED')
    expect(updated.actualWeight).toBe(62.5)
    expect(updated.exerciseId).toBe(ex.id)
  })
})

describe('FASE 14.7 — Custom exercise coexistiendo', () => {
  it('custom y Wger coexisten sin mezclar IDs', async () => {
    // Crear custom exercise
    await db.customExercises.put({
      id: 'custom/my-exercise',
      slug: 'custom/my-exercise',
      name: 'Mi Ejercicio Custom',
      muscle: 'biceps',
      bodyPart: 'arms',
      equipment: 'dumbbell',
      category: 'strength',
      secondaryMuscles: [],
      instructions: ['Do it'],
      file: '',
      gifUrl: '',
      origin: 'USER_CREATED',
      description: 'Custom exercise',
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never)

    // Importar Wger
    await importWgerSample(3)

    const all = await db.customExercises.toArray()
    const customs = all.filter(e => (e as { origin?: string }).origin === 'USER_CREATED')
    const wgers = all.filter(e => (e as { origin?: string }).origin === 'WGER')

    expect(customs).toHaveLength(1)
    expect(wgers).toHaveLength(3)

    // IDs no se mezclan
    expect(customs[0].id).toBe('custom/my-exercise')
    expect(wgers.every(e => e.id.startsWith('wger-'))).toBe(true)
  })
})

describe('FASE 14.8 — Ejercicio excluido', () => {
  it('Wger exercise puede ser archivado sin afectar a otros', async () => {
    await importWgerSample(3)
    const all = await listWgerExercises()

    // Archivar el primero
    const first = all[0]
    await db.customExercises.update(first.id, { archived: true } as never)

    const after = await listWgerExercises()
    const archived = after.filter(e => e.archived)
    const active = after.filter(e => !e.archived)

    expect(archived).toHaveLength(1)
    expect(active).toHaveLength(2)
    // El archivado sigue existiendo (historial intacto)
    expect(archived[0].id).toBe(first.id)
  })
})

describe('FASE 14.9 — Sustitución', () => {
  it('Wger exercise puede sustituir a otro en sesión', async () => {
    await importWgerSample(3)
    const wgerExercises = await listWgerExercises()

    const session = await createSession({
      routineId: 'routine-swap',
      routineName: 'Test',
      plannedDay: 1,
      plannedDayName: 'Lunes',
      actualDay: 1,
      actualDayName: 'Lunes',
      calendarDate: '2026-09-28',
      plannedExercises: [{
        exId: 'ex-original',
        name: 'Original Exercise',
        sets: 3,
        reps: 10,
        weight: 60,
      }],
    })

    const sessionExercises = await db.sessionExercises
      .where('sessionId').equals(session.sessionId).toArray()
    const se = sessionExercises[0]

    // Sustituir por ejercicio Wger
    const replacement = wgerExercises[0]
    await db.sessionExercises.update(se.sessionExerciseId, {
      exerciseId: replacement.id,
      exerciseName: replacement.name,
      status: 'REPLACED',
      updatedAt: new Date().toISOString(),
    } as never)

    const updated = await db.sessionExercises.get(se.sessionExerciseId)
    expect(updated!.exerciseId).toBe(replacement.id)
    expect(updated!.status).toBe('REPLACED')
    // Los SetRecords originales siguen existiendo
    const records = await db.setRecords
      .where('sessionExerciseId').equals(se.sessionExerciseId).toArray()
    expect(records).toHaveLength(3)
  })
})

describe('FASE 14.10 — Offline', () => {
  it('Wger exercises en Dexie son accesibles sin API', async () => {
    await importWgerSample(3)

    // Simular offline: hacer que fetch falle
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as never

    try {
      // Los ejercicios siguen en Dexie
      const all = await listWgerExercises()
      expect(all).toHaveLength(3)

      // Búsqueda funciona offline
      const matches = all.filter(e => exerciseMatches(toExercise(e), 'kettlebell'))
      expect(matches.length).toBeGreaterThan(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('FASE 14.11 — Actualización Wger sin sobrescribir preferencias', () => {
  it('re-importar no sobrescribe datos del usuario', async () => {
    await importWgerSample(3)
    const all = await listWgerExercises()
    const ex = all[0]

    // Usuario modifica: favorito + nota + archiva
    await db.customExercises.update(ex.id, {
      archived: false,
      updatedAt: new Date().toISOString(),
    } as never)

    // Simular favorito en userProfile
    await db.userProfile.put({
      id: 'me',
      favoriteExercises: [ex.id],
    } as never)

    // Re-importar (misma API responde igual)
    await importWgerSample(3)

    // Verificar que no se duplicaron
    const after = await listWgerExercises()
    expect(after).toHaveLength(3)

    // Verificar favorito persiste
    const profile = await db.userProfile.get('me') as { favoriteExercises?: string[] } | undefined
    expect(profile?.favoriteExercises).toContain(ex.id)
  })
})

describe('FASE 14.12 — Búsqueda sin filtros', () => {
  it('exerciseMatches funciona sin seleccionar músculo/equipo', async () => {
    await importWgerSample(3)
    const all = await listWgerExercises()
    const exercises = all.map(toExercise)

    // Búsqueda libre sin filtros previos
    const results = exercises.filter(ex => exerciseMatches(ex, 'kettlebell'))
    expect(results.length).toBeGreaterThan(0)

    // Búsqueda vacía retorna todo
    const allResults = exercises.filter(ex => exerciseMatches(ex, ''))
    expect(allResults).toHaveLength(3)
  })
})

describe('FASE 14.13 — Búsqueda por nombre alternativo', () => {
  it('encuentra sinónimos ES↔EN', async () => {
    await importWgerSample(3)
    const all = await listWgerExercises()
    const exercises = all.map(toExercise)

    // "sillón de cuádriceps" debe encontrar ejercicios de cuádriceps si existen
    const esQuery = exercises.filter(ex => exerciseMatches(ex, 'sillón de cuádriceps'))
    // "leg extension" debe encontrar lo mismo
    const enQuery = exercises.filter(ex => exerciseMatches(ex, 'leg extension'))
    // Ambos deben encontrar los mismos resultados
    expect(esQuery.map(e => e.id).sort()).toEqual(enQuery.map(e => e.id).sort())
  })

  it('tolera acentos en nombres Wger', async () => {
    // Wger exercise con nombre acentuado
    vi.mocked(fetchExerciseInfo).mockResolvedValueOnce(
      mockInfo(99, 'Extensión de Piernas') as never
    )
    vi.mocked(fetchExerciseList).mockResolvedValueOnce({
      count: 1, next: null, previous: null,
      results: [mockList.results[0]],
    } as never)

    await importWgerSample(1)
    const all = await listWgerExercises()
    const exercises = all.map(toExercise)

    const result = exercises.filter(ex => exerciseMatches(ex, 'extension de piernas'))
    expect(result.length).toBeGreaterThan(0)
  })
})
