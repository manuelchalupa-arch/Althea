import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import { createCustomExercise, overlayCustomParts } from './customExercises'
import { createSession, transitionSession, confirmSetRecord, getSessionExercises } from './sessionStore'
import { getLastSerieWithSource } from '@/services/history'
import { rankReplacements } from './similarity'

beforeEach(async () => {
  localStorage.clear()
  for (const t of ['customExercises', 'trainingSessions', 'sessionExercises', 'setRecords', 'sessionEvents', 'setLogs', 'sessions']) {
    if (t === 'setLogs' || t === 'sessions') await db.table(t).clear().catch(() => null)
    else await db.table(t).clear().catch(() => null)
  }
})

describe('flujo custom extremo a extremo (Casos 5–8)', () => {
  it('crear → rutina(snapshot) → entrenar → historial → progreso por parte → reemplazo', async () => {
    // 1. crear (Caso 1/2)
    const custom = await createCustomExercise({
      name: 'Press unilateral en polea', bodyPart: 'chest', muscle: 'pectorals',
      secondaryMuscles: ['triceps'], primaryPct: 70, secondaryPcts: [30],
      category: 'strength', equipment: 'cable',
    })
    // 2. rutina: snapshot plano con exerciseId (Caso 5)
    const snapshot = { id: 'r1', exId: custom.id, sets: 3, reps: 10, weight: 25, muscle: custom.muscle }
    expect(snapshot.exId).toBe(custom.id)
    // 3. entrenar: sesión + serie (Caso 6)
    const s = await createSession({
      routineId: 'r1', plannedDay: 1, actualDay: 1, calendarDate: '2026-09-10',
      plannedExercises: [{ exId: snapshot.exId, name: custom.name, sets: 3, reps: 10, weight: 25 }],
    })
    await transitionSession(s.sessionId, 'IN_PROGRESS')
    const [se] = await getSessionExercises(s.sessionId)
    await confirmSetRecord({
      sessionId: s.sessionId, sessionExerciseId: se.sessionExerciseId,
      exerciseId: custom.id, order: 1, actualReps: 10, actualWeight: 25,
    })
    // 4. historial recuperable por exerciseId meses después (Caso 7)
    const last = await getLastSerieWithSource(custom.id, 1)
    expect(last.isSeed).toBe(false)
    expect(last.weight).toBe(25)
    expect(last.reps).toBe(10)
    // 5. progreso por parte lo contabiliza (Caso 8)
    const map = await overlayCustomParts({})
    expect(map[custom.id]).toBe('chest')
    // 6. reemplazo considera customs del mismo músculo (Caso 9 implícito)
    const orig = {
      id: 'pectorals/barbell-bench-press', slug: 'x', name: 'Press banca', muscle: 'pectorals',
      bodyPart: 'chest', equipment: 'barbell', category: 'strength',
      secondaryMuscles: ['triceps'], instructions: [], file: '', gifUrl: '',
    }
    const ranked = rankReplacements(orig, [custom])
    expect(ranked.map((r) => r.exercise.id)).toContain(custom.id)
    expect(ranked[0].score).toBeGreaterThan(0)
  })
})
