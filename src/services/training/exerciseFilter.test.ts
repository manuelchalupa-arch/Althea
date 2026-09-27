import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import { filterExercises, filterByMuscleGroup } from './exerciseFilter'
import { parseDayMuscles } from '@/utils/muscleMap'
import { createCustomExercise } from './customExercises'
import type { Exercise } from '@/services/exerciseGym'

function mk(id: string, name: string, muscle: string, bodyPart = 'legs', equipment = 'barbell', category = 'strength', secondary: string[] = [], movementPattern?: string): Exercise {
  return {
    id,
    slug: id.split('/').pop()!,
    name,
    muscle,
    bodyPart,
    equipment,
    category,
    secondaryMuscles: secondary,
    instructions: [],
    file: '',
    gifUrl: '',
    movementPattern: movementPattern as never,
  }
}

const sample: Exercise[] = [
  mk('quads/squat', 'Sentadilla', 'quads', 'legs', 'barbell', 'strength', [], 'squat'),
  mk('quads/leg-press', 'Prensa de piernas', 'quads', 'legs', 'machine', 'strength', [], 'squat'),
  mk('hamstrings/leg-curl', 'Curl femoral', 'hamstrings', 'legs', 'machine', 'strength', [], 'hinge'),
  mk('glutes/hip-thrust', 'Hip thrust', 'glutes', 'legs', 'barbell', 'strength', [], 'hinge'),
  mk('calves/calf-raise', 'Elevación de talones', 'calves', 'legs', 'machine', 'strength'),
  mk('abductors/abductor', 'Abducción cadera', 'abductors', 'legs', 'machine', 'strength'),
  mk('lats/pull-up', 'Dominadas', 'lats', 'back', 'bodyweight', 'strength', [], 'pull'),
  mk('upper-back/row', 'Remo con barra', 'upper-back', 'back', 'barbell', 'strength', [], 'pull'),
  mk('traps/shrug', 'Encogimiento', 'traps', 'back', 'dumbbell', 'strength'),
  mk('biceps/curl', 'Curl bíceps', 'biceps', 'arms', 'dumbbell', 'strength'),
  mk('quads/squat2', 'Sentadilla frontal', 'quads', 'legs', 'barbell', 'strength', ['glutes'], 'squat'),
]

