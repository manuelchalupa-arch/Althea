import { describe, it, expect } from 'vitest'
import { buildCycleFromMethod, buildCycleFromRecommendation, buildCycleFromProfile, getCycleFromProfile, getTrainingDayForDate, DEFAULT_CYCLE } from './cycle'
import type { TrainingMethodId } from '@/services/ai/trainingMethods'

describe('buildCycleFromMethod', () => {
  it('generates a 4-day cycle for strength', () => {
    const cycle = buildCycleFromMethod('strength')
    expect(cycle.methodId).toBe('strength')
    expect(cycle.trainingDays.length).toBeGreaterThanOrEqual(3)
    expect(cycle.trainingDays.length).toBeLessThanOrEqual(4)
    expect(cycle.weekMap.some(d => d !== null)).toBe(true)
  })

  it('generates 3-day cycle for hypertrophy', () => {
    const cycle = buildCycleFromMethod('hypertrophy')
    expect(cycle.methodId).toBe('hypertrophy')
    expect(cycle.trainingDays.length).toBeGreaterThanOrEqual(3)
  })

  it('generates a 2-day cycle for mobility', () => {
    const cycle = buildCycleFromMethod('mobility', [1, 4])
    expect(cycle.methodId).toBe('mobility')
    expect(cycle.trainingDays.length).toBe(2)
  })

  it('returns DEFAULT_CYCLE for unknown method', () => {
    const cycle = buildCycleFromMethod('unknown' as TrainingMethodId)
    expect(cycle.methodId).toBeUndefined()
    expect(cycle.trainingDays).toEqual(DEFAULT_CYCLE.trainingDays)
  })

  it('sets methodJustification', () => {
    const cycle = buildCycleFromMethod('strength')
    expect(cycle.methodJustification).toBeTruthy()
    expect(typeof cycle.methodJustification).toBe('string')
  })

  it('respects custom availableDays', () => {
    const cycle = buildCycleFromMethod('strength', [1, 3, 5])
    expect(cycle.weekMap[1]).toBe(1) // Monday = day 1
    expect(cycle.weekMap[3]).toBe(2) // Wednesday = day 2
    expect(cycle.weekMap[5]).toBe(3) // Friday = day 3
    expect(cycle.weekMap[2]).toBeNull() // Tuesday = rest
  })
})

describe('buildCycleFromRecommendation', () => {
  it('builds cycle from recommendation primary method', () => {
    const cycle = buildCycleFromRecommendation({
      primary: 'hypertrophy',
      justification: 'Test justification',
    })
    expect(cycle.methodId).toBe('hypertrophy')
    expect(cycle.trainingDays.length).toBeGreaterThanOrEqual(3)
  })
})

describe('buildCycleFromProfile', () => {
  it('builds cycle from profile with hypertrophy goal', () => {
    const profile = {
      trainingGoal: 'hypertrophy',
      experienceLevel: 'intermediate',
      sessionDurationMin: 60,
      schedule: { availableDays: [1, 3, 5] },
    }
    const cycle = buildCycleFromProfile(profile as any)
    expect(cycle.methodId).toBeTruthy()
    expect(cycle.trainingDays.length).toBe(3)
    expect(cycle.weekMap[1]).toBe(1)
    expect(cycle.weekMap[3]).toBe(2)
    expect(cycle.weekMap[5]).toBe(3)
  })

  it('builds cycle from profile with strength goal 4 days', () => {
    const profile = {
      trainingGoal: 'strength',
      experienceLevel: 'advanced',
      sessionDurationMin: 90,
      schedule: { availableDays: [1, 2, 4, 5] },
    }
    const cycle = buildCycleFromProfile(profile as any)
    expect(cycle.methodId).toBeTruthy()
    expect(cycle.trainingDays.length).toBe(4)
  })
})

describe('getCycleFromProfile', () => {
  it('returns DEFAULT_CYCLE when no cycle in profile', () => {
    const cycle = getCycleFromProfile(null)
    expect(cycle).toEqual(DEFAULT_CYCLE)
  })

  it('returns profile cycle when present', () => {
    const custom = { ...DEFAULT_CYCLE, methodId: 'strength' as TrainingMethodId }
    const cycle = getCycleFromProfile({ cycle: custom } as any)
    expect(cycle.methodId).toBe('strength')
  })
})

describe('getTrainingDayForDate', () => {
  it('returns correct day for Monday', () => {
    const result = getTrainingDayForDate('2026-09-14', DEFAULT_CYCLE) // Monday
    expect(result.isRest).toBe(false)
    expect(result.n).toBe(1)
    expect(result.name).toBe('Pecho + tríceps')
  })

  it('returns rest for Sunday', () => {
    const result = getTrainingDayForDate('2026-09-13', DEFAULT_CYCLE) // Sunday
    expect(result.isRest).toBe(true)
    expect(result.n).toBeNull()
  })
})
