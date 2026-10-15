import { describe, it, expect } from 'vitest'
import { buildRoutineCompliance } from './routineCompliance'
import type { RoutineData } from '@/services/storage/routineStore'

const routine = (overrides: Partial<RoutineData> = {}): RoutineData => ({
  id: 'r1',
  name: 'Fuerza total',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  rotationDays: 30,
  cycle: { trainingDays: [{ n: 1, name: 'Pecho' }, { n: 2, name: 'Espalda' }] } as never,
  dayExercises: {
    1: [
      { id: 're1', exId: 'press', sets: 3, reps: 8, weight: 80 },
      { id: 're2', exId: 'curl', sets: 2, reps: 10, weight: 15 },
    ],
    2: [{ id: 're3', exId: 'remo', sets: 4, reps: 8, weight: 60 }],
  },
  ...overrides,
})

const session = (overrides: Record<string, unknown> = {}) => ({
  sessionId: 's1',
  routineId: 'r1',
  actualDay: 1,
  calendarDate: '2026-10-10',
  sessionStatus: 'COMPLETED',
  startedAt: '2026-10-10T10:00:00.000Z',
  completedAt: '2026-10-10T11:00:00.000Z',
  ...overrides,
})

const set = (sessionId: string, exerciseId: string) => ({ sessionId, exerciseId })

describe('buildRoutineCompliance', () => {
  it('cumplimiento parcial con numerador y denominador explícitos', () => {
    const c = buildRoutineCompliance({
      routine: routine(),
      sessions: [session()],
      sets: [set('s1', 'press'), set('s1', 'press'), set('s1', 'curl')],
      windowStart: '2026-10-01',
      windowEnd: '2026-10-14',
    })
    // Plan: 3+2+4 = 9 series; 3 ejercicios; 2 días.
    expect(c.seriesPlanned).toBe(9)
    expect(c.seriesDone).toBe(3)
    expect(c.seriesPct).toBe(33)
    expect(c.exPlanned).toBe(3)
    expect(c.exDone).toBe(2)
    expect(c.exPct).toBe(67)
    expect(c.exPending).toEqual(['remo'])
    expect(c.daysPlanned).toBe(2)
    expect(c.daysDone).toBe(1)
    expect(c.daysPct).toBe(50)
    expect(c.sessionsDone).toBe(1)
    expect(c.sessionsPending).toBe(1)
    expect(c.untrackedSets).toBe(0)
    expect(c.durationSec).toBe(3600)
    expect(c.hasPlan).toBe(true)
  })

  it('ignora sesiones de otra rutina, en curso o fuera de ventana', () => {
    const c = buildRoutineCompliance({
      routine: routine(),
      sessions: [
        session({ sessionId: 's1' }),
        session({ sessionId: 's2', routineId: 'r2' }),
        session({ sessionId: 's3', sessionStatus: 'IN_PROGRESS' }),
        session({ sessionId: 's4', calendarDate: '2026-09-01' }),
      ],
      sets: [set('s1', 'press'), set('s2', 'press'), set('s3', 'press'), set('s4', 'press'), set('', 'press')],
      windowStart: '2026-10-01',
      windowEnd: '2026-10-14',
    })
    expect(c.seriesDone).toBe(1)
    expect(c.sessionsDone).toBe(1)
    // Las 4 series restantes no pertenecen a esta rutina en la ventana.
    expect(c.untrackedSets).toBe(4)
  })

  it('una rutina sin plan no divide por cero', () => {
    const c = buildRoutineCompliance({
      routine: routine({ dayExercises: {}, cycle: { trainingDays: [] } as never }),
      sessions: [session()],
      sets: [set('s1', 'press')],
      windowStart: '2026-10-01',
      windowEnd: '2026-10-14',
    })
    expect(c.hasPlan).toBe(false)
    expect(c.seriesPct).toBeNull()
    expect(c.exPct).toBeNull()
    expect(c.daysPct).toBeNull()
  })

  it('duración null cuando ninguna sesión informa inicio y fin', () => {
    const c = buildRoutineCompliance({
      routine: routine(),
      sessions: [session({ startedAt: undefined, completedAt: undefined, endedAt: undefined })],
      sets: [set('s1', 'press')],
      windowStart: '2026-10-01',
      windowEnd: '2026-10-14',
    })
    expect(c.durationSec).toBeNull()
    expect(c.seriesDone).toBe(1)
  })

  it('usa series por serie cuando la rutina define el plan por serie', () => {
    const r = routine({
      dayExercises: {
        1: [{ id: 're1', exId: 'press', sets: 3, reps: 8, weight: 80, series: [{ reps: 8, weight: 80 }, { reps: 8, weight: 80 }] }],
      },
    })
    const c = buildRoutineCompliance({
      routine: r,
      sessions: [session()],
      sets: [set('s1', 'press')],
      windowStart: '2026-10-01',
      windowEnd: '2026-10-14',
    })
    expect(c.seriesPlanned).toBe(2)
  })
})