describe('BLOQUE 9 — Filtrado correcto de ejercicios', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('1. Piernas devuelve múltiples ejercicios (no solo uno)', () => {
    const res = filterByMuscleGroup(sample, 'Piernas')
    expect(res.length).toBeGreaterThanOrEqual(5)
    expect(res.some(e => e.muscle === 'quads')).toBe(true)
    expect(res.some(e => e.muscle === 'hamstrings')).toBe(true)
    expect(res.some(e => e.muscle === 'glutes')).toBe(true)
  })

  it('2. Espalda devuelve múltiples ejercicios', () => {
    const res = filterByMuscleGroup(sample, 'Espalda')
    expect(res.length).toBeGreaterThanOrEqual(2)
    expect(res.some(e => e.muscle === 'lats')).toBe(true)
    expect(res.some(e => e.muscle === 'upper-back')).toBe(true)
  })

  it('3. combinar filtros: Piernas + gimnasio (equipamiento)', () => {
    const res = filterExercises(sample, { group: 'Piernas', equipment: 'machine' })
    // Piernas + machine: leg-press, leg-curl, calf-raise, abductor
    expect(res.length).toBeGreaterThanOrEqual(3)
    expect(res.every(e => e.equipment === 'machine')).toBe(true)
    expect(res.every(e => ['quads', 'hamstrings', 'calves', 'abductors', 'glutes'].includes(e.muscle) || e.bodyPart === 'legs')).toBe(true)
  })

  it('3b. Piernas + Sentadilla (movimiento squat) muestra todos los que cumplen ambas', () => {
    const res = filterExercises(sample, { group: 'Piernas', movement: 'squat' })
    expect(res.length).toBeGreaterThanOrEqual(2)
    expect(res.some(e => e.name === 'Sentadilla')).toBe(true)
    expect(res.some(e => e.name === 'Prensa de piernas')).toBe(true)
    // no debe reemplazar resultados con un solo elemento
    expect(res.length).not.toBe(1)
  })

  it('4. búsqueda textual sobre nombre y datos relevantes', () => {
    const res = filterExercises(sample, { query: 'sentadilla' })
    expect(res.length).toBe(2)
    expect(res.every(e => e.name.toLowerCase().includes('sentadilla'))).toBe(true)
    const q2 = filterExercises(sample, { query: 'glutes' })
    expect(q2.some(e => e.muscle === 'glutes' || e.secondaryMuscles.includes('glutes'))).toBe(true)
  })

  it('5. equipamiento filtra dentro del conjunto', () => {
    const res = filterExercises(sample, { equipment: 'barbell' })
    expect(res.every(e => e.equipment === 'barbell')).toBe(true)
    expect(res.length).toBeGreaterThanOrEqual(2)
    // combinado con grupo
    const combo = filterExercises(sample, { group: 'Piernas', equipment: 'barbell' })
    expect(combo.some(e => e.name === 'Sentadilla')).toBe(true)
    expect(combo.every(e => e.equipment === 'barbell')).toBe(true)
  })

  it('6. ejercicio personalizado aparece en filtro (no excluido)', async () => {
    const custom = await createCustomExercise({
      name: 'Sentadilla búlgara custom',
      bodyPart: 'legs',
      muscle: 'quads',
      secondaryMuscles: ['glutes'],
      primaryPct: 70,
      secondaryPcts: [30],
      category: 'strength',
      equipment: 'dumbbell',
    })
    const all = [...sample, custom as unknown as Exercise]
    const res = filterExercises(all, { group: 'Piernas' })
    expect(res.some(e => e.id === custom.id)).toBe(true)
    const resQ = filterExercises(all, { query: 'búlgara' })
    expect(resQ.some(e => e.id === custom.id)).toBe(true)
  })

  it('7. ningún filtro devuelve todos', () => {
    const res = filterExercises(sample, {})
    expect(res.length).toBe(sample.length)
  })

  it('8. ningún resultado cuando no hay coincidencias', () => {
    const res = filterExercises(sample, { group: 'Piernas', query: 'inexistente_xyz' })
    expect(res.length).toBe(0)
  })

  it('9. seleccionar ejercicio y agregarlo a rutina (flujo guardar en dayExercises)', async () => {
    const { saveAllRoutines, getAllRoutines } = await import('@/services/storage/routineStore')
    const cycle = { startDate: '2026-09-20', trainingDays: [{ n: 1, name: 'Piernas' }], weekMap: [null, 1, null, null, null, null, null], weekLoads: ['CARGA_CERO', 'NORMAL', 'CARGA_CERO', 'CARGA_CERO', 'CARGA_CERO', 'CARGA_CERO', 'CARGA_CERO'] } as never
    await saveAllRoutines([{ id: 'r1', name: 'Rutina 1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), rotationDays: 30, cycle, dayExercises: {} } as never], 'r1')
    const filtered = filterExercises(sample, { group: 'Piernas' })
    const chosen = filtered[0]
    const routines = await getAllRoutines()
    const r = routines[0] as unknown as { id: string; dayExercises: Record<number, unknown[]> }
    const updated = { ...r, dayExercises: { ...r.dayExercises, 1: [{ id: 'x1', exId: chosen.id, sets: 3, reps: 10, weight: 60 }] } }
    await saveAllRoutines([updated as never], 'r1')
    const after = await getAllRoutines()
    const exs = (after[0] as unknown as { dayExercises: Record<number, { exId: string }[]> }).dayExercises[1]
    expect(exs.length).toBe(1)
    expect(exs[0].exId).toBe(chosen.id)
  })

  it('10. no aparecen ejercicios que no corresponden (piernas no trae pecho)', () => {
    const res = filterExercises(sample, { group: 'Piernas' })
    expect(res.some(e => e.muscle === 'pectorals')).toBe(false)
    expect(res.some(e => e.muscle === 'biceps')).toBe(false)
    const backRes = filterExercises(sample, { group: 'Piernas', movement: 'pull' })
    // piernas + pull no debe traer espalda pull si no es pierna
    expect(backRes.some(e => e.muscle === 'lats')).toBe(false)
  })

  it('parseDayMuscles Piernas devuelve familia completa (corrección find->filter)', () => {
    const muscles = parseDayMuscles('Piernas')
    expect(muscles).toEqual(expect.arrayContaining(['quads', 'hamstrings', 'glutes', 'calves']))
    expect(muscles.length).toBeGreaterThanOrEqual(4)
    const esp = parseDayMuscles('Espalda')
    expect(esp).toEqual(expect.arrayContaining(['lats']))
  })
})
