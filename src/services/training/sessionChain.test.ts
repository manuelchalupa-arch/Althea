import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import {
  createSession, getSessionExercises, getSetRecords,
  confirmSetRecord, prunePendingSetRecords,
} from './sessionStore'
import { resolveSetType, seriesTypeToSetType, generatePlannedSets } from './setPlanner'
import { saveRoutine, getActiveRoutineId, setActiveRoutineId } from '@/services/storage/routineStore'
import { getDayExercises } from '@/utils/routine'
import { DEFAULT_CYCLE } from '@/utils/cycle'

beforeEach(async () => {
  localStorage.clear()
  for (const t of ['trainingSessions','sessionExercises','setRecords','sessionEvents','postWorkoutSurveys','negativeSets','exerciseObservations','routineStore']) {
    await db.table(t).clear().catch(() => null)
  }
})

describe('resolveSetType — rutina → SetType', () => {
  it('resuelve labels en español', () => {
    expect(resolveSetType('Normal')).toBe('NORMAL')
    expect(resolveSetType('Ascendente')).toBe('ASCENDING')
    expect(resolveSetType('Descendente')).toBe('DESCENDING')
    expect(resolveSetType('Piramidal')).toBe('PYRAMID_DESCENDING')
    expect(resolveSetType('DropSet')).toBe('DROP_SET')
    expect(resolveSetType('Otra')).toBe('CUSTOM')
  })

  it('resuelve tokens en mayúsculas y devuelve NORMAL ante undefined', () => {
    expect(resolveSetType('PYRAMID_DESCENDING')).toBe('PYRAMID_DESCENDING')
    expect(resolveSetType('DROP_SET')).toBe('DROP_SET')
    expect(resolveSetType(undefined)).toBe('NORMAL')
    expect(resolveSetType('')).toBe('NORMAL')
    expect(resolveSetType('desconocido')).toBe('NORMAL')
  })

  it('seriesTypeToSetType sigue siendo compatible con el select', () => {
    expect(seriesTypeToSetType('piramidal')).toBe('PYRAMID_DESCENDING')
    expect(seriesTypeToSetType('Normal')).toBe('NORMAL')
  })
})

