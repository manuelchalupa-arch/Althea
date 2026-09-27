import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/services/storage/db'
import type { CycleConfig } from '@/utils/cycle'
import { DEFAULT_CYCLE } from '@/utils/cycle'
import {
  savePlanning,
  getActiveVersion,
  getCanonicalCycle,
  listVersions,
  getVersionForSession,
  isPlanningUsed,
  PROFILE_SCOPE,
} from './cycleVersions'
import { createReadySession, transitionSession, getSession } from '@/services/training/sessionStore'

const CYCLE_V1: CycleConfig = {
  startDate: '2026-09-01',
  trainingDays: [{ n: 1, name: 'Pecho' }, { n: 2, name: 'Espalda' }],
  weekMap: [null, 1, null, 2, null, null, null],
  methodId: 'full_body' as never,
}

const CYCLE_V2: CycleConfig = {
  startDate: '2026-10-01',
  trainingDays: [{ n: 1, name: 'Pecho' }, { n: 2, name: 'Espalda' }, { n: 3, name: 'Piernas' }],
  weekMap: [null, 1, 2, null, 3, null, null],
  methodId: 'upper_lower' as never,
}

const EXERCISES = [
  { exId: 'press', name: 'Press Banca', sets: 2, reps: 8, weight: 80, muscle: 'Pecho' },
]

async function finishSession(sessionId: string) {
  await transitionSession(sessionId, 'IN_PROGRESS')
  await transitionSession(sessionId, 'COMPLETING')
  await transitionSession(sessionId, 'COMPLETED')
}

