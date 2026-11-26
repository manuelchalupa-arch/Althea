import { describe, it, expect } from 'vitest'
import { buildAiTrainingContext, getTrainingPreferences, resolveExperienceLevel } from '@/utils/profilePreferences'
import { parseRoutineInstructions, validateGeneratedRoutine, estimateRoutineMinutes, type GeneratedRoutine, type UserWants } from '@/services/ai/routineBuilderIA'
import { EMPTY_CYCLE } from '@/utils/cycle'

const CATALOG = new Map([
  ['machine/leg-press', { id: 'machine/leg-press', name: 'Leg press', eq: 'machine' }],
  ['dumbbell/bench-press', { id: 'dumbbell/bench-press', name: 'Press banca con mancuernas', eq: 'dumbbell' }],
  ['barbell/back-squat', { id: 'barbell/back-squat', name: 'Back squat (sentadilla)', eq: 'barbell' }],
])

function makeRoutine(days: number, ids: string[], opts: { name?: string; sets?: number; reps?: number; restSec?: number; feature?: string } = {}): GeneratedRoutine {
  const sets = opts.sets ?? 5
  const reps = opts.reps ?? 10
  return {
    name: opts.name || `Rutina ${days} días`,
    cycle: {
      startDate: '2026-11-26',
      trainingDays: Array.from({ length: days }, (_, i) => ({ n: i + 1, name: `Entrenamiento ${i + 1}` })),
      weekMap: Array.from({ length: 7 }, (_, i) => i < days ? i + 1 : null),
      methodId: 'hypertrophy',
      methodJustification: 'por objetivo',
    },
    dayExercises: Object.fromEntries(Array.from({ length: days }, (_, i) => [i + 1,
      ids.map((id, j) => ({ id: `e${i}-${j}`, exId: id, sets, reps, weight: 0, name: CATALOG.get(id)?.name || id, restSec: opts.restSec ?? 60 })),
    ])),
    explanation: {
      goal: 'hipertrofia', method: 'hypertrophy', distribution: `${days} días`, intensity: 'media',
      progression: 'progresión', keyFeatures: opts.feature ? [opts.feature] : [],
    },
  }
}

function wantsFor(profile: any): UserWants {
  const p = getTrainingPreferences(profile)
  return {
    goal: p.goal || 'hipertrofia', daysPerWeek: p.daysPerWeek, focus: '', injuryNote: '',
    level: p.level, durationMin: p.sessionDurationMin, modality: p.modality,
    allowedEquipment: p.equipment, excludedMovements: p.excludedMovements,
    excludedExerciseIds: p.excludedExercises, trainingIntensity: p.trainingIntensity,
  }
}

const PROFILE_A = {
  trainingGoal: 'hypertrophy', goalPrimary: 'Ganar masa muscular', level: 'principiante',
  availableDays: [0, 2, 4], equipment: ['maquina', 'mancuernas'], sessionDurationMin: 40,
  trainingModality: 'gym', limitations: [], painAreas: [], excludedExercises: [],
}
const PROFILE_B = {
  trainingGoal: 'strength', goalPrimary: 'Aumentar fuerza', level: 'avanzado',
  availableDays: [1, 2, 4, 5], equipment: ['barra', 'mancuernas', 'maquina', 'polea', 'peso_corporal'],
  sessionDurationMin: 90, trainingModality: 'gym', limitations: [], painAreas: [], excludedExercises: [],
}
const PROFILE_C = {
  trainingGoal: 'general_health', goalPrimary: 'Mejorar condición física', level: 'intermedio',
  availableDays: [0, 3, 6], equipment: ['peso_corporal', 'mancuernas'], sessionDurationMin: 60,
  trainingModality: 'crossfit', limitations: ['tiempo', 'movimientos'], painAreas: ['rodillas'],
  excludedExercises: [], excludedMovements: ['Sentadilla'], availabilityNotes: 'turnos rotativos',
}

