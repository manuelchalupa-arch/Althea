import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/services/storage/db'
import {
  dedupeUnifiedSets,
  unifiedCompletedSets,
  unifiedSetsForPR,
  getLastExecutionByExercise,
  type UnifiedSet,
} from './history'
import { calculateExercisePRs, aggregateVolumeLandmarks } from './training/prs'

const EX = 'ex-006'

function official(o: Partial<UnifiedSet> & { order: number }): UnifiedSet {
  return {
    setRecordId: `se1:set:${o.order}`,
    sessionId: 'sess-A',
    exerciseId: EX,
    weight: 80,
    reps: 8,
    date: '2026-09-10',
    timestamp: '2026-09-10T10:00:00Z',
    source: 'official',
    ...o,
  }
}

function legacy(o: Partial<UnifiedSet> & { order: number }): UnifiedSet {
  return {
    setRecordId: 'legacy-1',
    sessionId: 'sess-A',
    exerciseId: EX,
    weight: 80,
    reps: 8,
    date: '2026-09-10',
    timestamp: '2026-09-10T10:00:00Z',
    source: 'legacy',
    ...o,
  }
}

async function seedOfficial(sessionId = 'sess-A', date = '2026-09-10', weight = 80, reps = 8, order = 1, time = '10:00:00Z') {
  await db.setRecords.put({
    setRecordId: `${sessionId}:set:${order}`, sessionId, sessionExerciseId: 'se1',
    exerciseId: EX, order, setType: 'NORMAL',
    plannedReps: reps, plannedWeight: weight, actualReps: reps, actualWeight: weight,
    status: 'COMPLETED', completedAt: `${date}T${time}`,
    createdAt: `${date}T${time}`, updatedAt: `${date}T${time}`,
  } as never)
}

async function seedLegacy(id: string, sessionId = 'sess-A', date = '2026-09-10', weight = 80, reps = 8, order = 1) {
  await db.setLogs.put({
    id, sessionId, exerciseId: EX, setNumber: order, weight, reps,
    completed: true, createdAt: `${date}T10:00:00Z`, updatedAt: `${date}T10:00:00Z`,
  } as never)
}

describe('FASE 2 — Historial único y sin duplicados', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('1. canonical + legacy del mismo registro cuentan una sola vez', async () => {
    await seedOfficial()
    await seedLegacy('legacy-1')
    const sets = await unifiedCompletedSets(EX)
    expect(sets.length).toBe(1)
    // El canónico gana ante colisión
    expect(await unifiedSetsForPR(EX)).toHaveLength(1)
  })

  it('2. dos series reales con mismo peso y reps no se fusionan', async () => {
    const items = [official({ order: 1 }), official({ order: 2, setRecordId: 'se1:set:2' })]
    expect(dedupeUnifiedSets(items)).toHaveLength(2)
    await seedOfficial('sess-A', '2026-09-10', 80, 8, 1)
    await seedOfficial('sess-A', '2026-09-10', 80, 8, 2)
    const sets = await unifiedCompletedSets(EX)
    expect(sets.length).toBe(2)
  })

  it('3/4. dos sesiones del mismo día permanecen separadas; última ejecución es la sesión más reciente', async () => {
    await seedOfficial('sess-A', '2026-09-10', 80, 8, 1, '10:00:00Z')
    await seedOfficial('sess-B', '2026-09-10', 90, 5, 1, '18:00:00Z')
    const last = await getLastExecutionByExercise(EX)
    expect(last).not.toBeNull()
    expect(last?.sessionId).toBe('sess-B')
    expect(last?.sets).toHaveLength(1)
    expect(last?.sets[0]).toMatchObject({ weight: 90, reps: 5 })
    // Ambas sesiones visibles en el historial
    expect(await unifiedCompletedSets(EX)).toHaveLength(2)
  })

  it('5/6. PR y volumen no se duplican por coexistencia legacy/canonical', async () => {
    await seedOfficial('sess-A', '2026-09-10', 100, 5, 1)
    await seedLegacy('legacy-1', 'sess-A', '2026-09-10', 100, 5, 1)
    const sets = await unifiedSetsForPR(EX)
    const prs = calculateExercisePRs(sets)
    expect(prs.maxWeight).toMatchObject({ weight: 100, reps: 5 })
    const landmarks = aggregateVolumeLandmarks(
      sets.map(s => ({ ...s, exerciseId: EX })), 'weekly'
    )
    expect(landmarks).toHaveLength(1)
    expect(landmarks[0].totalVolume).toBe(500)
    expect(landmarks[0].totalSets).toBe(1)
  })

  it('7. exerciseCount cuenta ejercicios reales', async () => {
    const landmarks = aggregateVolumeLandmarks([
      { weight: 100, reps: 5, date: '2026-09-08', exerciseId: 'ex-006' },
      { weight: 60, reps: 10, date: '2026-09-09', exerciseId: 'ex-010' },
    ], 'weekly')
    expect(landmarks).toHaveLength(1)
    expect(landmarks[0].exerciseCount).toBe(2)
  })

  it('8. mismo ejercicio en distintas rutinas conserva historial común', async () => {
    // La query es solo por exerciseId: sesiones de rutinas distintas conviven
    await seedOfficial('sess-rutina-1', '2026-09-01', 70, 8, 1)
    await seedOfficial('sess-rutina-2', '2026-09-08', 75, 8, 1)
    const sets = await unifiedCompletedSets(EX)
    expect(sets.length).toBe(2)
  })

  it('9. una sesión con varias series conserva el orden', async () => {
    await seedOfficial('sess-A', '2026-09-10', 80, 8, 1)
    await seedOfficial('sess-A', '2026-09-10', 85, 6, 2)
    await seedOfficial('sess-A', '2026-09-10', 90, 4, 3)
    const last = await getLastExecutionByExercise(EX)
    expect(last?.sets.map(s => s.setNumber)).toEqual([1, 2, 3])
    expect(last?.sets.map(s => s.weight)).toEqual([80, 85, 90])
  })

  it('legacy sin contraparte oficial se conserva', async () => {
    await seedLegacy('legacy-only', 'sess-old', '2026-07-01', 60, 10, 1)
    const sets = await unifiedCompletedSets(EX)
    expect(sets.length).toBe(1)
    expect(sets[0]).toMatchObject({ weight: 60, reps: 10 })
  })
})
