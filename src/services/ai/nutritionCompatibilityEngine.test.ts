import { describe, it, expect } from 'vitest'
import { checkNutritionCompatibility, checkGroupNutritionCompatibility } from './nutritionCompatibilityEngine'
import type { NutritionMethodId } from './nutritionMethods'

describe('nutritionCompatibilityEngine', () => {
  it('returns compatible for mediterranean + high_protein', () => {
    const result = checkNutritionCompatibility('mediterranean', 'high_protein')
    expect(result.compatible).toBe(true)
    expect(result.interference).toBe('none')
  })

  it('returns compatible for mediterranean + around_training', () => {
    const result = checkNutritionCompatibility('mediterranean', 'around_training')
    expect(result.compatible).toBe(true)
  })

  it('returns compatible for flexitarian + high_protein', () => {
    const result = checkNutritionCompatibility('flexitarian', 'high_protein')
    expect(result.compatible).toBe(true)
  })

  it('returns incompatible for keto + carb_cycling', () => {
    const result = checkNutritionCompatibility('keto', 'carb_cycling')
    expect(result.compatible).toBe(false)
    expect(result.interference).toBe('high')
  })

  it('returns incompatible for whole30 + intermittent_fasting', () => {
    const result = checkNutritionCompatibility('whole30', 'intermittent_fasting')
    expect(result.compatible).toBe(false)
    expect(result.interference).toBe('high')
  })

  it('returns compatible for vegan + high_protein with low interference', () => {
    const result = checkNutritionCompatibility('vegan', 'high_protein')
    expect(result.compatible).toBe(true)
    expect(result.interference).toBe('low')
  })

  it('returns compatible for IF + around_training', () => {
    const result = checkNutritionCompatibility('intermittent_fasting', 'around_training')
    expect(result.compatible).toBe(true)
  })

  it('handles symmetric compatibility', () => {
    const ab = checkNutritionCompatibility('mediterranean', 'high_protein')
    const ba = checkNutritionCompatibility('high_protein', 'mediterranean')
    expect(ab.compatible).toBe(ba.compatible)
    expect(ab.interference).toBe(ba.interference)
  })

  it('group compatibility: compatible group returns true', () => {
    const result = checkGroupNutritionCompatibility(['mediterranean', 'high_protein', 'around_training'])
    expect(result.compatible).toBe(true)
  })

  it('group compatibility: conflicting group returns recommendations', () => {
    const result = checkGroupNutritionCompatibility(['keto', 'carb_cycling'])
    expect(result.recommendations.length).toBeGreaterThan(0)
  })

  it('returns fallback for unknown methods', () => {
    const result = checkNutritionCompatibility('unknown_method' as NutritionMethodId, 'mediterranean')
    expect(result).toBeDefined()
    expect(typeof result.compatible).toBe('boolean')
  })

  it('single method group is compatible', () => {
    const result = checkGroupNutritionCompatibility(['mediterranean'])
    expect(result.compatible).toBe(true)
    expect(result.totalInterference).toBe(0)
  })
})
