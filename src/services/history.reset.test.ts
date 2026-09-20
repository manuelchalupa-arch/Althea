import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/services/storage/db'
import { resetTrainingHistory, unifiedSetsForPR } from './history'

describe('Reset selectivo del historial de entrenamiento', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  async function seedHistory() {
    await db.trainingSessions.put({
      id: 'ts1', sessionId: 'ts1', userId: 'me', routineId: 'r1',
      plannedDay: 1, actualDay: 1, calendarDate: '2026-09-10',
      sessionStatus: 'COMPLETED', createdAt: '2026-09-10T10:00:00Z', updatedAt: '2026-09-10T10:00:00Z',
    } as never)
    await db.setRecords.put({
      setRecordId: 'sr1', sessionId: 'ts1', sessionExerciseId: 'se1', exerciseId: 'ex-006',
      order: 1, setType: 'NORMAL', plannedReps: 8, plannedWeight: 80,
      actualReps: 8, actualWeight: 80, status: 'COMPLETED',
      createdAt: '2026-09-10T10:00:00Z', updatedAt: '2026-09-10T10:00:00Z',
    } as never)
    await db.setLogs.put({
      id: 'sl1', sessionId: 'old', exerciseId: 'ex-006', setNumber: 1,
      weight: 70, reps: 8, completed: true,
      createdAt: '2026-08-01T10:00:00Z', updatedAt: '2026-08-01T10:00:00Z',
    } as never)
    // Datos ajenos al historial que NO deben borrarse
    await db.userProfile.put({ id: 'me', goal: 'fuerza' } as never)
    await db.recoveryChecks.put({ id: '2026-09-10', localDate: '2026-09-10', score: 75 } as never)
    await db.hydrationLogs.put({ id: 'h1', localDate: '2026-09-10', amountMl: 500, time: '2026-09-10T10:00:00Z' } as never)
  }

  it('borra solo la ejecución de sesiones y preserva el resto', async () => {
    await seedHistory()
    expect(await db.trainingSessions.count()).toBe(1)

    await resetTrainingHistory()

    expect(await db.trainingSessions.count()).toBe(0)
    expect(await db.setRecords.count()).toBe(0)
    expect(await db.setLogs.count()).toBe(0)
    // Perfil, recuperación e hidratación intactos
    expect(await db.userProfile.get('me')).toBeDefined()
    expect(await db.recoveryChecks.get('2026-09-10')).toBeDefined()
    expect(await db.hydrationLogs.count()).toBe(1)
  })

  it('tras el reset se pueden registrar datos nuevos', async () => {
    await seedHistory()
    await resetTrainingHistory()

    await db.setRecords.put({
      setRecordId: 'sr2', sessionId: 'ts2', sessionExerciseId: 'se2', exerciseId: 'ex-006',
      order: 1, setType: 'NORMAL', plannedReps: 5, plannedWeight: 100,
      actualReps: 5, actualWeight: 100, status: 'COMPLETED',
      completedAt: '2026-09-20T10:00:00Z',
      createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-20T10:00:00Z',
    } as never)

    const sets = await unifiedSetsForPR('ex-006')
    expect(sets.length).toBe(1)
    expect(sets[0].weight).toBe(100)
  })
})
