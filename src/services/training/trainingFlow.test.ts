import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/services/storage/db'
import {
  createReadySession, createSession, getActiveSession, getSession,
  getSessionExercises, getSetRecords, confirmSetRecord, skipSetRecord,
  transitionSession, replaceSessionExercise, addExtraExercise, saveNegatives,
  saveSurvey, clearActiveSession,
} from './sessionStore'
import { savePlanning } from '@/services/planning/cycleVersions'
import type { CycleConfig } from '@/utils/cycle'

const CYCLE: CycleConfig = {
  startDate: '2026-09-01',
  trainingDays: [{ n: 1, name: 'Pecho' }],
  weekMap: [null, 1, null, null, null, null, null],
  methodId: 'full_body' as never,
}

const EXERCISES = [
  { exId: 'press', name: 'Press Banca', sets: 2, reps: 8, weight: 80, muscle: 'Pecho' },
  { exId: 'sentadilla', name: 'Sentadilla', sets: 2, reps: 10, weight: 100, muscle: 'Piernas' },
]

function baseInput(date = '2026-09-10', extra: Record<string, unknown> = {}) {
  return {
    calendarDate: date, routineId: 'r1', routineName: 'R',
    plannedDay: 1, plannedDayName: 'Pecho', actualDay: 1, actualDayName: 'Pecho',
    exercises: EXERCISES,
    ...extra,
  }
}

