import { describe, it, expect } from 'vitest'
import { buildCycleFromProfile, buildCycleFromRecommendation, buildCycleFromMethod } from '@/utils/cycle'
import { selectMethods } from './methodSelector'
import { getMethod } from './trainingMethodsDB'
import type { TrainingMethodId } from './trainingMethods'

describe('Full pipeline: profile -> method -> cycle', () => {
  it('hypertrophy intermediate 3 days -> cycle with correct split', () => {
    const profile = {
      trainingGoal: 'hypertrophy',
      experienceLevel: 'intermediate',
      sessionDurationMin: 60,
      schedule: { availableDays: [1, 3, 5] },
    }
    const rec = selectMethods(profile as any)
    expect(rec.primary).toBeTruthy()
    expect(rec.confidence).toBeGreaterThan(0.3)

    const cycle = buildCycleFromRecommendation(rec, [1, 3, 5])
    expect(cycle.methodId).toBeTruthy()
    expect(cycle.trainingDays.length).toBe(3)
    expect(cycle.methodJustification).toBeTruthy()

    const method = getMethod(cycle.methodId as TrainingMethodId)
    expect(method).toBeDefined()
    expect(method?.defaults.setsPerExercise).toBeGreaterThan(0)
  })

  it('strength advanced 4 days -> cycle with upper_lower', () => {
    const profile = {
      trainingGoal: 'strength',
      experienceLevel: 'advanced',
      sessionDurationMin: 90,
      schedule: { availableDays: [1, 2, 4, 5] },
    }
    const cycle = buildCycleFromProfile(profile as any, [1, 2, 4, 5])
    expect(cycle.methodId).toBeTruthy()
    expect(cycle.trainingDays.length).toBe(4)
    const method = getMethod(cycle.methodId as TrainingMethodId)
    expect(method?.structure.splitType).toMatch(/upper_lower|push_pull|body_part/)
  })

  it('method defaults are used in Rutina getMethodDefaults pattern', () => {
    const profile = {
      trainingGoal: 'strength',
      experienceLevel: 'advanced',
      sessionDurationMin: 90,
      schedule: { availableDays: [1, 3, 5] },
    }
    const cycle = buildCycleFromProfile(profile as any, [1, 3, 5])
    const method = getMethod(cycle.methodId as TrainingMethodId)
    expect(method?.defaults.setsPerExercise).toBeGreaterThanOrEqual(3)
    expect(method?.defaults.repsRange[0]).toBeLessThan(method?.defaults.repsRange[1] ?? 0)
    expect(method?.defaults.restSeconds).toBeGreaterThan(60)
  })

  it('method rest seconds used in Entrenar pattern', () => {
    const method = getMethod('strength')
    expect(method?.defaults.restSeconds).toBeGreaterThanOrEqual(120)
    const methodHyp = getMethod('hypertrophy')
    expect(methodHyp?.defaults.restSeconds).toBeLessThanOrEqual(120)
  })

  it('unknown method falls back to defaults', () => {
    const cycle = buildCycleFromMethod('unknown' as TrainingMethodId)
    expect(cycle.trainingDays.length).toBe(4) // DEFAULT_CYCLE
    expect(cycle.methodId).toBeUndefined()
  })

  it('method compatibility check works end-to-end', async () => {
    const { checkCompatibility } = await import('./compatibilityEngine')
    const compat = checkCompatibility('strength', 'mobility')
    expect(compat.compatible).toBe(true)
    expect(compat.interference).toBe('none')
  })
})
