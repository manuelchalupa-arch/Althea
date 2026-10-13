// Tests de identidad de ejercicios por ID estable (§2 del Prompt 3).
//
// Cubren los 4 flujos que usa la app:
//   búsqueda (biblioteca/visor), sustitución (swap), variantes (catálogo)
//   y sesiones antiguas (legacy con nombre guardado).
//
// Verificación de no-mutación: el módulo es de SOLO LECTURA. Los registros de
// sesión (sessionExercises/setLogs/setRecords) no se tocan y las tablas de
// catálogo quedan con los mismos conteos.

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import {
  resolveExerciseIdentity,
  apiMuscleFor,
  scoreNameMatch,
  LEGACY_ID_ALIASES,
} from './exerciseIdentity'

// Las tablas se escriben con filas parciales en la app real (sessionStore crea
// { id, name, groupMain } para ids desconocidos), así que los fixtures también
// son parciales y se guardan vía db.table().
const putExercise = (row: Record<string, unknown>) => db.table('exercises').put(row as never)
const putCustom = (row: Record<string, unknown>) => db.table('customExercises').put(row as never)

const SEED_EX = {
  id: 'ex-001',
  name: 'Press banca',
  muscleGroup: 'pecho',
  equipment: 'barra',
}

const GYM_EX = {
  id: 'pectorals/barbell-bench-press',
  name: 'Barbell Bench Press',
  muscle: 'pectorals',
  gifUrl: 'https://cdn.example/bench.gif',
}

const CUSTOM_EX = {
  id: 'custom/abcd1234',
  name: 'Press unilateral en polea',
  muscle: 'pectorals',
  bodyPart: 'chest',
  equipment: 'cable',
  category: 'strength',
  gifUrl: '',
}

async function clearCatalogs() {
  await db.table('exercises').clear().catch(() => null)
  await db.table('customExercises').clear().catch(() => null)
  await db.table('sessionExercises').clear().catch(() => null)
  await db.table('setRecords').clear().catch(() => null)
  await db.setLogs.clear().catch(() => null)
}

beforeEach(async () => {
  localStorage.clear()
  await clearCatalogs()
})

describe('búsqueda: resolución por ID estable', () => {
  it('resuelve un id seed del catálogo local', async () => {
    await putExercise(SEED_EX)

    const id = await resolveExerciseIdentity('ex-001')

    expect(id).toMatchObject({
      exerciseId: 'ex-001',
      source: 'stored-id',
      resolved: true,
      name: 'Press banca',
      muscle: 'pecho',
    })
  })

  it('resuelve un id estilo gym muscle/slug', async () => {
    await putExercise(GYM_EX)

    const id = await resolveExerciseIdentity('pectorals/barbell-bench-press')

    expect(id.source).toBe('stored-id')
    expect(id.resolved).toBe(true)
    expect(id.gifUrl).toBe(GYM_EX.gifUrl)
    expect(id.muscle).toBe('pectorals')
  })

  it('resuelve un ejercicio personalizado por su id', async () => {
    await putCustom(CUSTOM_EX)

    const id = await resolveExerciseIdentity('custom/abcd1234')

    expect(id.source).toBe('custom-id')
    expect(id.resolved).toBe(true)
    expect(id.name).toBe('Press unilateral en polea')
  })

  it('el ID manda aunque el nombre guardado en la sesión diga otra cosa', async () => {
    // Sesión guardó nombre desactualizado/erróneo; el id es la verdad.
    await putExercise(SEED_EX)

    const id = await resolveExerciseIdentity('ex-001', { legacyName: 'Press inclinado con mancuernas' })

    expect(id.exerciseId).toBe('ex-001')
    expect(id.name).toBe('Press banca')
    expect(id.source).toBe('stored-id')
  })
})

describe('fallback legacy controlado (por nombre exacto)', () => {
  it('resuelve por nombre exacto aunque cambien mayúsculas y acentos', async () => {
    await putExercise(SEED_EX)

    const id = await resolveExerciseIdentity('id-que-no-existe', { legacyName: 'PRESS BANCA' })

    expect(id.source).toBe('legacy-name-exact')
    expect(id.resolved).toBe(true)
    expect(id.exerciseId).toBe('ex-001')
  })

  it('resuelve el nombre acentuado guardado por sesiones viejas', async () => {
    await putExercise({ id: 'ex-005', name: 'Jalón al pecho', muscleGroup: 'espalda' })

    const id = await resolveExerciseIdentity('id-viejo', { legacyName: 'jalon al pecho' })

    expect(id.exerciseId).toBe('ex-005')
    expect(id.source).toBe('legacy-name-exact')
  })

  it('NO adivina cuando el nombre es ambiguo (dos candidatos)', async () => {
    await putExercise({ id: 'a-1', name: 'Press banca', muscleGroup: 'pecho' })
    await putExercise({ id: 'a-2', name: 'Press Banca', muscleGroup: 'pecho' })

    const id = await resolveExerciseIdentity('id-x', { legacyName: 'Press banca' })

    expect(id.source).toBe('unresolved')
    expect(id.resolved).toBe(false)
    expect(id.exerciseId).toBe('id-x')
  })

  it('NO adivina cuando no hay candidato por nombre', async () => {
    await putExercise(SEED_EX)

    const id = await resolveExerciseIdentity('id-x', { legacyName: 'Dominadas lastradas' })

    expect(id.source).toBe('unresolved')
    expect(id.resolved).toBe(false)
  })

  it('un id custom inexistente NO cae a matching por nombre (se conserva el id)', async () => {
    await putExercise(SEED_EX)

    const id = await resolveExerciseIdentity('custom/perdido', { legacyName: 'Press banca' })

    expect(id.source).toBe('unresolved')
    expect(id.resolved).toBe(false)
    expect(id.exerciseId).toBe('custom/perdido')
  })
})

