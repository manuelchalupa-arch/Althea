import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import {
  createSession, getActiveSession, transitionSession,
  closeStaleSessions, STALE_SESSION_REASON, isActiveSessionStatus,
} from './sessionStore'
import { isCompletedSession } from './sessionMetrics'
import { todayKey } from '@/utils/dates'
import { addDaysToKey } from '@/utils/dates'

const planned = [{ exId: 'press', name: 'Press', sets: 2, reps: 10, weight: 50 }]

function ayer() {
  return addDaysToKey(todayKey(), -1)
}

describe('Auto-cierre de sesiones vencidas (cambio de día)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    try { localStorage.removeItem('althea:session:activeId') } catch { /* noop */ }
  })

  it('cierra como CANCELLED una sesión READY que nunca se empezó', async () => {
    const s = await createSession({
      routineId: 'r1', calendarDate: ayer(), plannedDay: 1, actualDay: 1, plannedExercises: planned,
    })
    const cerradas = await closeStaleSessions()
    expect(cerradas).toContain(s.sessionId)
    const after = await db.trainingSessions.get(s.sessionId)
    expect(after?.sessionStatus).toBe('CANCELLED')
    expect(after?.endedAt).toBeTruthy()
  })

  it('cierra como PARTIAL una sesión IN_PROGRESS que cruzó la medianoche', async () => {
    const s = await createSession({
      routineId: 'r1', calendarDate: ayer(), plannedDay: 1, actualDay: 1, plannedExercises: planned,
    })
    await transitionSession(s.sessionId, 'IN_PROGRESS')
    const cerradas = await closeStaleSessions()
    expect(cerradas).toContain(s.sessionId)
    const after = await db.trainingSessions.get(s.sessionId)
    expect(after?.sessionStatus).toBe('PARTIAL')
    expect(after?.endedAt).toBeTruthy()
    expect(after?.completedAt).toBeTruthy()
    // El motivo queda en el evento de cierre, no en abandonReason (ABANDONED ya no aplica).
    const eventos = await db.sessionEvents.where('sessionId').equals(s.sessionId).toArray()
    const cierre = eventos.find((e) => e.type === 'SESSION_PARTIAL')
    expect(cierre?.metadata?.reason).toBe(STALE_SESSION_REASON)
  })

  it('NO borra nada: las series confirmadas se conservan', async () => {
    const s = await createSession({
      routineId: 'r1', calendarDate: ayer(), plannedDay: 1, actualDay: 1, plannedExercises: planned,
    })
    await transitionSession(s.sessionId, 'IN_PROGRESS')
    const exercises = await db.sessionExercises.where('sessionId').equals(s.sessionId).toArray()
    const sets = await db.setRecords.where('sessionExerciseId').equals(exercises[0].sessionExerciseId).toArray()
    const antes = sets.length

    await closeStaleSessions()

    const setsDespues = await db.setRecords.where('sessionExerciseId').equals(exercises[0].sessionExerciseId).toArray()
    expect(setsDespues.length).toBe(antes)
    // El ejercicio queda PARTIAL, no se pierde como historial.
    const exDespues = await db.sessionExercises.get(exercises[0].sessionExerciseId)
    expect(['PARTIAL', 'PENDING']).toContain(exDespues?.status)
    // Y queda registrado el evento de cierre.
    const eventos = await db.sessionEvents.where('sessionId').equals(s.sessionId).toArray()
    expect(eventos.some((e) => e.type === 'SESSION_PARTIAL')).toBe(true)
  })

  it('una sesión de HOY no se cierra, aunque sea de madrugada', async () => {
    const s = await createSession({
      routineId: 'r1', calendarDate: todayKey(), plannedDay: 1, actualDay: 1, plannedExercises: planned,
    })
    const cerradas = await closeStaleSessions()
    expect(cerradas).not.toContain(s.sessionId)
    const after = await db.trainingSessions.get(s.sessionId)
    expect(after?.sessionStatus).toBe('READY')
    expect(isActiveSessionStatus(after?.sessionStatus)).toBe(true)
  })

  it('getActiveSession devuelve null con una sesión vencida (la pestaña Entrenar se oculta)', async () => {
    const s = await createSession({
      routineId: 'r1', calendarDate: ayer(), plannedDay: 1, actualDay: 1, plannedExercises: planned,
    })
    await transitionSession(s.sessionId, 'IN_PROGRESS')
    const activa = await getActiveSession()
    expect(activa).toBeNull()
  })

  it('no readopta una sesión vencida aunque se pierda el id activo', async () => {
    const s = await createSession({
      routineId: 'r1', calendarDate: ayer(), plannedDay: 1, actualDay: 1, plannedExercises: planned,
    })
    await transitionSession(s.sessionId, 'IN_PROGRESS')
    try { localStorage.removeItem('althea:session:activeId') } catch { /* noop */ }
    const rescatada = await getActiveSession()
    expect(rescatada).toBeNull()
    expect((await db.trainingSessions.get(s.sessionId))?.sessionStatus).toBe('PARTIAL')
  })
  it('cuenta como día de entrenamiento según sessionMetrics', async () => {
    const s = await createSession({
      routineId: 'r1', calendarDate: ayer(), plannedDay: 1, actualDay: 1, plannedExercises: planned,
    })
    await transitionSession(s.sessionId, 'IN_PROGRESS')
    await closeStaleSessions()

    const after = await db.trainingSessions.get(s.sessionId)
    // sessionMetrics cuenta COMPLETED y PARTIAL como día entrenado.
    expect(isCompletedSession(after!)).toBe(true)
  })

  it('una sesión READY que nunca se empezó no cuenta como día (se cancela)', async () => {
    const s = await createSession({
      routineId: 'r1', calendarDate: ayer(), plannedDay: 1, actualDay: 1, plannedExercises: planned,
    })
    await closeStaleSessions()
    const after = await db.trainingSessions.get(s.sessionId)
    expect(isCompletedSession(after!)).toBe(false)
  })
})