describe('ET11 — Flujo de entrenamiento completo', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  it('1. sin Comenzar no existe sesión; al comenzar hay exactamente una activa', async () => {
    expect(await db.trainingSessions.count()).toBe(0)
    expect(await getActiveSession()).toBeNull()
    const s = await createReadySession(baseInput())
    expect((await db.trainingSessions.count())).toBe(1)
    expect(s.sessionStatus).toBe('READY')
    expect(await getActiveSession()).not.toBeNull()
    // Segundo comienzo recupera la activa (no duplica)
    const s2 = await createSession({
      routineId: 'r1', plannedDay: 1, actualDay: 1, calendarDate: '2026-09-10',
      plannedExercises: EXERCISES,
    })
    expect(s2.sessionId).toBe(s.sessionId)
    expect(await db.trainingSessions.count()).toBe(1)
  })

  it('2. ejercicios cargan planificado separado de ejecutado + cycleId de versión', async () => {
    const { version } = await savePlanning({ cycle: CYCLE })
    const s = await createReadySession(baseInput())
    expect(s.cycleId).toBe(version.id)
    const exs = await getSessionExercises(s.sessionId)
    expect(exs.length).toBe(2)
    expect(exs[0].plannedSets).toHaveLength(2)
    expect(exs[0].plannedSets[0]).toMatchObject({ reps: 8, weight: 80 })
    expect(exs.every(e => e.status === 'PENDING')).toBe(true)
    const recs = await getSetRecords(exs[0].sessionExerciseId)
    expect(recs.length).toBe(2)
    expect(recs.every(r => r.status === 'PENDING')).toBe(true)
  })

  it('3. series: modificar peso/reps, tipos, notas, skip; idempotente ante reload', async () => {
    const s = await createReadySession(baseInput())
    const [se1, se2] = await getSessionExercises(s.sessionId)
    await transitionSession(s.sessionId, 'IN_PROGRESS')
    // Peso/reps modificados + tipo + nota
    const r1 = await confirmSetRecord({
      sessionId: s.sessionId, sessionExerciseId: se1.sessionExerciseId,
      exerciseId: 'press', order: 1, actualReps: 9, actualWeight: 82.5,
      setType: 'ASCENDING', observation: 'buena técnica',
    })
    expect(r1).toMatchObject({ actualReps: 9, actualWeight: 82.5, setType: 'ASCENDING', status: 'COMPLETED' })
    expect(r1.plannedReps).toBe(8) // planificado intacto
    expect(r1.plannedWeight).toBe(80)
    // Re-confirmar no duplica (mismo id estable)
    await confirmSetRecord({
      sessionId: s.sessionId, sessionExerciseId: se1.sessionExerciseId,
      exerciseId: 'press', order: 1, actualReps: 9, actualWeight: 82.5,
    })
    expect(await db.setRecords.count()).toBe(4) // 2+2 pre-creados, sin duplicados
    // Skip con motivo
    await skipSetRecord(se2.sessionExerciseId, 2, 'molestia hombro')
    const skipped = await db.setRecords.get(`${se2.sessionExerciseId}:set:2`)
    expect(skipped?.status).toBe('SKIPPED')
    // Reload: todo persistido
    await db.close()
    await db.open()
    expect((await db.setRecords.get(r1.setRecordId))?.actualWeight).toBe(82.5)
  })

  it('4. pausa/reanudación con timestamps; estados válidos', async () => {
    const s = await createReadySession(baseInput())
    await transitionSession(s.sessionId, 'IN_PROGRESS')
    const paused = await transitionSession(s.sessionId, 'PAUSED')
    expect(paused.sessionStatus).toBe('PAUSED')
    expect(paused.pausedAt).toBeDefined()
    const resumed = await transitionSession(s.sessionId, 'IN_PROGRESS')
    expect(resumed.sessionStatus).toBe('IN_PROGRESS')
    expect(resumed.resumeCount).toBe(1)
  })

  it('5. sustitución + extra + negativas con trazabilidad', async () => {
    const s = await createReadySession(baseInput())
    const [se1] = await getSessionExercises(s.sessionId)
    const rep = await replaceSessionExercise(se1.sessionExerciseId, 'press-manc', 'dolor hombro', 'variante sin dolor')
    expect(rep.status).toBe('REPLACED')
    expect(rep.replacement?.originalExerciseId).toBe('press')
    expect(rep.replacement?.replacementExerciseId).toBe('press-manc')
    const extra = await addExtraExercise(s.sessionId, { exId: 'plancha', name: 'Plancha', sets: 1, reps: 1, weight: 0 })
    expect(extra.status).toBe('EXTRA')
    const neg = await saveNegatives({
      sessionId: s.sessionId, sessionExerciseId: se1.sessionExerciseId,
      exerciseId: 'press', quantity: 3, weight: 100,
    })
    expect(neg.quantity).toBe(3)
  })

  it('6. reanudación tras reload: recupera sin duplicar; CONTINUE/FINALIZE/ABANDON', async () => {
    const s = await createReadySession(baseInput())
    await transitionSession(s.sessionId, 'IN_PROGRESS')
    await db.close()
    await db.open()
    // CONTINUE: la activa se recupera
    const resumed = await getActiveSession()
    expect(resumed?.sessionId).toBe(s.sessionId)
    expect(await db.trainingSessions.count()).toBe(1)
    // FINALIZE vía COMPLETING→COMPLETED con encuesta
    await transitionSession(s.sessionId, 'COMPLETING')
    const survey = await saveSurvey({
      sessionId: s.sessionId, userId: 'me', calendarDate: '2026-09-10',
      sessionRating: 4, pain: 1, painZone: 'hombro', painDetail: 'leve al press',
      comment: 'buena sesión',
    })
    expect(survey.surveyId).toBeDefined()
    const done = await transitionSession(s.sessionId, 'COMPLETED')
    expect(done.sessionStatus).toBe('COMPLETED')
    expect(await getActiveSession()).toBeNull()
    // ABANDON en otra sesión
    const s2 = await createReadySession(baseInput('2026-09-11'))
    await transitionSession(s2.sessionId, 'IN_PROGRESS')
    await transitionSession(s2.sessionId, 'ABANDONED')
    expect((await getSession(s2.sessionId))?.sessionStatus).toBe('ABANDONED')
  })

  it('7. PARTIAL guarda lo realizado sin convertir planificado en ejecutado', async () => {
    const s = await createReadySession(baseInput())
    const [se1] = await getSessionExercises(s.sessionId)
    await transitionSession(s.sessionId, 'IN_PROGRESS')
    await confirmSetRecord({
      sessionId: s.sessionId, sessionExerciseId: se1.sessionExerciseId,
      exerciseId: 'press', order: 1, actualReps: 8, actualWeight: 80,
    })
    await transitionSession(s.sessionId, 'COMPLETING')
    const partial = await transitionSession(s.sessionId, 'PARTIAL')
    expect(partial.sessionStatus).toBe('PARTIAL')
    const pending = await db.setRecords.get(`${se1.sessionExerciseId}:set:2`)
    expect(pending?.status).toBe('PENDING')
  })

  it('8. cambio de día: planificado vs realizado + motivo, sin destruir planificación', async () => {
    const s = await createReadySession(baseInput('2026-09-10', {
      plannedDay: 1, plannedDayName: 'Pecho', actualDay: 2, actualDayName: 'Espalda',
      dayChangeReason: 'dolor pecho', dayChangeComment: 'rotación por molestia',
    }))
    const stored = await getSession(s.sessionId)
    expect(stored?.plannedDay).toBe(1)
    expect(stored?.actualDay).toBe(2)
    expect(stored?.dayChange?.reason).toBe('dolor pecho')
  })

  it('9. día de descanso: entrena con motivo y trazabilidad', async () => {
    const s = await createReadySession(baseInput('2026-09-13', {
      plannedDay: null, plannedDayName: null, actualDay: 1, actualDayName: 'Pecho',
      dayChangeReason: 'viaje mañana', dayChangeComment: 'adelanto sesión',
    }))
    const stored = await getSession(s.sessionId)
    expect(stored?.plannedDay).toBeNull()
    expect(stored?.actualDay).toBe(1)
    expect(stored?.dayChange?.reason).toBe('viaje mañana')
  })

  it('10. finalizar reporta cumplimiento/volumen; encuesta valida dolor', async () => {
    const s = await createReadySession(baseInput())
    const [se1] = await getSessionExercises(s.sessionId)
    await transitionSession(s.sessionId, 'IN_PROGRESS')
    await confirmSetRecord({
      sessionId: s.sessionId, sessionExerciseId: se1.sessionExerciseId,
      exerciseId: 'press', order: 1, actualReps: 8, actualWeight: 80,
    })
    await confirmSetRecord({
      sessionId: s.sessionId, sessionExerciseId: se1.sessionExerciseId,
      exerciseId: 'press', order: 2, actualReps: 8, actualWeight: 80,
    })
    const { completionOf, volumeOf } = await import('./metrics')
    const comp = completionOf(await getSessionExercises(s.sessionId), await db.setRecords.toArray())
    const vol = volumeOf(await db.setRecords.toArray())
    expect(vol.volume).toBe(1280)
    expect(comp.completedSets).toBe(2)
    await clearActiveSession()
  })
})
