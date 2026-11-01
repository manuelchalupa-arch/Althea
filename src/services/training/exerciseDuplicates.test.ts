import { describe, it, expect, beforeEach, vi } from 'vitest'

// Catálogo Gym en memoria: controlamos qué "existe en la biblioteca" remota.
const catalog = vi.hoisted(() => ({ list: [] as unknown[], fail: false }))

vi.mock('@/services/exerciseGym', () => ({
  fetchAll: async () => {
    if (catalog.fail) { throw new Error('sin red') }
    return { count: catalog.list.length, exercises: catalog.list }
  },
}))

import { db } from '@/services/storage/db'
import { findExerciseDuplicates } from './exerciseDuplicates'
import { createCustomExercise } from './customExercises'
import type { CustomInput } from './customExercises'

const input = (over: Partial<CustomInput> = {}): CustomInput => ({
  name: 'Press banca',
  description: 'demo',
  bodyPart: 'chest',
  muscle: 'pectorals',
  secondaryMuscles: ['triceps'],
  primaryPct: 70,
  secondaryPcts: [30],
  category: 'strength',
  equipment: 'barra',
  ...over,
})

const catalogEx = (over: Record<string, unknown> = {}) => ({
  id: 'pectorals/barbell-bench-press', slug: 'barbell-bench-press', name: 'Press banca',
  muscle: 'pectorals', equipment: 'barbell', bodyPart: 'chest', category: 'strength',
  secondaryMuscles: [], instructions: [], file: '', gifUrl: '', ...over,
})

beforeEach(async () => {
  localStorage.clear()
  catalog.list = []
  catalog.fail = false
  await db.customExercises.clear().catch(() => null)
  await db.sharedExercises.clear().catch(() => null)
  await db.exercises.clear().catch(() => null)
})

describe('duplicidad al crear ejercicios', () => {
  it('bloquea duplicado exacto del catálogo y createCustomExercise lanza', async () => {
    catalog.list = [catalogEx()]
    const ms = await findExerciseDuplicates({ name: 'Press banca', muscle: 'pectorals', equipment: 'barra' })
    expect(ms[0]?.level).toBe('block')
    expect(ms[0]?.name).toBe('Press banca')
    expect(ms[0]?.source).toBe('catalogo')
    await expect(createCustomExercise(input())).rejects.toThrow(/Ya existe en la biblioteca/)
  })

  it('doble confirmación: guarda pese al duplicado solo si confirmDuplicate', async () => {
    catalog.list = [catalogEx()]
    const created = await createCustomExercise(input(), { confirmDuplicate: true })
    expect(created.id.startsWith('custom/')).toBe(true)
  })

  it('coincidencia parcial (sugiere) también exige doble confirmación', async () => {
    catalog.list = [catalogEx()]
    await expect(createCustomExercise(input({ equipment: 'mancuerna' }))).rejects.toThrow(/Puede que ya exista/)
    const created = await createCustomExercise(input({ equipment: 'mancuerna' }), { confirmDuplicate: true })
    expect(created.id.startsWith('custom/')).toBe(true)
  })

  it('bloquea equivalencia ES↔EN en nombre, músculo y equipamiento (sinónimos)', async () => {
    catalog.list = [catalogEx({ name: 'Bench press' })]
    const ms = await findExerciseDuplicates({ name: 'Press banca', muscle: 'pecho', equipment: 'barra' })
    expect(ms[0]?.level).toBe('block')
  })

  it('permite el mismo movimiento con equipamiento distinto (sugiere, no bloquea)', async () => {
    catalog.list = [catalogEx()]
    const ms = await findExerciseDuplicates({ name: 'Press banca', muscle: 'pectorals', equipment: 'mancuerna' })
    expect(ms.some((m) => m.level === 'block')).toBe(false)
    expect(ms[0]?.level).toBe('suggest')
  })

  it('edita el propio ejercicio sin compararse consigo mismo (excludeId)', async () => {
    const ex = await createCustomExercise(input({ name: 'Remo unilateral en polea' }))
    const own = await findExerciseDuplicates({ name: ex.name, muscle: 'pectorals', equipment: 'cable' }, ex.id)
    expect(own).toHaveLength(0)
    const withoutExclude = await findExerciseDuplicates({ name: ex.name, muscle: 'pectorals', equipment: 'cable' })
    expect(withoutExclude[0]?.source).toBe('propio')
  })

  it('detecta duplicado del seed legacy (groupMain/equipment ES) con valores EN', async () => {
    await db.exercises.put({ id: 'ex-006', name: 'Sentadilla', groupMain: 'cuadriceps', equipment: 'barra' } as never)
    const ms = await findExerciseDuplicates({ name: 'Sentadilla', muscle: 'quads', equipment: 'barbell' })
    expect(ms[0]?.level).toBe('block')
    expect(ms[0]?.source).toBe('legado')
  })

  it('detecta duplicado en la biblioteca compartida', async () => {
    await db.sharedExercises.put({ id: 'custom/abc', name: 'Press banca', muscle: 'pectorals', equipment: 'barra', archived: false } as never)
    const ms = await findExerciseDuplicates({ name: 'Press banca', muscle: 'pectorals', equipment: 'barra' })
    expect(ms[0]?.level).toBe('block')
    expect(ms[0]?.source).toBe('compartido')
  })

  it('falla abierta: sin catálogo remoto sigue permitiendo crear', async () => {
    catalog.fail = true
    const created = await createCustomExercise(input({ name: 'Curl martillo en polea' }))
    expect(created.id.startsWith('custom/')).toBe(true)
  })
})
