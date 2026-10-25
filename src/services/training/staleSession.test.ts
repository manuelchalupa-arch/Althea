import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import {
  createSession, getActiveSession, transitionSession, getSessionExercises,
  isActiveSessionStatus,
} from './sessionStore'
import { isCompletedSession } from './sessionMetrics'
import { todayKey } from '@/utils/dates'
import { addDaysToKey } from '@/utils/dates'

const planned = [{ exId: 'press', name: 'Press', sets: 2, reps: 10, weight: 50 }]

function ayer() {
  return addDaysToKey(todayKey(), -1)
}

describe('Sesión sin terminar de otro día: se conserva para reanudar', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    try { localStorage.removeItem('althea:session:activeId') } catch { /* noop */ }
  })

  it('getActiveSession devuelve la sesión IN_PROGRESS de ayer (sin auto-cierre)', async () => {
    const s = await createSession({
      routineId: 'r1', calendarDate: ayer(), plannedDay: 1, actualDay: 1, plannedExercises: planned,
    })
    await transitionSession(s.sessionId, 'IN_PROGRESS')

    const activa = await getActiveSession()
    expect(activa?.sessionId).toBe(s.sessionId)

    const after = await db.trainingSessions.get(s.sessionId)
    expect(after?.sessionStatus).toBe('IN_PROGRESS')
    expect(after?.endedAt).toBeFalsy()
    expect(isActiveSessionStatus(after?.sessionStatus)).toBe(true)
  })

  it('no emite eventos de cierre ni toca las series registradas', async () => {
    const s = await createSession({
      routineId: 'r1', calendarDate: ayer(), plannedDay: 1, actualDay: 1, plannedExercises: planned,
    })
    await transitionSession(s.sessionId, 'IN_PROGRESS')
    const exercises = await getSessionExercises(s.sessionId)
    const sets = await db.setRecords.where('sessionExerciseId').equals(exercises[0].sessionExerciseId).toArray()
    const antes = sets.length

    await getActiveSession()

    const setsDespues = await db.setRecords.where('sessionExerciseId').equals(exercises[0].sessionExerciseId).toArray()
    expect(setsDespues.length).toBe(antes)
    const exDespues = await db.sessionExercises.get(exercises[0].sessionExerciseId)
    expect(exDespues?.status).not.toBe('PARTIAL')
    const eventos = await db.sessionEvents.where('sessionId').equals(s.sessionId).toArray()
    expect(eventos.some((e) => e.type === 'SESSION_PARTIAL' || e.type === 'SESSION_ABANDONED')).toBe(false)
  })

  it('readopta la sesión vencida aunque se pierda el id activo', async () => {
    const s = await createSession({
      routineId: 'r1', calendarDate: ayer(), plannedDay: 1, actualDay: 1, plannedExercises: planned,
    })
    await transitionSession(s.sessionId, 'IN_PROGRESS')
    try { localStorage.removeItem('althea:session:activeId') } catch { /* noop */ }
    const rescatada = await getActiveSession()
    expect(rescatada?.sessionId).toBe(s.sessionId)
    expect((await db.trainingSessions.get(s.sessionId))?.sessionStatus).toBe('IN_PROGRESS')
  })

  it('una sesión IN_PROGRESS de ayer todavía NO cuenta como día entrenado', async () => {
    const s = await createSession({
      routineId: 'r1', calendarDate: ayer(), plannedDay: 1, actualDay: 1, plannedExercises: planned,
    })
    await transitionSession(s.sessionId, 'IN_PROGRESS')
    const activa = await getActiveSession()
    // Cuenta recién al finalizar (COMPLETED/PARTIAL) vía Fin de sesión.
    expect(isCompletedSession(activa!)).toBe(false)
  })

  it('una sesión READY de ayer se conserva READY (nunca se cancela sola)', async () => {
    const s = await createSession({
      routineId: 'r1', calendarDate: ayer(), plannedDay: 1, actualDay: 1, plannedExercises: planned,
    })
    const activa = await getActiveSession()
    expect(activa?.sessionId).toBe(s.sessionId)
    expect((await db.trainingSessions.get(s.sessionId))?.sessionStatus).toBe('READY')
  })

  it('una sesión de HOY sigue funcionando igual', async () => {
    const s = await createSession({
      routineId: 'r1', calendarDate: todayKey(), plannedDay: 1, actualDay: 1, plannedExercises: planned,
    })
    await transitionSession(s.sessionId, 'IN_PROGRESS')
    const activa = await getActiveSession()
    expect(activa?.sessionId).toBe(s.sessionId)
    expect(activa?.sessionStatus).toBe('IN_PROGRESS')
  })
})
