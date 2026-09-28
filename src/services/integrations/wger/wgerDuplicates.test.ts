import { describe, it, expect, vi, beforeEach } from 'vitest'
import { importWgerSample, listWgerExercises } from './wgerAdapter'

// Mock de wgerClient
vi.mock('./wgerClient', () => ({
  fetchExerciseList: vi.fn(),
  fetchExerciseInfo: vi.fn(),
}))

// Mock de Dexie
vi.mock('@/services/storage/db', () => {
  const store = new Map<string, unknown>()
  return {
    db: {
      customExercises: {
        filter: (fn: (e: unknown) => boolean) => ({
          toArray: async () => Array.from(store.values()).filter(fn),
        }),
        toArray: async () => Array.from(store.values()),
        put: async (record: { id: string }) => {
          store.set(record.id, record)
          return record.id
        },
        clear: async () => store.clear(),
      },
    },
  }
})

import { fetchExerciseList, fetchExerciseInfo } from './wgerClient'

const mockList = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 9, uuid: 'abc', created: '', last_update: '', category: 10, muscles: [11], muscles_secondary: [], equipment: [10], variation_group: null, license_author: 't' },
    { id: 12, uuid: 'def', created: '', last_update: '', category: 9, muscles: [8], muscles_secondary: [], equipment: [], variation_group: null, license_author: 't' },
  ],
}

const mockInfo = (id: number) => ({
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
  translations: [{ id: 1, uuid: 't', name: `Exercise ${id}`, exercise: id, description: '<p>desc</p>', description_source: '', language: 2, aliases: [], notes: [] }],
  videos: [],
})

describe('FASE 15 — Wger no crea duplicados', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const clearFn = (await import('@/services/storage/db')).db.customExercises as unknown as { clear?: () => Promise<void> }
    if (clearFn.clear) {await clearFn.clear()}
  })

  it('importar una vez → 2 ejercicios', async () => {
    vi.mocked(fetchExerciseList).mockResolvedValue(mockList as never)
    vi.mocked(fetchExerciseInfo).mockImplementation(async (id: number) => mockInfo(id) as never)

    const first = await importWgerSample(2)
    expect(first).toHaveLength(2)
  })

  it('importar dos veces → no duplica', async () => {
    vi.mocked(fetchExerciseList).mockResolvedValue(mockList as never)
    vi.mocked(fetchExerciseInfo).mockImplementation(async (id: number) => mockInfo(id) as never)

    await importWgerSample(2)
    const second = await importWgerSample(2)

    expect(second).toHaveLength(0)

    const all = await listWgerExercises()
    expect(all).toHaveLength(2)
  })

  it('importar tres veces → sigue en 2', async () => {
    vi.mocked(fetchExerciseList).mockResolvedValue(mockList as never)
    vi.mocked(fetchExerciseInfo).mockImplementation(async (id: number) => mockInfo(id) as never)

    await importWgerSample(2)
    await importWgerSample(2)
    await importWgerSample(2)

    const all = await listWgerExercises()
    expect(all).toHaveLength(2)
  })

  it('identidad basada en source + sourceId', async () => {
    vi.mocked(fetchExerciseList).mockResolvedValue(mockList as never)
    vi.mocked(fetchExerciseInfo).mockImplementation(async (id: number) => mockInfo(id) as never)

    await importWgerSample(2)
    const all = await listWgerExercises()

    const identities = all.map(e => `${e.wgerProvenance.source}:${e.wgerProvenance.sourceId}`)
    expect(identities).toContain('wger:9')
    expect(identities).toContain('wger:12')
    // Sin duplicados en identidades
    expect(new Set(identities).size).toBe(identities.length)
  })

  it('altheaId como identidad local separada de sourceId', async () => {
    vi.mocked(fetchExerciseList).mockResolvedValue(mockList as never)
    vi.mocked(fetchExerciseInfo).mockImplementation(async (id: number) => mockInfo(id) as never)

    await importWgerSample(2)
    const all = await listWgerExercises()

    for (const ex of all) {
      // altheaId tiene prefijo wger- para distinguirlo
      expect(ex.id).toMatch(/^wger-/)
      // sourceId es el número Wger original
      expect(typeof ex.wgerProvenance.sourceId).toBe('number')
      // No usar sourceId como ID primario
      expect(ex.id).not.toBe(String(ex.wgerProvenance.sourceId))
    }
  })

  it('al importar nuevo ejercicio no duplica los existentes', async () => {
    vi.mocked(fetchExerciseList).mockResolvedValue(mockList as never)
    vi.mocked(fetchExerciseInfo).mockImplementation(async (id: number) => mockInfo(id) as never)

    await importWgerSample(2)

    // Agregar un tercer ejercicio a la lista
    const extendedList = {
      ...mockList,
      results: [...mockList.results, { id: 15, uuid: 'ghi', created: '', last_update: '', category: 10, muscles: [11], muscles_secondary: [], equipment: [], variation_group: null, license_author: 't' }],
    }
    vi.mocked(fetchExerciseList).mockResolvedValue(extendedList as never)

    await importWgerSample(3)
    const all = await listWgerExercises()
    expect(all).toHaveLength(3)
  })
})
