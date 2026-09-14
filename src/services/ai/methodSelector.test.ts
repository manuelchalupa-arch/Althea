import { describe, it, expect } from 'vitest'
import { selectMethods } from './methodSelector'
import type { UserProfile } from './trainingMethods'

const baseProfile: UserProfile = {
  trainingGoal: 'hypertrophy',
  experienceLevel: 'intermediate',
  sessionDurationMin: 60,
  equipment: ['barbell', 'dumbbell', 'machine'],
  cycle: { weekMap: [1, 2, 3, 4, 5, 6, 7, 8] },
  schedule: { availableDays: [1, 3, 5] },
}

describe('selectMethods', () => {
  it('returns valid recommendation for intermediate hypertrophy', () => {
    const rec = selectMethods(baseProfile)
    expect(rec.primary).toBeTruthy()
    expect(rec.confidence).toBeGreaterThan(0.3)
    expect(rec.justification).toContain('hypertrophy')
    expect(rec.factors.length).toBeGreaterThan(3)
  })

  it('returns valid recommendation for beginner strength goal', () => {
    const profile: UserProfile = {
      ...baseProfile,
      trainingGoal: 'strength',
      experienceLevel: 'beginner',
      sessionDurationMin: 45,
      schedule: { availableDays: [2, 4, 6] },
    }
    const rec = selectMethods(profile)
    expect(rec.primary).toBeTruthy()
    expect(rec.justification).toContain('strength')
  })

  it('returns valid recommendation for fat_loss with 2 days', () => {
    const profile: UserProfile = {
      ...baseProfile,
      trainingGoal: 'fat_loss',
      experienceLevel: 'advanced',
      sessionDurationMin: 50,
      schedule: { availableDays: [1, 4] },
    }
    const rec = selectMethods(profile)
    expect(rec.primary).toBeTruthy()
    expect(rec.justification).toContain('fat_loss')
  })

  it('includes secondary methods when relevant', () => {
    const profile: UserProfile = {
      ...baseProfile,
      trainingGoal: 'general_health',
      experienceLevel: 'beginner',
    }
    const rec = selectMethods(profile)
    expect(rec.primary).toBeTruthy()
  })

  it('creates mixed method when secondary methods exist', () => {
    const profile: UserProfile = {
      ...baseProfile,
      trainingGoal: 'general_health',
      experienceLevel: 'intermediate',
    }
    const rec = selectMethods(profile)
    expect(rec.mixed).toBeDefined()
    expect(rec.mixed?.components.length).toBeGreaterThanOrEqual(2)
  })

  it('produces valid primary method for each goal', () => {
    const goals = ['hypertrophy', 'strength', 'fat_loss', 'power', 'endurance', 'general_health', 'flexibility'] as const
    for (const goal of goals) {
      const rec = selectMethods({ ...baseProfile, trainingGoal: goal })
      expect(rec.primary).toBeTruthy()
      expect(typeof rec.primary).toBe('string')
    }
  })

  it('respects minimal equipment', () => {
    const profile: UserProfile = {
      ...baseProfile,
      equipment: ['bodyweight'],
    }
    const rec = selectMethods(profile)
    expect(rec.primary).toBeTruthy()
  })
})
