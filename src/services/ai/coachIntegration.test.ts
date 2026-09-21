import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/services/storage/db'
import { buildTrainingContext, buildPrompt } from './contextBuilder'
import { DEFAULT_CYCLE } from '@/utils/cycle'

describe('ET17 — Coach final integrado', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  async function seedAll() {
    await db.userProfile.put({
      id: 'me', goal: 'hipertrofia', level: 'intermedio', availableDays: [1, 3, 5],
      trainingTime: '18:00', equipment: ['barra'], units: { weight: 'kg', liquid: 'ml' },
      lang: 'es', coachIntensity: 'profesional', onboardingDone: true, hydrationGoalMl: 2500,
      cycle: DEFAULT_CYCLE,
      createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z',
    } as never)
    await db.routineStore.put({
      id: 'r1', name: 'Rutina', version: 2,
      createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-10T10:00:00Z',
      rotationDays: 30, cycle: DEFAULT_CYCLE, dayExercises: {},
    } as never)
    await db.routineStore.put({
      id: 'meta:activeId', activeId: 'r1',
      createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z',
    } as never)
    await db.cycleVersions.put({
      id: 'cv1', scope: 'profile', version: 3, status: 'active',
      createdAt: '2026-09-01T10:00:00Z', effectiveFrom: '2026-09-01',
      cycle: DEFAULT_CYCLE,
    } as never)
    await db.sessionExercises.put({
      sessionExerciseId: 'se1', sessionId: 'ts1', exerciseId: 'press-nuevo',
      order: 0, planned: true, completed: true, status: 'REPLACED',
      plannedSetCount: 3, actualSetCount: 3, plannedSets: [],
      replacement: {
        replacementId: 'rep1', sessionId: 'ts1', sessionExerciseId: 'se1',
        originalExerciseId: 'press', replacementExerciseId: 'press-nuevo',
        reason: 'dolor', createdAt: '2026-09-10T10:00:00Z',
      },
      createdAt: '2026-09-10T10:00:00Z', updatedAt: '2026-09-10T10:00:00Z',
    } as never)
    await db.exercises.put({
      id: 'ex-006', name: 'Sentadilla', groupMain: 'cuadriceps', groupsSecondary: ['gluteos'],
      equipment: 'barra', level: 'intermedio', pattern: 'squat', description: '',
      instructions: [], variantIds: [], muscles: ['cuádriceps', 'glúteo'], restrictions: [], tags: [],
    } as never)
    for (let i = 0; i < 5; i++) {
      const date = `2026-09-${String(2 + i * 3).padStart(2, '0')}`
      await db.setRecords.put({
        setRecordId: `s${i}:set:1`, sessionId: `s${i}`, sessionExerciseId: `se${i}`,
        exerciseId: 'ex-006', order: 1, setType: 'NORMAL',
        plannedReps: 8, plannedWeight: 70 + i * 2, actualReps: 8, actualWeight: 70 + i * 2,
        status: 'COMPLETED', completedAt: `${date}T10:00:00Z`,
        createdAt: `${date}T10:00:00Z`, updatedAt: `${date}T10:00:00Z`,
      } as never)
    }
  }

  it('contexto reúne rutina, versión, sustituciones, mapa y patrones', async () => {
    await seedAll()
    const ctx = await buildTrainingContext('ex-006', 'Sentadilla')
    expect(ctx.rutina?.name).toBe('Rutina')
    expect(ctx.rutina?.version).toBe(2)
    expect(ctx.rutina?.planVersion).toBe(3)
    expect(ctx.sustituciones).toContain('press → press-nuevo')
    expect(ctx.mapaMuscular).toBeTruthy()
    expect(ctx.patterns && ctx.patterns.length > 0).toBe(true)
    // Sin datos → campos ausentes, no inventados
    await db.delete()
    await db.open()
    const empty = await buildTrainingContext('ex-006', 'Sentadilla')
    expect(empty.rutina).toBeUndefined()
    expect(empty.sustituciones).toBeUndefined()
    expect(empty.mapaMuscular).toBeUndefined()
    expect(empty.patterns).toBeUndefined()
  })

  it('flujo D: recovery → sueño → score → Coach lo refleja', async () => {
    await seedAll()
    const today = new Date().toISOString().slice(0, 10)
    await db.recoveryChecks.put({
      id: today, localDate: today, energy: 4, fatigue: 8, stress: 6,
      motivation: 5, score: 38, color: 'red', sleepHours: 5.5, sleepQuality: 4,
    } as never)
    const ctx = await buildTrainingContext('ex-006', 'Sentadilla')
    expect(ctx.recovery?.lastScore).toBe(38)
    expect(ctx.sueno).toBeTruthy()
  })

  it('prompt exige etiquetas Dato/Cálculo/Recomiendo/Opinión y no auto-acción', async () => {
    await seedAll()
    const ctx = await buildTrainingContext('ex-006', 'Sentadilla')
    const prompt = buildPrompt(ctx)
    expect(prompt).toContain('Dato:')
    expect(prompt).toContain('Cálculo:')
    expect(prompt).toContain('Te recomiendo:')
    expect(prompt).toContain('Mi opinión:')
    expect(prompt).toContain('Nunca modifiques rutinas')
    expect(prompt).toContain('Rutina activa: Rutina (v2), planificación v3')
    expect(prompt).toContain('press → press-nuevo')
  })
})
