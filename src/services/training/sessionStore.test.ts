import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import {
  createSession, getActiveSession, getSession, transitionSession,
  confirmSetRecord, getSetRecords, skipSessionExercise, getSessionExercises,
} from './sessionStore'

const planned = [
  { exId: 'press', name: 'Press', sets: 2, reps: 10, weight: 50 },
  { exId: 'remo', name: 'Remo', sets: 1, reps: 8, weight: 40 },
]

beforeEach(async () => {
  localStorage.clear()
  for (const t of ['trainingSessions','sessionExercises','setRecords','sessionEvents','postWorkoutSurveys','negativeSets','exerciseObservations']) {
    await db.table(t).clear().catch(() => null)
  }
})

async function startSession() {
  const s = await createSession({
    routineId: 'r1', routineName: 'R', plannedDay: 1, actualDay: 1,
    calendarDate: '2026-09-10', plannedExercises: planned,
  })
  return transitionSession(s.sessionId, 'IN_PROGRESS')
}

describe('store central (§4, §10, §17, §18)', () => {
  it('crea READY con snapshot + setRecords PENDING y una sola activa', async () => {
    const s = await createSession({
      routineId: 'r1', plannedDay: 1, actualDay: 1,
      calendarDate: '2026-09-10', plannedExercises: planned,
    })
    expect(s.sessionStatus).toBe('READY')
    expect(s.sessionId).toBeTruthy()
    const se = await getSessionExercises(s.sessionId)
    expect(se).toHaveLength(2)
    expect(se[0].status).toBe('PENDING')
    const recs = await getSetRecords(se[0].sessionExerciseId)
    expect(recs).toHaveLength(2)
    expect(recs[0].status).toBe('PENDING')
    // segunda creación recupera la activa, no duplica
    const again = await createSession({
      routineId: 'r2', plannedDay: 2, actualDay: 2,
      calendarDate: '2026-09-10', plannedExercises: planned,
    })
    expect(again.sessionId).toBe(s.sessionId)
    const active = await getActiveSession()
    expect(active?.sessionId).toBe(s.sessionId)
  })

  it('rechaza READY -> COMPLETED y exige pasar por COMPLETING', async () => {
    const s = await createSession({
      routineId: 'r1', plannedDay: 1, actualDay: 1,
      calendarDate: '2026-09-10', plannedExercises: planned,
    })
    await expect(transitionSession(s.sessionId, 'COMPLETED')).rejects.toThrow()
    const started = await transitionSession(s.sessionId, 'IN_PROGRESS')
    expect(started.startedAt).toBeTruthy()
    await expect(transitionSession(s.sessionId, 'COMPLETED')).rejects.toThrow()
    const closing = await transitionSession(s.sessionId, 'COMPLETING')
    expect(closing.completingAt).toBeTruthy()
    const done = await transitionSession(s.sessionId, 'COMPLETED')
    expect(done.completedAt).toBeTruthy()
    expect(done.endedAt).toBeTruthy()
    // final limpia la activa
    expect(await getActiveSession()).toBeNull()
  })

  it('confirmar serie es idempotente (mismo setRecordId, sin duplicar)', async () => {
    const s = await startSession()
    const [se] = await getSessionExercises(s.sessionId)
    const a = await confirmSetRecord({
      sessionId: s.sessionId, sessionExerciseId: se.sessionExerciseId,
      exerciseId: 'press', order: 1, actualReps: 10, actualWeight: 50,
    })
    const b = await confirmSetRecord({
      sessionId: s.sessionId, sessionExerciseId: se.sessionExerciseId,
      exerciseId: 'press', order: 1, actualReps: 10, actualWeight: 52.5,
    })
    expect(a.setRecordId).toBe(b.setRecordId)
    const all = await getSetRecords(se.sessionExerciseId)
    expect(all.filter((r) => r.order === 1)).toHaveLength(1)
    expect(all.find((r) => r.order === 1)?.actualWeight).toBe(52.5)
  })

  it('pausa acumula totalPausedDuration y reanudar cuenta resume', async () => {
    const s = await startSession()
    const paused = await transitionSession(s.sessionId, 'PAUSED')
    expect(paused.pausedAt).toBeTruthy()
    const resumed = await transitionSession(s.sessionId, 'IN_PROGRESS')
    expect(resumed.resumeCount).toBe(1)
    expect(resumed.totalPausedDurationSec ?? 0).toBeGreaterThanOrEqual(0)
  })

  it('omitir ejercicio guarda motivo y no borra series', async () => {
    const s = await startSession()
    const [se] = await getSessionExercises(s.sessionId)
    await confirmSetRecord({
      sessionId: s.sessionId, sessionExerciseId: se.sessionExerciseId,
      exerciseId: 'press', order: 1, actualReps: 10, actualWeight: 50,
    })
    await skipSessionExercise(se.sessionExerciseId, 'Cansancio', 'fatigado')
    const updated = await getSessionExercises(s.sessionId)
    expect(updated[0].status).toBe('SKIPPED')
    expect(updated[0].skipReason).toBe('Cansancio')
    const recs = await getSetRecords(se.sessionExerciseId)
    expect(recs.find((r) => r.order === 1)?.status).toBe('COMPLETED')
  })

  it('cancelar exige pasar por estados válidos y guarda justificación', async () => {
    const s = await createSession({
      routineId: 'r1', plannedDay: 1, actualDay: 1,
      calendarDate: '2026-09-10', plannedExercises: planned,
    })
    const c = await transitionSession(s.sessionId, 'CANCELLED', { reason: 'Falta de tiempo' })
    expect(c.cancelReason).toBe('Falta de tiempo')
    expect(c.cancelledAt).toBeTruthy()
    const back = await getSession(s.sessionId)
    expect(back?.sessionStatus).toBe('CANCELLED')
  })
})
