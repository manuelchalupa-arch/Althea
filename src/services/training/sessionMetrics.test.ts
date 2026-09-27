import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import { countTrainingDays, countTrainingDaysInPeriod, distinctTrainingDays, isCompletedSession } from './sessionMetrics'

function mk(id: string, calendarDate: string, status: string, isDemo = false) {
  return {
    id,
    sessionId: id,
    userId: 'u1',
    routineId: 'r1',
    calendarDate,
    sessionStatus: status as never,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo,
  } as never
}

describe('BLOQUE 5 — Métrica Sesiones = días únicos con entrenamiento', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('1. un entrenamiento → 1', async () => {
    await db.trainingSessions.bulkPut([mk('s1', '2026-09-20', 'COMPLETED')])
    const sessions = await db.trainingSessions.toArray() as never[]
    expect(countTrainingDays(sessions as never)).toBe(1)
    expect(distinctTrainingDays(sessions as never)).toEqual(['2026-09-20'])
  })

  it('2. dos entrenamientos mismo día → 1 (no 2)', async () => {
    await db.trainingSessions.bulkPut([
      mk('sA', '2026-09-20', 'COMPLETED'),
      mk('sB', '2026-09-20', 'COMPLETED'),
    ])
    const sessions = await db.trainingSessions.toArray() as never[]
    expect(countTrainingDays(sessions as never)).toBe(1)
  })

  it('3. dos días → 2', async () => {
    await db.trainingSessions.bulkPut([
      mk('s1', '2026-09-20', 'COMPLETED'),
      mk('s2', '2026-09-21', 'COMPLETED'),
    ])
    const sessions = await db.trainingSessions.toArray() as never[]
    expect(countTrainingDays(sessions as never)).toBe(2)
    expect(distinctTrainingDays(sessions as never)).toEqual(['2026-09-20', '2026-09-21'])
  })

  it('4. entrenamiento abandonado no se cuenta (según lógica existente)', async () => {
    await db.trainingSessions.bulkPut([
      mk('s1', '2026-09-20', 'COMPLETED'),
      mk('sAb', '2026-09-21', 'ABANDONED'),
      mk('sCan', '2026-09-22', 'CANCELLED'),
      mk('sProg', '2026-09-23', 'IN_PROGRESS'),
    ])
    const sessions = await db.trainingSessions.toArray() as never[]
    expect(countTrainingDays(sessions as never)).toBe(1) // solo 20 cuenta
    expect(isCompletedSession({ calendarDate: '2026-09-21', sessionStatus: 'ABANDONED' } as never)).toBe(false)
    expect(isCompletedSession({ calendarDate: '2026-09-20', sessionStatus: 'PARTIAL' } as never)).toBe(true)
  })

  it('5. cambiar período (7/30/90/año)', async () => {
    // hoy fijo 2026-09-20 para período determinista
    const today = '2026-09-20'
    await db.trainingSessions.bulkPut([
      mk('s1', '2026-09-20', 'COMPLETED'), // 0 días antes
      mk('s2', '2026-09-18', 'COMPLETED'), // 2 días antes
      mk('s3', '2026-08-25', 'COMPLETED'), // 26 días antes
      mk('s4', '2026-07-01', 'COMPLETED'), // ~80 días antes
      mk('s5', '2025-09-21', 'COMPLETED'), // 365 días ventana inclusive
    ])
    const sessions = await db.trainingSessions.toArray() as never[]
    expect(countTrainingDaysInPeriod(sessions as never, '7', { today })).toBe(2) // 20 y 18
    expect(countTrainingDaysInPeriod(sessions as never, '30', { today })).toBe(3) // + 08-25
    expect(countTrainingDaysInPeriod(sessions as never, '90', { today })).toBe(4) // + 07-01
    expect(countTrainingDaysInPeriod(sessions as never, '365', { today })).toBe(5) // + 2025-09-21
    expect(countTrainingDaysInPeriod(sessions as never, 'all', { today })).toBe(5)
    // no contar rutinas: verificar que routineStore no influye
    await db.routineStore.put({ id: 'r1', activeId: 'r1', createdAt: today, updatedAt: today } as never)
    expect(countTrainingDaysInPeriod(sessions as never, '7', { today })).toBe(2)
  })

  it('6. persistencia cerrar/reabrir Dexie mantiene métrica', async () => {
    await db.trainingSessions.bulkPut([
      mk('s1', '2026-09-20', 'COMPLETED'),
      mk('s2', '2026-09-20', 'COMPLETED'),
      mk('s3', '2026-09-21', 'PARTIAL'),
    ])
    const before = countTrainingDays((await db.trainingSessions.toArray()) as never[])
    expect(before).toBe(2)
    await db.close()
    await db.open()
    const afterSessions = await db.trainingSessions.toArray() as never[]
    expect(countTrainingDays(afterSessions as never)).toBe(2)
    expect(distinctTrainingDays(afterSessions as never)).toEqual(['2026-09-20', '2026-09-21'])
  })

  it('no contar rutinas/descanso/planificados', async () => {
    // rutinas y días planificados no deben contar aunque existan
    await db.routineStore.put({ id: 'rA', createdAt: '2026-09-20', updatedAt: '2026-09-20', name: 'Rutina A' } as never)
    await db.trainingSessions.bulkPut([mk('s1', '2026-09-20', 'PLANNED'), mk('s2', '2026-09-21', 'READY')])
    const sessions = await db.trainingSessions.toArray() as never[]
    expect(countTrainingDays(sessions as never)).toBe(0)
  })
})