describe('Preferencias canónicas y contexto IA mínimo', () => {
  it('resuelve nivel legacy y no mezcla tono con intensidad', () => {
    expect(resolveExperienceLevel({ level: 'principiante' })).toBe('beginner')
    expect(resolveExperienceLevel({ experienceLevel: 'advanced', level: 'principiante' })).toBe('advanced')
    expect(getTrainingPreferences({ coachIntensity: 'duro', level: 'avanzado', exigencia: { entrenamiento: 5 } }).trainingIntensity).toBe(5)
  })

  it('los perfiles A, B y C producen preferencias distintas', () => {
    const a = getTrainingPreferences(PROFILE_A)
    const b = getTrainingPreferences(PROFILE_B)
    const c = getTrainingPreferences(PROFILE_C)
    expect(a).toMatchObject({ level: 'beginner', daysPerWeek: 3, sessionDurationMin: 40, modality: 'gym' })
    expect(a.equipment).toEqual(['machine', 'dumbbell'])
    expect(b).toMatchObject({ level: 'advanced', daysPerWeek: 4, sessionDurationMin: 90 })
    expect(b.equipment).toContain('barbell')
    expect(c).toMatchObject({ level: 'intermediate', modality: 'crossfit', trainingIntensity: undefined })
    expect(c.excludedMovements).toEqual(['Sentadilla'])
    expect(c.availabilityNotes).toBe('turnos rotativos')
  })

  it('el contexto IA no incluye nombre, email ni identificadores', () => {
    const ctx = buildAiTrainingContext({ ...PROFILE_A, displayName: 'Manuel', email: 'm@mail.com', id: 'me', age: 40, weightKg: 80, heightCm: 180 })
    expect(ctx).toContain('Nivel: beginner')
    expect(ctx).toContain('Duración de sesión: 40 min')
    expect(ctx).toContain('Equipamiento: machine, dumbbell')
    expect(ctx).not.toMatch(/Manuel|m@mail\.com|\bme\b|80kg|180cm|40 años/i)
  })
})

describe('Validación determinista de rutinas generadas', () => {
  it('A: acepta 3 días con equipo disponible y advierte duración con alternativa', () => {
    const wants = wantsFor(PROFILE_A)
    const routine = makeRoutine(3, ['machine/leg-press', 'dumbbell/bench-press'])
    const result = validateGeneratedRoutine(routine, wants, parseRoutineInstructions(''), CATALOG)
    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.warnings.join(' ')).toContain('40 min')
    expect(result.suggestion).toMatch(/Sumá|Reducí/)
  })

  it('A: rechaza equipamiento no disponible', () => {
    const wants = wantsFor(PROFILE_A)
    const result = validateGeneratedRoutine(makeRoutine(3, ['barbell/back-squat']), wants, parseRoutineInstructions(''), CATALOG)
    expect(result.ok).toBe(false)
    expect(result.issues.join(' ')).toMatch(/equipamiento no disponible/)
  })

  it('B: 4 días y 90 min cambian la estructura esperada y la estimación', () => {
    const wants = wantsFor(PROFILE_B)
    const routine = makeRoutine(4, ['barbell/back-squat', 'machine/leg-press', 'dumbbell/bench-press'], { sets: 6, restSec: 120 })
    const result = validateGeneratedRoutine(routine, wants, parseRoutineInstructions(''), CATALOG)
    expect(result.ok).toBe(true)
    expect(estimateRoutineMinutes(routine)[0]).toBeGreaterThan(45)
    expect(result.warnings.join(' ')).toContain('90 min')
    const short = validateGeneratedRoutine(makeRoutine(3, ['barbell/back-squat']), wants, parseRoutineInstructions(''), CATALOG)
    expect(short.ok).toBe(false)
    expect(short.issues.join(' ')).toMatch(/se esperaban 4 días/)
  })

  it('C: CrossFit rechaza split de gimnasio y movimientos excluidos; acepta WOD', () => {
    const wants = wantsFor(PROFILE_C)
    const instructions = parseRoutineInstructions('')
    const bad = makeRoutine(3, ['barbell/back-squat'], { name: 'Rutina pecho y espalda', feature: 'CrossFit' })
    const badResult = validateGeneratedRoutine(bad, wants, instructions, CATALOG)
    expect(badResult.ok).toBe(false)
    expect(badResult.issues.join(' ')).toMatch(/movimiento excluido|músculo aislado/)

    const good = makeRoutine(3, ['dumbbell/bench-press'], { name: 'Rutina CrossFit', feature: 'WOD funcional' })
    good.cycle.trainingDays = good.cycle.trainingDays.map((d, i) => ({ ...d, name: `WOD ${i + 1}` }))
    expect(validateGeneratedRoutine(good, wants, instructions, CATALOG).ok).toBe(true)
  })

  it('rechaza IDs inexistentes, días vacíos y weekMap que inventa días', () => {
    const wants = wantsFor(PROFILE_A)
    const instructions = parseRoutineInstructions('')
    expect(validateGeneratedRoutine(makeRoutine(3, ['ghost/exercise']), wants, instructions, CATALOG).issues.join(' ')).toMatch(/inexistente/)
    const empty = makeRoutine(3, ['machine/leg-press'])
    empty.dayExercises[2] = []
    expect(validateGeneratedRoutine(empty, wants, instructions, CATALOG).issues.join(' ')).toMatch(/sin ejercicios/)
    const badWeek = makeRoutine(3, ['machine/leg-press'])
    badWeek.cycle.weekMap[0] = 3
    expect(validateGeneratedRoutine(badWeek, wants, instructions, CATALOG).issues.join(' ')).toMatch(/weekMap/)
  })

  it('sin planificación no hay días precargados en el calendario', () => {
    expect(EMPTY_CYCLE.trainingDays).toEqual([])
    expect(EMPTY_CYCLE.weekMap.every(d => d === null)).toBe(true)
  })
})
