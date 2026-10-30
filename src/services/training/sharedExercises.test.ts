import { describe, it, expect, beforeEach, vi } from 'vitest'

// Biblioteca compartida: todo ejercicio creado por cualquier usuario se
// publica en la colección top-level sharedExercises, legible por todos y
// ajena al usuario que lo creó (firestore.rules: delete: false ⇒ sobrevive
// a la eliminación de la cuenta). Aquí se mockea Firestore en memoria.

const mem = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  uid: 'creator-uid' as string | null,
}))

vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
  setDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    mem.docs.set(ref.path, data)
  },
  getDocs: async () => ({
    forEach: (cb: (snap: { id: string; data: () => unknown }) => void) => {
      for (const [path, data] of mem.docs) {
        cb({ id: path.split('/').pop() as string, data: () => data })
      }
    },
  }),
}))

vi.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: mem.uid ? { uid: mem.uid } : null }),
}))

vi.mock('@/services/firebase/config', () => ({ firebaseDb: () => ({}) }))

import { db } from '@/services/storage/db'
import { createCustomExercise } from './customExercises'
import { listSharedExercises, publishSharedExercise } from './sharedExercises'
import type { CustomExercise } from './customExercises'

const input = {
  name: 'Press inclinado con mancuernas',
  description: 'Press inclinado controlando la bajada.',
  bodyPart: 'chest',
  muscle: 'pectorals',
  secondaryMuscles: ['delts'],
  primaryPct: 70,
  secondaryPcts: [30],
  category: 'strength',
  equipment: 'dumbbell',
}

beforeEach(async () => {
  localStorage.clear()
  mem.docs.clear()
  mem.uid = 'creator-uid'
  await db.customExercises.clear().catch(() => null)
  await db.sharedExercises.clear().catch(() => null)
})

describe('biblioteca compartida entre usuarios', () => {
  it('crear publica TODOS los datos del ejercicio en sharedExercises', async () => {
    const created = await createCustomExercise(input)
    const shared = mem.docs.get(`sharedExercises/${created.id}`) as
      | Record<string, unknown>
      | undefined
    expect(shared).toBeTruthy()
    expect(shared).toMatchObject({
      name: input.name,
      description: input.description,
      bodyPart: input.bodyPart,
      muscle: input.muscle,
      category: input.category,
      equipment: input.equipment,
      secondaryMuscles: input.secondaryMuscles,
      origin: 'USER_CREATED',
    })
    expect(shared?.muscleBreakdown).toEqual([
      { name: 'pectorals', pct: 70, role: 'Principal' },
      { name: 'delts', pct: 30, role: 'Secundario' },
    ])
  })

  it('otro usuario lo ve: se trae del servidor y se cachea en local', async () => {
    await createCustomExercise(input)
    // Otro dispositivo: cache local vacía, solo cuenta la nube.
    await db.sharedExercises.clear()
    const list = await listSharedExercises()
    expect(list.map((e) => e.name)).toContain(input.name)
    expect(await db.sharedExercises.count()).toBe(1)
  })

  it('no duplica: mismo nombre+músculo reutiliza el documento publicado', async () => {
    await createCustomExercise(input)
    // Segunda creación con la misma clave normalizada (mayúsculas/espacios).
    await createCustomExercise({ ...input, name: `  ${input.name.toUpperCase()}  ` })
    expect(mem.docs.size).toBe(1)
  })

  it('publishSharedExercise respeta id, origen y timestamps', async () => {
    const created = await createCustomExercise(input)
    const rec = await publishSharedExercise(created as CustomExercise)
    expect(rec.id).toBe(created.id)
    expect(rec.origin).toBe('USER_CREATED')
    expect(rec.createdAt).toBeTruthy()
    expect(rec.updatedAt).toBeTruthy()
  })
})
