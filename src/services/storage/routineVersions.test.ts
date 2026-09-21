import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/services/storage/db'
import {
  saveRoutineVersioned, listRoutineVersions, diffRoutines, MAX_ROUTINES,
  type RoutineData,
} from './routineStore'
import { DEFAULT_CYCLE } from '@/utils/cycle'

function routine(id = 'r1', dayExercises?: RoutineData['dayExercises']): RoutineData {
  return {
    id, name: 'Rutina', createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z',
    rotationDays: 30, cycle: DEFAULT_CYCLE,
    dayExercises: dayExercises ?? { 1: [{ id: 'e1', exId: 'press', sets: 3, reps: 8, weight: 80 }] },
  }
}

async function seedSession(routineId = 'r1') {
  await db.trainingSessions.put({
    id: 'ts1', sessionId: 'ts1', userId: 'me', routineId,
    plannedDay: 1, actualDay: 1, calendarDate: '2026-09-10',
    sessionStatus: 'COMPLETED', createdAt: '2026-09-10T10:00:00Z', updatedAt: '2026-09-10T10:00:00Z',
  } as never)
}

describe('ET13 — Versionado de rutinas', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('límite de 5 rutinas', () => {
    expect(MAX_ROUTINES).toBe(5)
  })

  it('rutina nunca usada se guarda directo sin versión', async () => {
    const { saved, versioned } = await saveRoutineVersioned(routine())
    expect(versioned).toBe(false)
    expect(saved.version).toBe(1)
    expect(await listRoutineVersions('r1')).toHaveLength(0)
  })

  it('rutina usada + cambio → archiva v1 y guarda v2; sesión intacta', async () => {
    await db.routineStore.put(routine())
    await seedSession()
    const changed: RoutineData = {
      ...routine(),
      dayExercises: {
        1: [{ id: 'e1', exId: 'press', sets: 4, reps: 8, weight: 80 }],
        2: [{ id: 'e2', exId: 'sentadilla', sets: 3, reps: 10, weight: 100 }],
      },
    }
    const { saved, versioned } = await saveRoutineVersioned(changed)
    expect(versioned).toBe(true)
    expect(saved.version).toBe(2)
    const versions = await listRoutineVersions('r1')
    expect(versions).toHaveLength(1)
    expect(versions[0].id).toBe('r1-v1')
    expect(versions[0].archived).toBe(true)
    // Sesión histórica intacta
    const s = await db.trainingSessions.get('ts1')
    expect(s?.sessionStatus).toBe('COMPLETED')
    // Segunda modificación → v3 con v1 y v2 preservadas
    const { saved: v3 } = await saveRoutineVersioned({ ...changed, rotationDays: 45 })
    expect(v3.version).toBe(3)
    expect(await listRoutineVersions('r1')).toHaveLength(2)
  })

  it('contenido idéntico no crea versión', async () => {
    await db.routineStore.put(routine())
    await seedSession()
    const { versioned } = await saveRoutineVersioned(routine())
    expect(versioned).toBe(false)
    expect(await listRoutineVersions('r1')).toHaveLength(0)
  })

  it('diffRoutines distingue agregados, quitados y modificados', () => {
    const a = routine('r1', {
      1: [{ id: 'e1', exId: 'press', sets: 3, reps: 8, weight: 80 }],
      2: [{ id: 'e2', exId: 'remo', sets: 3, reps: 10, weight: 60 }],
    })
    const b = routine('r1', {
      1: [{ id: 'e1', exId: 'press', sets: 4, reps: 8, weight: 80 }],
      3: [{ id: 'e3', exId: 'sentadilla', sets: 3, reps: 10, weight: 100 }],
    })
    const d = diffRoutines(a, b)
    expect(d.added).toEqual([{ day: 3, exId: 'sentadilla', name: 'sentadilla' }])
    expect(d.removed).toEqual([{ day: 2, exId: 'remo', name: 'remo' }])
    expect(d.changed).toHaveLength(1)
    expect(d.changed[0]).toMatchObject({ day: 1, exId: 'press', from: '3x8@80', to: '4x8@80' })
  })

  it('getAllRoutines excluye archivadas; reload conserva versiones', async () => {
    const { getAllRoutines } = await import('./routineStore')
    await db.routineStore.put(routine())
    await seedSession()
    await saveRoutineVersioned({ ...routine(), rotationDays: 45 })
    expect((await getAllRoutines()).map(r => r.id)).toEqual(['r1'])
    await db.close()
    await db.open()
    expect(await listRoutineVersions('r1')).toHaveLength(1)
  })
})