describe('Cadena rutina → sesión (FASE cadena de datos)', () => {
  it('createSession propaga descanso, tipo, tempo, RIR/RPE, notas y routineExerciseId', async () => {
    const s = await createSession({
      routineId: 'r1', routineName: 'R', plannedDay: 1, actualDay: 1,
      calendarDate: '2026-09-20',
      plannedMuscleGroups: ['pecho', 'triceps'],
      plannedExercises: [{
        exId: 'press', name: 'Press', sets: 3, reps: 10, weight: 50,
        routineExerciseId: 'row-1',
        restSec: 120, seriesType: 'Piramidal', tempo: '3-1-1',
        rir: 2, rpe: 8, notes: 'codo abajo',
        plannedSets: [
          { order: 1, reps: 12, weight: 60 },
          { order: 2, reps: 10, weight: 65 },
          { order: 3, reps: 8, weight: 70 },
        ],
      }],
    })
    expect(s.plannedMuscleGroups).toEqual(['pecho', 'triceps'])

    const [se] = await getSessionExercises(s.sessionId)
    expect(se.restSec).toBe(120)
    expect(se.seriesType).toBe('PYRAMID_DESCENDING')
    expect(se.tempo).toBe('3-1-1')
    expect(se.targetRir).toBe(2)
    expect(se.targetRpe).toBe(8)
    expect(se.notes).toBe('codo abajo')
    expect(se.routineExerciseId).toBe('row-1')

    // Cada serie conserva sus propios reps/peso y el TIPO planificado (nunca NORMAL forzado)
    const recs = await getSetRecords(se.sessionExerciseId)
    expect(recs.map(r => [r.plannedReps, r.plannedWeight, r.setType])).toEqual([
      [12, 60, 'PYRAMID_DESCENDING'],
      [10, 65, 'PYRAMID_DESCENDING'],
      [8, 70, 'PYRAMID_DESCENDING'],
    ])
  })

  it('sin plan por serie, el escalar se expande con el tipo planificado del ejercicio', async () => {
    const s = await createSession({
      routineId: 'r1', plannedDay: 1, actualDay: 1, calendarDate: '2026-09-20',
      plannedExercises: [{ exId: 'sentadilla', name: 'Sentadilla', sets: 2, reps: 8, weight: 70, seriesType: 'Descendente' }],
    })
    const [se] = await getSessionExercises(s.sessionId)
    const recs = await getSetRecords(se.sessionExerciseId)
    expect(recs).toHaveLength(2)
    expect(recs.every(r => r.setType === 'DESCENDING')).toBe(true)
  })

  it('confirmar serie conserva el tipo planificado y no pisa el tipo de otra serie', async () => {
    const s = await createSession({
      routineId: 'r1', plannedDay: 1, actualDay: 1, calendarDate: '2026-09-20',
      plannedExercises: [{
        exId: 'press', name: 'Press', sets: 2, reps: 10, weight: 50, seriesType: 'Piramidal',
        plannedSets: [
          { order: 1, reps: 12, weight: 60, setType: 'PYRAMID_DESCENDING' },
          { order: 2, reps: 10, weight: 65, setType: 'DESCENDING' },
        ],
      }],
    })
    const [se] = await getSessionExercises(s.sessionId)

    // Confirmación sin setType informado (como hace Entrenar cuando no hay plan)
    await confirmSetRecord({
      sessionId: s.sessionId, sessionExerciseId: se.sessionExerciseId,
      exerciseId: 'press', order: 1, actualReps: 12, actualWeight: 62.5,
      observation: 'buen tramo',
    })
    const recs = await getSetRecords(se.sessionExerciseId)
    expect(recs[0].setType).toBe('PYRAMID_DESCENDING')
    expect(recs[0].observation).toBe('buen tramo')
    // La otra serie queda intacta: su tipo y su observación son propios
    expect(recs[1].setType).toBe('DESCENDING')
    expect(recs[1].observation).toBeUndefined()
    expect(recs[1].actualWeight).toBeNull()

    // Observación de la serie 2 es independiente de la 1
    await confirmSetRecord({
      sessionId: s.sessionId, sessionExerciseId: se.sessionExerciseId,
      exerciseId: 'press', order: 2, actualReps: 10, actualWeight: 67.5,
      observation: 'bloqueado',
    })
    const after = await getSetRecords(se.sessionExerciseId)
    expect(after[0].observation).toBe('buen tramo')
    expect(after[1].observation).toBe('bloqueado')
  })

  it('prunePendingSetRecords elimina solo PENDING fuera del plan y conserva COMPLETED', async () => {
    const s = await createSession({
      routineId: 'r1', plannedDay: 1, actualDay: 1, calendarDate: '2026-09-20',
      plannedExercises: [{ exId: 'press', name: 'Press', sets: 4, reps: 10, weight: 50 }],
    })
    const [se] = await getSessionExercises(s.sessionId)
    // Confirmar la serie 1 (queda COMPLETED, es historial)
    await confirmSetRecord({
      sessionId: s.sessionId, sessionExerciseId: se.sessionExerciseId,
      exerciseId: 'press', order: 1, actualReps: 10, actualWeight: 50,
    })

    await prunePendingSetRecords(se.sessionExerciseId, [1, 2])
    const restantes = await getSetRecords(se.sessionExerciseId)
    expect(restantes.map(r => r.order)).toEqual([1, 2])
    expect(restantes.find(r => r.order === 1)?.status).toBe('COMPLETED')
    expect(restantes.find(r => r.order === 2)?.status).toBe('PENDING')
  })
})

describe('Rutina → getDayExercises', () => {
  it('propaga restSec, seriesType, tempo, RIR/RPE, notas e id de la fila', async () => {
    await saveRoutine({
      id: 'rot-test', name: 'Rutina test', createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), rotationDays: 30, cycle: DEFAULT_CYCLE,
      dayExercises: {
        1: [{
          id: 'row-9', exId: 'press', sets: 3, reps: 10, weight: 50,
          restSec: 75, seriesType: 'Piramidal', tempo: '2-1-2',
          rir: 1, rpe: 9, notes: 'pausa arriba',
          series: [{ reps: 12, weight: 60 }, { reps: 10, weight: 65 }, { reps: 8, weight: 70 }],
        }],
      },
    })
    await setActiveRoutineId('rot-test')
    expect(await getActiveRoutineId()).toBe('rot-test')

    const list = await getDayExercises(1, DEFAULT_CYCLE)
    expect(list).toHaveLength(1)
    const ex = list[0]
    expect(ex.restSec).toBe(75)
    expect(ex.seriesType).toBe('Piramidal')
    expect(ex.tempo).toBe('2-1-2')
    expect(ex.rir).toBe(1)
    expect(ex.rpe).toBe(9)
    expect(ex.notes).toBe('pausa arriba')
    expect(ex.routineExerciseId).toBe('row-9')
    // El plan por serie también viaja
    expect(ex.series).toHaveLength(3)
  })
})

describe('generatePlannedSets — valores individuales por serie', () => {
  it('pirámide descendente no repite el mismo valor en todas las series', () => {
    const sets = generatePlannedSets({ sets: 4, baseWeight: 60, baseReps: 12, seriesType: 'Piramidal' })
    expect(sets.map(s => `${s.reps}x${s.weight}`)).toEqual(['12x60', '10x65', '8x70', '6x75'])
    expect(new Set(sets.map(s => s.weight)).size).toBe(4)
    expect(sets.every(s => s.setType === 'PYRAMID_DESCENDING')).toBe(true)
  })
})