describe('FASE 3 — Versionado de planificación', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('escenario obligatorio: v1 → sesión → modificar → v2 → sesión; el pasado no cambia', async () => {
    // Crear planificación v1
    const r1 = await savePlanning({ cycle: CYCLE_V1 })
    expect(r1.version.version).toBe(1)
    expect(r1.created).toBe(true)

    // Realizar y finalizar entrenamiento bajo v1
    const s1 = await createReadySession({
      calendarDate: '2026-09-10', routineId: 'r1', routineName: 'R',
      plannedDay: 1, plannedDayName: 'Pecho', actualDay: 1, actualDayName: 'Pecho',
      exercises: EXERCISES,
    })
    await finishSession(s1.sessionId)
    const stored1 = await getSession(s1.sessionId)
    expect(stored1?.cycleId).toBe(r1.version.id)

    // Modificar planificación → nace v2
    const r2 = await savePlanning({ cycle: CYCLE_V2 })
    expect(r2.created).toBe(true)
    expect(r2.version.version).toBe(2)
    expect(r2.version.previousVersionId).toBe(r1.version.id)

    // La sesión antigua sigue asociada a v1 e intacta
    const stored1After = await getSession(s1.sessionId)
    expect(stored1After?.cycleId).toBe(r1.version.id)
    expect(stored1After?.sessionStatus).toBe('COMPLETED')
    const v1 = await getVersionForSession(stored1After!)
    expect(v1?.version).toBe(1)
    expect(v1?.cycle.trainingDays).toHaveLength(2)

    // Nuevo entrenamiento utiliza v2
    const s2 = await createReadySession({
      calendarDate: '2026-10-05', routineId: 'r1', routineName: 'R',
      plannedDay: 1, plannedDayName: 'Pecho', actualDay: 1, actualDayName: 'Pecho',
      exercises: EXERCISES,
    })
    await finishSession(s2.sessionId)
    const stored2 = await getSession(s2.sessionId)
    expect(stored2?.cycleId).toBe(r2.version.id)

    // Cambiar v2 no modifica la sesión anterior; historial con ambas
    const r3 = await savePlanning({ cycle: { ...CYCLE_V2, startDate: '2026-11-01' } })
    expect(r3.version.version).toBe(3)
    expect((await getSession(s1.sessionId))?.cycleId).toBe(r1.version.id)
    expect((await getSession(s2.sessionId))?.cycleId).toBe(r2.version.id)
    const all = await db.trainingSessions.toArray()
    expect(all.length).toBe(2)
  })

  it('1. modificar planificación no utilizada no crea versión innecesaria', async () => {
    const r1 = await savePlanning({ cycle: CYCLE_V1 })
    const r2 = await savePlanning({ cycle: { ...CYCLE_V1, startDate: '2026-09-02' } })
    expect(r2.created).toBe(false)
    expect(r2.version.version).toBe(1)
    expect(r2.version.id).toBe(r1.version.id)
    expect(await db.cycleVersions.count()).toBe(1)
  })

  it('2. modificar planificación utilizada crea nueva versión', async () => {
    await savePlanning({ cycle: CYCLE_V1 })
    await db.trainingSessions.put({
      id: 'ts', sessionId: 'ts', userId: 'me', routineId: 'r1',
      plannedDay: 1, actualDay: 1, calendarDate: '2026-09-10',
      sessionStatus: 'COMPLETED', createdAt: '2026-09-10T10:00:00Z', updatedAt: '2026-09-10T10:00:00Z',
    } as never)
    const r2 = await savePlanning({ cycle: CYCLE_V2 })
    expect(r2.created).toBe(true)
    expect(r2.version.version).toBe(2)
  })

  it('3. varias versiones consecutivas quedan diferenciadas', async () => {
    const v1 = await savePlanning({ cycle: CYCLE_V1 })
    await db.trainingSessions.put({
      id: 'ts', sessionId: 'ts', userId: 'me', routineId: 'r1',
      plannedDay: 1, actualDay: 1, calendarDate: '2026-09-10',
      sessionStatus: 'COMPLETED', createdAt: '2026-09-10T10:00:00Z', updatedAt: '2026-09-10T10:00:00Z',
    } as never)
    const v2 = await savePlanning({ cycle: CYCLE_V2 })
    const v3 = await savePlanning({ cycle: { ...CYCLE_V2, startDate: '2026-11-01' } })
    const all = await listVersions()
    expect(all.map(v => v.version)).toEqual([1, 2, 3])
    expect(v3.version.previousVersionId).toBe(v2.version.id)
    expect(v2.version.previousVersionId).toBe(v1.version.id)
    const active = await getActiveVersion()
    expect(active?.id).toBe(v3.version.id)
    expect(all.filter(v => v.status === 'historic')).toHaveLength(2)
  })

  it('7. recarga no pierde las versiones', async () => {
    await savePlanning({ cycle: CYCLE_V1 })
    await db.close()
    await db.open()
    const active = await getActiveVersion()
    expect(active?.version).toBe(1)
    expect(active?.cycle.trainingDays).toHaveLength(2)
  })

  it('8. datos existentes sin versiones siguen funcionando', async () => {
    await db.trainingSessions.put({
      id: 'ts', sessionId: 'ts', userId: 'me', routineId: 'r1',
      plannedDay: 1, actualDay: 1, calendarDate: '2026-09-10',
      sessionStatus: 'COMPLETED', createdAt: '2026-09-10T10:00:00Z', updatedAt: '2026-09-10T10:00:00Z',
    } as never)
    // Sin versiones: activa null, usada true, guardado crea v1 directamente
    expect(await getActiveVersion()).toBeNull()
    expect(await isPlanningUsed(PROFILE_SCOPE)).toBe(true)
    const r = await savePlanning({ cycle: CYCLE_V1 })
    expect(r.version.version).toBe(1)
    const legacy = await getSession('ts')
    expect(legacy?.sessionStatus).toBe('COMPLETED')
    expect(await getVersionForSession(legacy!)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FASE 2 S3 — Evidencia de cierre: lectura canónica activa, fallback legacy,
// ausencia de ciclo y ausencia de doble escritura canónica.
// ─────────────────────────────────────────────────────────────────────────────
describe('FASE 2 S3 — contrato de lectura canónica y fallback legacy', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('A. la versión activa gana sobre el snapshot legacy profile.cycle', async () => {
    await db.userProfile.put({ id: 'me', cycle: CYCLE_V1, updatedAt: '2026-09-01T00:00:00Z' } as never)
    await savePlanning({ cycle: CYCLE_V2 })

    const canonical = await getCanonicalCycle((await db.userProfile.get('me')) as never)

    expect(await getActiveVersion()).not.toBeNull()
    expect(canonical.startDate).toBe('2026-10-01')
    expect(canonical.trainingDays).toHaveLength(3)
    expect(canonical.weekMap).toEqual(CYCLE_V2.weekMap)
    expect(canonical.methodId).toBe(CYCLE_V2.methodId)
    // El snapshot legacy (2 días, 2026-09-01) no contaminó el resultado.
    expect(canonical.trainingDays).not.toHaveLength(2)
  })

  it('B. sin versión activa cae al snapshot legacy (fallback intencional)', async () => {
    await db.userProfile.put({ id: 'me', cycle: CYCLE_V1, updatedAt: '2026-09-01T00:00:00Z' } as never)
    expect(await getActiveVersion()).toBeNull()

    const canonical = await getCanonicalCycle((await db.userProfile.get('me')) as never)

    expect(canonical.startDate).toBe(CYCLE_V1.startDate)
    expect(canonical.trainingDays).toHaveLength(2)
    expect(canonical.methodId).toBe(CYCLE_V1.methodId)
  })

  it('C. sin versión ni ciclo no rompe: devuelve DEFAULT_CYCLE, nunca undefined', async () => {
    await expect(getCanonicalCycle(null)).resolves.toEqual(DEFAULT_CYCLE)

    await db.userProfile.put({ id: 'me', updatedAt: '2026-09-01T00:00:00Z' } as never)
    const sinCiclo = await getCanonicalCycle((await db.userProfile.get('me')) as never)

    expect(sinCiclo).toEqual(DEFAULT_CYCLE)
    expect(sinCiclo.weekMap).toBeDefined()
    expect(sinCiclo.trainingDays.length).toBeGreaterThan(0)
    expect(sinCiclo.startDate).toBeTruthy()
  })

  it('D. la versión histórica de una sesión no cambia al crear una nueva activa', async () => {
    await savePlanning({ cycle: CYCLE_V1 })
    const s1 = await createReadySession({
      calendarDate: '2026-09-10', routineId: 'r1', routineName: 'R',
      plannedDay: 1, plannedDayName: 'Pecho', actualDay: 1, actualDayName: 'Pecho',
      exercises: EXERCISES,
    })
    await finishSession(s1.sessionId)

    await savePlanning({ cycle: CYCLE_V2 })

    const historica = await getVersionForSession((await getSession(s1.sessionId))!)
    expect(historica?.version).toBe(1)
    expect(historica?.status).toBe('historic')
    expect(historica?.cycle.trainingDays).toHaveLength(2)

    const activa = await getActiveVersion()
    expect(activa?.version).toBe(2)
    expect((await getVersionForSession({ cycleId: activa!.id }))?.version).toBe(2)
  })

  it('E. savePlanning es el único escritor canónico: misma planificación no duplica versiones', async () => {
    await savePlanning({ cycle: CYCLE_V1 })
    await savePlanning({ cycle: { ...CYCLE_V1 } })
    await savePlanning({ cycle: { ...CYCLE_V1 } })

    expect(await db.cycleVersions.count()).toBe(1)
    const all = await listVersions()
    expect(all).toHaveLength(1)
    expect(all.filter(v => v.status === 'active')).toHaveLength(1)
    expect(all.filter(v => v.status === 'historic')).toHaveLength(0)
  })
})
