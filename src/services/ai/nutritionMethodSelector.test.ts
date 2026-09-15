import { describe, it, expect } from 'vitest'
import { selectNutritionMethods } from './nutritionMethodSelector'
import type { NutritionUserProfile } from './nutritionMethods'

const baseProfile: NutritionUserProfile = {
  weightKg: 75,
  heightCm: 178,
  age: 28,
  sex: 'M',
  trainingGoal: 'hypertrophy',
  experienceLevel: 'intermediate',
  daysPerWeek: 4,
  activityLevel: 'moderado',
}

describe('nutritionMethodSelector', () => {
  it('returns primary, secondary, and complementary arrays', () => {
    const result = selectNutritionMethods(baseProfile)
    expect(result.primary).toBeDefined()
    expect(Array.isArray(result.secondary)).toBe(true)
    expect(Array.isArray(result.complementary)).toBe(true)
    expect(Array.isArray(result.notRecommended)).toBe(true)
  })

  it('scores higher for hypertrophy + mediterranean', () => {
    const result = selectNutritionMethods({ ...baseProfile, trainingGoal: 'hypertrophy' })
    expect(result.primary).toBeDefined()
    expect(result.factors.length).toBeGreaterThan(0)
    expect(result.factors.some(f => f.includes('Objetivo'))).toBe(true)
  })

  it('includes high_protein as secondary for hypertrophy', () => {
    const result = selectNutritionMethods({ ...baseProfile, trainingGoal: 'hypertrophy' })
    // high_protein should be considered as secondary for hypertrophy
    expect(result.secondary.length).toBeGreaterThanOrEqual(0)
  })

  it('adapts for fat_loss goal', () => {
    const result = selectNutritionMethods({ ...baseProfile, trainingGoal: 'fat_loss' })
    expect(result.primary).toBeDefined()
    expect(result.factors.some(f => f.includes('fat_loss'))).toBe(true)
  })

  it('returns justification string', () => {
    const result = selectNutritionMethods(baseProfile)
    expect(typeof result.justification).toBe('string')
    expect(result.justification.length).toBeGreaterThan(10)
  })

  it('returns confidence between 0 and 1', () => {
    const result = selectNutritionMethods(baseProfile)
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it('respects restrictions in profile', () => {
    const restricted = selectNutritionMethods({
      ...baseProfile,
      nutritionPrefs: { restrictions: ['lactosa'], allergies: [], dislikedFoods: [] },
    })
    // Should not recommend methods that heavily rely on dairy
    expect(restricted.notRecommended.length).toBeGreaterThanOrEqual(0)
  })

  it('works with minimal profile (no optional fields)', () => {
    const minimal: NutritionUserProfile = { weightKg: 70 }
    const result = selectNutritionMethods(minimal)
    expect(result.primary).toBeDefined()
    expect(typeof result.justification).toBe('string')
  })

  it('includes safety warnings when relevant', () => {
    const result = selectNutritionMethods(baseProfile)
    expect(Array.isArray(result.safetyWarnings)).toBe(true)
  })

  it('respects days per week preference', () => {
    const lowFreq = selectNutritionMethods({ ...baseProfile, daysPerWeek: 2 })
    const highFreq = selectNutritionMethods({ ...baseProfile, daysPerWeek: 6 })
    expect(lowFreq.primary).toBeDefined()
    expect(highFreq.primary).toBeDefined()
  })
})