describe('sesiones antiguas', () => {
  it('sin id y sólo con el nombre guardado, resuelve y recupera el id estable', async () => {
    await putExercise(SEED_EX)

    const id = await resolveExerciseIdentity('', { legacyName: 'Press banca' })

    expect(id.resolved).toBe(true)
    expect(id.exerciseId).toBe('ex-001')
    expect(id.source).toBe('legacy-name-exact')
  })

  it('sin id y sin nombre queda unresolved y no inventa identidad', async () => {
    const id = await resolveExerciseIdentity(undefined, { legacyName: null })

    expect(id).toMatchObject({ exerciseId: '', source: 'unresolved', resolved: false, name: '' })
  })

  it('conserva el nombre provisto para mostrar cuando no resuelve', async () => {
    const id = await resolveExerciseIdentity('ex-999', { legacyName: 'Ejercicio borrado' })

    expect(id.source).toBe('unresolved')
    expect(id.name).toBe('Ejercicio borrado')
    expect(id.exerciseId).toBe('ex-999')
  })
})

describe('sustitución y variantes: la identidad no cambia el id de origen', () => {
  it('resuelve el original de un swap por id', async () => {
    await putExercise(GYM_EX)

    const original = await resolveExerciseIdentity('pectorals/barbell-bench-press')

    expect(original.resolved).toBe(true)
    expect(original.source).toBe('stored-id')
  })

  it('resuelve el original de un swap por nombre (sesión previa al cambio de id)', async () => {
    await putExercise({ id: 'quads/barbell-squat', name: 'Sentadilla con barra', muscle: 'quads' })

    const original = await resolveExerciseIdentity('id-desconocido', { legacyName: 'Sentadilla con barra' })

    expect(original.exerciseId).toBe('quads/barbell-squat')
    expect(original.muscle).toBe('quads')
  })

  it('los alias legacy seed siguen apuntando al mismo id gym (sin cambio)', () => {
    expect(LEGACY_ID_ALIASES['ex-001']).toBe('pectorals/barbell-bench-press')
    expect(LEGACY_ID_ALIASES['ex-006']).toBe('quads/barbell-squat')
    expect(LEGACY_ID_ALIASES['ex-008']).toBe('hamstrings/barbell-deadlift')
    // ex-009 deliberadamente no tiene alias (comportamiento original)
    expect(LEGACY_ID_ALIASES['ex-009']).toBeUndefined()
  })
})

describe('apiMuscleFor (mapa consolidado)', () => {
  it('traduce grupos en español, con y sin acentos', () => {
    expect(apiMuscleFor('pecho')).toBe('pectorals')
    expect(apiMuscleFor('PECHO')).toBe('pectorals')
    expect(apiMuscleFor('Bíceps')).toBe('biceps')
    expect(apiMuscleFor('isquios')).toBe('hamstrings')
    expect(apiMuscleFor('glúteos')).toBe('glutes')
  })

  it('tiene alcance conservador para piernas (familia NO expandida)', () => {
    expect(apiMuscleFor('piernas')).toBe('quads')
    expect(apiMuscleFor('cuadriceps')).toBe('quads')
  })

  it('deja pasar las formas que ya vienen en el idioma de la API', () => {
    expect(apiMuscleFor('lats')).toBe('lats')
    expect(apiMuscleFor('upper-back')).toBe('upper-back')
    expect(apiMuscleFor('cardio')).toBe('cardio')
  })

  it('cae a pectorals ante grupos vacíos o desconocidos (igual que antes)', () => {
    expect(apiMuscleFor('')).toBe('pectorals')
    expect(apiMuscleFor(null)).toBe('pectorals')
  })
})

describe('scoreNameMatch (sólo visualización, nunca identidad)', () => {
  it('punta alto cuando el nombre coincide', () => {
    expect(scoreNameMatch('Press banca', { name: 'Barbell Bench Press', slug: 'barbell-bench-press' }))
      .toBeGreaterThan(1)
    expect(scoreNameMatch('Press inclinado con mancuernas', { name: 'Press inclinado mancuernas' }))
      .toBeGreaterThan(scoreNameMatch('Press inclinado con mancuernas', { name: 'Press banca' }))
  })

  it('devuelve -1 cuando no hay coincidencia razonable', () => {
    expect(scoreNameMatch('Sentadilla', { name: 'Lat Pulldown' })).toBe(-1)
    expect(scoreNameMatch('', { name: 'Press banca' })).toBe(-1)
  })
})

describe('sólo lectura: no muta catálogo ni registros de sesión', () => {
  it('las tablas quedan con los mismos conteos después de resolver', async () => {
    await putExercise(SEED_EX)
    await putExercise(GYM_EX)
    await putCustom(CUSTOM_EX)
    await db.setLogs.put({ id: 'log-1', sessionId: 's1', exerciseId: 'ex-001', setNumber: 1, weight: 60, reps: 8, completed: true, createdAt: new Date().toISOString() })

    await resolveExerciseIdentity('ex-001')
    await resolveExerciseIdentity('custom/abcd1234', { legacyName: 'Press banca' })
    await resolveExerciseIdentity('inexistente', { legacyName: 'Press banca' })

    expect(await db.exercises.count()).toBe(2)
    expect(await db.customExercises.count()).toBe(1)
    expect(await db.setLogs.count()).toBe(1)
    expect((await db.setLogs.get('log-1'))?.exerciseId).toBe('ex-001')
  })
})
