import { describe, it, expect } from 'vitest'
import { completionOf, volumeOf, muscleWorkOf, progressVsLast, daysBetweenSessions } from './metrics'
import type { SetRecord, SessionExercise } from './domain'

const se = (over: Partial<SessionExercise> = {}): SessionExercise => ({
  sessionExerciseId: 'se', sessionId: 's', exerciseId: 'e', order: 0,
  planned: true, completed: false, status: 'PENDING',
  plannedSetCount: 3, actualSetCount: 0, plannedSets: [],
  createdAt: '', updatedAt: '', ...over,
})
const sr = (over: Partial<SetRecord> = {}): SetRecord => ({
  setRecordId: 'r', sessionId: 's', sessionExerciseId: 'se', exerciseId: 'e', order: 1,
  setType: 'NORMAL', plannedReps: 10, plannedWeight: 50,
  actualReps: 10, actualWeight: 50, status: 'COMPLETED',
  createdAt: '', updatedAt: '', ...over,
})

describe('métricas recalculables (§35-39)', () => {
  it('completion: ejercicios y series', () => {
    const ex = [se({ status: 'COMPLETED' }), se({ status: 'PARTIAL' }), se({ status: 'PENDING' })]
    const sets = [sr(), sr({ order: 2 }), sr({ order: 3, status: 'SKIPPED' })]
    const c = completionOf(ex, sets)
    expect(c.exPct).toBe(33)
    expect(c.setPct).toBe(22) // 2/9
    expect(c.completedEx).toBe(1)
  })

  it('volumen solo cuenta COMPLETED', () => {
    const v = volumeOf([sr(), sr({ order: 2, status: 'SKIPPED' }), sr({ order: 3, status: 'PENDING' })])
    expect(v).toEqual({ reps: 10, volume: 500 })
  })

  it('trabajo muscular solo ejecutado, con ponderación', () => {
    const sets = [sr({ exerciseId: 'press' })]
    const w = muscleWorkOf(sets, () => ({ primary: 'pecho', secondary: ['triceps'] }))
    const pecho = w.find((x) => x.muscle === 'pecho')!
    const tri = w.find((x) => x.muscle === 'triceps')!
    expect(pecho.volume).toBe(500)
    expect(tri.volume).toBe(250)
    expect(pecho.pct + tri.pct).toBe(100)
  })

  it('progreso 80x8 -> 80x10 = +2 reps', () => {
    const p = progressVsLast({ reps: 10, weight: 80 }, { reps: 8, weight: 80, date: '2026-09-01' })!
    expect(p.repsDelta).toBe(2)
    expect(p.weightDelta).toBe(0)
    expect(p.label).toContain('+2 reps')
  })

  it('frecuencia: días entre sesiones', () => {
    expect(daysBetweenSessions(['2026-09-01', '2026-09-03', '2026-09-04'])).toEqual([2, 1])
  })
})
