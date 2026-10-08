import { describe, it, expect, vi, beforeEach } from 'vitest'
import { importWgerSample, listWgerExercises, toExercise } from './wgerAdapter'

// Mock de wgerClient
vi.mock('./wgerClient', () => ({
  fetchExerciseList: vi.fn(),
  fetchExerciseInfo: vi.fn(),
}))

// Mock de Dexie (db)
vi.mock('@/services/storage/db', () => {
  const store = new Map<string, unknown>()
  return {
    db: {
      customExercises: {
        filter: (fn: (e: unknown) => boolean) => ({
          toArray: async () => Array.from(store.values()).filter(fn),
        }),
        toArray: async () => Array.from(store.values()),
        where: () => ({
          equals: () => ({
            toArray: async () => Array.from(store.values()),
          }),
        }),
        put: async (record: { id: string }) => {
          store.set(record.id, record)
          return record.id
        },
        get: async (id: string) => store.get(id),
        clear: async () => store.clear(),
      },
    },
  }
})

import { fetchExerciseList, fetchExerciseInfo } from './wgerClient'
import { db } from '@/services/storage/db'

const mockList = {
  count: 912,
  next: null,
  previous: null,
  results: [
    { id: 9, uuid: 'abc', created: '', last_update: '', category: 10, muscles: [11], muscles_secondary: [8], equipment: [10], variation_group: null, license_author: 'test' },
    { id: 12, uuid: 'def', created: '', last_update: '', category: 9, muscles: [8], muscles_secondary: [], equipment: [], variation_group: null, license_author: 'test' },
  ],
}

const mockInfo9 = {
  id: 9,
  uuid: 'abc',
  created: '',
  last_update: '',
  category: { id: 10, name: 'Abs' },
  muscles: [{ id: 11, name: 'Biceps femoris', name_en: 'Hamstrings', is_front: false, image_url_main: '', image_url_secondary: '' }],
  muscles_secondary: [{ id: 8, name: 'Gluteus maximus', name_en: 'Glutes', is_front: false, image_url_main: '', image_url_secondary: '' }],
  equipment: [{ id: 10, name: 'Kettlebell' }],
  license: { id: 2, full_name: 'CC-BY-SA 4', short_name: 'CC-BY-SA 4', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  license_author: 'test',
  images: [],
  translations: [{ id: 1, uuid: 't1', name: 'Kettlebell Swing', exercise: 9, description: '<p>Swing it</p>', description_source: '', language: 2, aliases: [], notes: [] }],
  videos: [],
}

const mockInfo12 = {
  ...mockInfo9,
  id: 12,
  uuid: 'def',
  category: { id: 9, name: 'Arms' },
  muscles: [{ id: 8, name: 'Gluteus maximus', name_en: 'Glutes', is_front: false, image_url_main: '', image_url_secondary: '' }],
  muscles_secondary: [],
  equipment: [],
  translations: [{ id: 2, uuid: 't2', name: 'Glute Bridge', exercise: 12, description: '<p>Bridge</p>', description_source: '', language: 2, aliases: [], notes: [] }],
}

describe('wgerAdapter', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Limpiar store mockeado
    const clearFn = (db.customExercises as unknown as { clear: () => Promise<void> })
    if (clearFn.clear) {await clearFn.clear()}
  })

  it('importa muestra de ejercicios Wger', async () => {
    vi.mocked(fetchExerciseList).mockResolvedValue(mockList as never)
    vi.mocked(fetchExerciseInfo).mockImplementation(async (id: number) => {
      if (id === 9) {return mockInfo9 as never}
      return mockInfo12 as never
    })

    const imported = await importWgerSample(2)

    expect(imported).toHaveLength(2)
    expect(imported[0].id).toBe('wger-9')
    expect(imported[0].origin).toBe('WGER')
    expect(imported[0].wgerProvenance.sourceId).toBe(9)
    expect(imported[1].id).toBe('wger-12')
  })

  it('no duplica ejercicios ya importados', async () => {
    vi.mocked(fetchExerciseList).mockResolvedValue(mockList as never)
    vi.mocked(fetchExerciseInfo).mockImplementation(async (id: number) => {
      if (id === 9) {return mockInfo9 as never}
      return mockInfo12 as never
    })

    // Primera importación
    await importWgerSample(2)
    // Segunda importación — no debe duplicar
    const secondImport = await importWgerSample(2)

    expect(secondImport).toHaveLength(0)
  })

  it('lista ejercicios Wger importados', async () => {
    vi.mocked(fetchExerciseList).mockResolvedValue(mockList as never)
    vi.mocked(fetchExerciseInfo).mockImplementation(async (id: number) => {
      if (id === 9) {return mockInfo9 as never}
      return mockInfo12 as never
    })

    await importWgerSample(2)
    const list = await listWgerExercises()

    expect(list).toHaveLength(2)
    expect(list.every(e => e.origin === 'WGER')).toBe(true)
  })

  it('convierte record a Exercise compatible con Biblioteca', async () => {
    vi.mocked(fetchExerciseList).mockResolvedValue(mockList as never)
    vi.mocked(fetchExerciseInfo).mockResolvedValue(mockInfo9 as never)

    const imported = await importWgerSample(1)
    const exercise = toExercise(imported[0])

    expect(exercise.id).toBe('wger-9')
    expect(exercise.name).toBe('Kettlebell Swing')
    expect(exercise.muscle).toBe('biceps femoris')
    expect('origin' in exercise).toBe(false)
    expect('wgerProvenance' in exercise).toBe(false)
  })

  it('maneja error de API sin romper importación', async () => {
    vi.mocked(fetchExerciseList).mockResolvedValue(mockList as never)
    vi.mocked(fetchExerciseInfo).mockRejectedValue(new Error('Network error'))

    const imported = await importWgerSample(2)
    expect(imported).toHaveLength(0)
  })
})
