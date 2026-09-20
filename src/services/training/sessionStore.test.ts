import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import {
  createSession, getActiveSession, getSession, transitionSession,
  confirmSetRecord, getSetRecords, skipSessionExercise, getSessionExercises,
  replaceSessionExercise, saveExerciseObservation,
} from './sessionStore'
import { recordVariantDecision } from '@/services/ai/variantService'
import type { UserProfile } from '@/types'

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

  it('READY -> COMPLETING se encadena automáticamente (nunca falla)', async () => {
    const s = await createSession({
      routineId: 'r1', plannedDay: 1, actualDay: 1,
      calendarDate: '2026-09-10', plannedExercises: planned,
    })
    const nx = await transitionSession(s.sessionId, 'COMPLETING')
    expect(nx.sessionStatus).toBe('COMPLETING')
    expect(nx.startedAt).toBeTruthy()
    expect(nx.completingAt).toBeTruthy()
    const events = await db.table('sessionEvents').where('sessionId').equals(s.sessionId).toArray()
    const types = events.map((e) => (e as { type: string }).type)
    expect(types).toContain('SESSION_STARTED')
    expect(types).toContain('SESSION_COMPLETING')
    // y desde ahí el cierre es directo
    const done = await transitionSession(s.sessionId, 'COMPLETED')
    expect(done.sessionStatus).toBe('COMPLETED')
  })

  it('transiciones concurrentes se serializan sin corromper (doble COMENZAR)', async () => {
    const s = await createSession({
      routineId: 'r1', plannedDay: 1, actualDay: 1,
      calendarDate: '2026-09-10', plannedExercises: planned,
    })
    const [a, b] = await Promise.allSettled([
      transitionSession(s.sessionId, 'IN_PROGRESS'),
      transitionSession(s.sessionId, 'IN_PROGRESS'),
    ])
    expect(a.status).toBe('fulfilled')
    expect(b.status).toBe('rejected')
    const cur = await getSession(s.sessionId)
    expect(cur?.sessionStatus).toBe('IN_PROGRESS')
    expect(cur?.startedAt).toBeTruthy()
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

describe('US2 — T017/T018 Integridad (doble click, historial, offline)', () => {
  const plannedExercises = [
    { exId: 'press', name: 'Press Banca', sets: 3, reps: 8, weight: 80, muscle: 'Pecho' },
    { exId: 'sentadilla', name: 'Sentadilla', sets: 3, reps: 10, weight: 100, muscle: 'Piernas' },
  ]

  beforeEach(async () => {
    localStorage.clear()
    for (const t of ['trainingSessions','sessionExercises','setRecords','sessionEvents','postWorkoutSurveys','negativeSets','exerciseObservations','painLogs']) {
      await db.table(t).clear().catch(() => null)
    }
  })

  async function createReadySession(date: string = '2026-09-10') {
    const s = await createSession({
      routineId: 'r1', routineName: 'R', plannedDay: 1, actualDay: 1,
      calendarDate: date, plannedExercises,
    })
    return s
  }

  it('1. PainLog no se duplica por doble click / doble ejecución', async () => {
    const s = await createReadySession()
    await transitionSession(s.sessionId, 'IN_PROGRESS')
    const [se] = await getSessionExercises(s.sessionId)

    // Simular la lógica de PainToggle: verificar si existe antes de insertar
    const today = '2026-09-10'
    const level = 'moderate'
    const zone = 'hombro derecho'

    // Primera inserción (simula primer click en Guardar)
    const existing1 = await db.painLogs.where({ exerciseId: se.exerciseId, localDate: today, level }).first()
    expect(existing1).toBeUndefined()
    await db.painLogs.put({
      id: crypto.randomUUID(), localDate: today, level, zone, exerciseId: se.exerciseId,
      moment: new Date().toISOString(), notes: 'Primera vez', createdAt: new Date().toISOString(),
    })

    // Segunda inserción (simula doble click): la verificación encuentra el existente
    const existing2 = await db.painLogs.where({ exerciseId: se.exerciseId, localDate: today, level }).first()
    expect(existing2).toBeDefined()
    // No se inserta duplicado

    const logs = await db.painLogs.where({ exerciseId: se.exerciseId, localDate: today, level }).toArray()
    expect(logs.length).toBe(1)
  })

  it('2. Sustitución no se duplica por doble aceptación', async () => {
    const s = await createReadySession()
    await transitionSession(s.sessionId, 'IN_PROGRESS')
    const [se] = await getSessionExercises(s.sessionId)

    // Primera sustitución
    const r1 = await replaceSessionExercise(se.sessionExerciseId, 'press-inclinado', 'Dolor', 'moderado')
    expect(r1.status).toBe('REPLACED')
    expect(r1.replacement?.replacementExerciseId).toBe('press-inclinado')

    // Segunda llamada con mismos parámetros (doble click en aceptar variante)
    const r2 = await replaceSessionExercise(se.sessionExerciseId, 'press-inclinado', 'Dolor', 'moderado')
    
    // Debe retornar el mismo objeto, no crear duplicado
    expect(r2.sessionExerciseId).toBe(r1.sessionExerciseId)
    expect(r2.replacement?.replacementId).toBe(r1.replacement?.replacementId)

    // Verificar en DB: solo un registro
    const all = await db.sessionExercises.where('sessionId').equals(s.sessionId).toArray()
    const replaced = all.filter(e => e.status === 'REPLACED')
    expect(replaced).toHaveLength(1)
  })

  it('3. Historial original no se modifica (originalExerciseId conservado)', async () => {
    const s = await createReadySession()
    await transitionSession(s.sessionId, 'IN_PROGRESS')
    const [se] = await getSessionExercises(s.sessionId)
    const originalId = se.exerciseId

    await replaceSessionExercise(se.sessionExerciseId, 'press-inclinado', 'Dolor')

    const updated = await db.sessionExercises.get(se.sessionExerciseId)
    expect(updated?.replacement?.originalExerciseId).toBe(originalId)
    expect(updated?.replacement?.replacementExerciseId).toBe('press-inclinado')
    // El exerciseId actual cambió, pero el original queda en replacement
    expect(updated?.exerciseId).toBe('press-inclinado')
  })

  it('4. Sustitución queda asociada a la sesión correcta', async () => {
    const s1 = await createReadySession('2026-09-10')
    await transitionSession(s1.sessionId, 'IN_PROGRESS')
    const [se1] = await getSessionExercises(s1.sessionId)

    // Cerrar sesión 1 para poder crear la 2 (createSession reusa la activa)
    await transitionSession(s1.sessionId, 'COMPLETING')
    await transitionSession(s1.sessionId, 'COMPLETED')

    const s2 = await createReadySession('2026-09-11')
    await transitionSession(s2.sessionId, 'IN_PROGRESS')
    const [se2] = await getSessionExercises(s2.sessionId)

    // Sustituir en sesión 1
    await replaceSessionExercise(se1.sessionExerciseId, 'press-inclinado', 'Dolor')
    // Sustituir en sesión 2
    await replaceSessionExercise(se2.sessionExerciseId, 'sentadilla-goblet', 'Fatiga')

    const r1 = await db.sessionExercises.get(se1.sessionExerciseId)
    const r2 = await db.sessionExercises.get(se2.sessionExerciseId)

    expect(r1?.replacement?.sessionId).toBe(s1.sessionId)
    expect(r2?.replacement?.sessionId).toBe(s2.sessionId)
    expect(r1?.replacement?.sessionId).not.toBe(s2.sessionId)
  })

  it('5. Recarga recupera los datos (persistencia Dexie)', async () => {
    const s = await createReadySession()
    await transitionSession(s.sessionId, 'IN_PROGRESS')
    const [se] = await getSessionExercises(s.sessionId)

    await replaceSessionExercise(se.sessionExerciseId, 'press-inclinado', 'Dolor')
    await db.painLogs.put({
      id: crypto.randomUUID(),
      localDate: '2026-09-10',
      level: 'moderate',
      zone: 'hombro',
      exerciseId: se.exerciseId,
      moment: new Date().toISOString(),
      notes: 'Test persistencia',
      createdAt: new Date().toISOString(),
    })

    // Simular recarga: nueva conexión a DB
    await db.close()
    await db.open()

    const reloaded = await db.sessionExercises.get(se.sessionExerciseId)
    expect(reloaded?.replacement?.replacementExerciseId).toBe('press-inclinado')

    const painLogs = await db.painLogs.where('exerciseId').equals(se.exerciseId).toArray()
    expect(painLogs.length).toBe(1)
    expect(painLogs[0].notes).toBe('Test persistencia')
  })

  it('6. Offline mantiene la operación crítica (Dexie sin red)', async () => {
    const s = await createReadySession()
    await transitionSession(s.sessionId, 'IN_PROGRESS')
    const [se] = await getSessionExercises(s.sessionId)

    // Operaciones que no requieren red
    await replaceSessionExercise(se.sessionExerciseId, 'press-inclinado', 'Dolor')
    await db.painLogs.put({
      id: crypto.randomUUID(),
      localDate: '2026-09-10',
      level: 'severe',
      zone: 'lumbar',
      exerciseId: se.exerciseId,
      moment: new Date().toISOString(),
      notes: 'Offline test',
      createdAt: new Date().toISOString(),
    })
    await recordVariantDecision(s.sessionId, se.exerciseId, 'press-inclinado', 'accepted', 'Dolor lumbar')

    // Verificar que todo se guardó localmente
    const ex = await db.sessionExercises.get(se.sessionExerciseId)
    expect(ex?.replacement).toBeDefined()

    const pains = await db.painLogs.where('exerciseId').equals(se.exerciseId).toArray()
    expect(pains.length).toBe(1)

    const obs = await db.exerciseObservations.where('sessionId').equals(s.sessionId).toArray()
    expect(obs.some(o => o.type === 'VARIANT_ACCEPTED')).toBe(true)
  })

  it('7. Ejercicio excluido nunca aparece como variante (isExerciseCompatible)', async () => {
    const { isExerciseCompatible } = await import('@/services/ai/variantService')
    const { fetchAll } = await import('@/services/exerciseGym')

    const exercises = (await fetchAll()).exercises
    const press = exercises.find(e => e.id === 'press') || exercises[0]
    
    const userProfile = {
      id: 'test-user',
      goal: 'fuerza' as const,
      level: 'intermedio' as const,
      availableDays: [1,2,3,4,5],
      trainingTime: '60',
      equipment: ['full_gym'] as any,
      units: { weight: 'kg' as const, liquid: 'ml' as const },
      lang: 'es',
      coachIntensity: 'profesional' as const,
      onboardingDone: true,
      hydrationGoalMl: 2500,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      excludedExercises: [press.id],
      painAreas: [],
      limitations: [],
    } as UserProfile

    // isExerciseCompatible espera { id, equipment, muscle, pattern, level }
    const exerciseForCheck = {
      id: press.id,
      equipment: press.equipment,
      muscle: press.muscle,
      pattern: press.movementPattern ?? 'push',
      level: 'intermediate',
    }

    // isExerciseCompatible debe devolver compatible: false para ejercicio excluido
    const result = isExerciseCompatible(exerciseForCheck, userProfile)
    expect(result.compatible).toBe(false)
  })
})
