import { describe, it, expect } from 'vitest'
import { createMixedNutritionMethod } from './mixedNutritionBuilder'
import type { NutritionUserProfile } from './nutritionMethods'

const profile: NutritionUserProfile = {
  weightKg: 80,
  heightCm: 180,
  age: 25,
  sex: 'M',
  trainingGoal: 'hypertrophy',
  experienceLevel: 'intermediate',
  daysPerWeek: 4,
  activityLevel: 'muy_activo',
}

describe('mixedNutritionBuilder', () => {
  it('creates a mixed method with primary component', () => {
    const result = createMixedNutritionMethod('mediterranean', ['high_protein'], [], 'hypertrophy', 'hypertrophy', profile, 'Test justification')
    expect(result).toBeDefined()
    expect(result.components.length).toBeGreaterThanOrEqual(1)
    expect(result.components[0].methodId).toBe('mediterranean')
    expect(result.components[0].weight).toBeGreaterThan(0)
  })

  it('includes secondary components when provided', () => {
    const result = createMixedNutritionMethod('flexitarian', ['high_protein', 'around_training'], [], 'fat_loss', 'mixed', profile, 'Test')
    expect(result.components.length).toBeGreaterThanOrEqual(2)
    const methods = result.components.map(c => c.methodId)
    expect(methods).toContain('high_protein')
  })

  it('includes complementary components', () => {
    const result = createMixedNutritionMethod('mediterranean', ['high_protein'], ['carb_cycling'], 'hypertrophy', 'strength', profile, 'Test')
    expect(result.components.length).toBeGreaterThanOrEqual(2)
    const methods = result.components.map(c => c.methodId)
    expect(methods).toContain('carb_cycling')
  })

  it('normalizes weights to sum to ~1', () => {
    const result = createMixedNutritionMethod('mediterranean', ['high_protein', 'around_training'], ['carb_cycling'], 'hypertrophy', 'hypertrophy', profile, 'Test')
    const totalWeight = result.components.reduce((a, c) => a + c.weight, 0)
    expect(totalWeight).toBeCloseTo(1.0, 1)
  })

  it('has strategy with reasonable defaults', () => {
    const result = createMixedNutritionMethod('mediterranean', ['high_protein'], [], 'hypertrophy', 'hypertrophy', profile, 'Test')
    expect(result.strategy.proteinPerKg[0]).toBeGreaterThan(0)
    expect(result.strategy.calorieModifier).toBeGreaterThan(0)
    expect(result.strategy.mealFrequency[0]).toBeGreaterThan(0)
  })

  it('justification is included', () => {
    const result = createMixedNutritionMethod('mediterranean', ['high_protein'], [], 'hypertrophy', 'hypertrophy', profile, 'My justification text')
    expect(result.justification).toBe('My justification text')
  })

  it('has phase set to one of the valid phases', () => {
    const result = createMixedNutritionMethod('mediterranean', ['high_protein'], [], 'hypertrophy', 'hypertrophy', profile, 'Test')
    expect(['initial', 'adaptation', 'adjustment', 'maintenance']).toContain(result.phase)
  })

  it('is marked as dynamic', () => {
    const result = createMixedNutritionMethod('mediterranean', ['high_protein'], [], 'hypertrophy', 'hypertrophy', profile, 'Test')
    expect(result.dynamic).toBe(true)
  })

  it('has createdAt and updatedAt timestamps', () => {
    const result = createMixedNutritionMethod('mediterranean', ['high_protein'], [], 'hypertrophy', 'hypertrophy', profile, 'Test')
    expect(result.createdAt).toBeDefined()
    expect(result.updatedAt).toBeDefined()
  })

  it('key principles are extracted', () => {
    const result = createMixedNutritionMethod('mediterranean', ['high_protein'], [], 'hypertrophy', 'hypertrophy', profile, 'Test')
    expect(result.strategy.keyPrinciples.length).toBeGreaterThan(0)
  })

  it('works with no secondary or complementary', () => {
    const result = createMixedNutritionMethod('mediterranean', [], [], 'health', 'general', profile, 'Test')
    expect(result.components.length).toBeGreaterThanOrEqual(1)
    expect(result.components[0].methodId).toBe('mediterranean')
  })
})
