import { describe, it, expect, beforeEach } from 'vitest'
import { recordAdherence, getAdherenceTrend, detectAdherenceProblems, calculateAutomaticAdherence, getAdherenceSummary } from './adherenceTracker'
import type { NutritionUserProfile, NutritionMethodId } from './nutritionMethods'

const baseProfile: NutritionUserProfile = {
  weightKg: 75,
  heightCm: 178,
  age: 28,
  sex: 'M',
  trainingGoal: 'hypertrophy',
  experienceLevel: 'intermediate',
}

// Use real method IDs for tests that need valid types
const TEST_METHOD_A: NutritionMethodId = 'mediterranean'
const TEST_METHOD_B: NutritionMethodId = 'whole30'
const TEST_METHOD_C: NutritionMethodId = 'dash'
const TEST_METHOD_D: NutritionMethodId = 'high_protein'
const TEST_METHOD_E: NutritionMethodId = 'flexitarian'

describe('adherenceTracker', () => {
  beforeEach(() => {
    localStorage.removeItem('nutrition:adherence')
  })

  describe('recordAdherence', () => {
    it('creates a record with correct fields', () => {
      const record = recordAdherence({
        methodId: TEST_METHOD_A,
        score: 8,
        mealsLogged: 4,
        mealsExpected: 4,
        calorieAdherence: 90,
        proteinAdherence: 85,
      })
      expect(record.methodId).toBe(TEST_METHOD_A)
      expect(record.score).toBe(8)
      expect(record.mealsLogged).toBe(4)
      expect(record.calorieAdherence).toBe(90)
      expect(record.daysOnMethod).toBe(1)
      expect(record.id).toContain(TEST_METHOD_A)
    })

    it('clamps score to 0-10', () => {
      const high = recordAdherence({ methodId: TEST_METHOD_A, score: 15, mealsLogged: 4, mealsExpected: 4, calorieAdherence: 90, proteinAdherence: 85 })
      expect(high.score).toBe(10)
      const low = recordAdherence({ methodId: TEST_METHOD_A, score: -5, mealsLogged: 4, mealsExpected: 4, calorieAdherence: 90, proteinAdherence: 85 })
      expect(low.score).toBe(0)
    })

    it('persists to localStorage', () => {
      recordAdherence({ methodId: TEST_METHOD_A, score: 7, mealsLogged: 3, mealsExpected: 4, calorieAdherence: 80, proteinAdherence: 75 })
      const stored = JSON.parse(localStorage.getItem('nutrition:adherence') || '[]')
      expect(stored.length).toBe(1)
      expect(stored[0].methodId).toBe(TEST_METHOD_A)
    })
  })

  describe('getAdherenceTrend', () => {
    it('returns zero trend for no records', () => {
      const trend = getAdherenceTrend(TEST_METHOD_A)
      expect(trend.averageScore).toBe(0)
      expect(trend.records.length).toBe(0)
      expect(trend.trend).toBe('stable')
    })

    it('calculates average score correctly', () => {
      recordAdherence({ methodId: TEST_METHOD_C, score: 8, mealsLogged: 4, mealsExpected: 4, calorieAdherence: 90, proteinAdherence: 85 })
      recordAdherence({ methodId: TEST_METHOD_C, score: 6, mealsLogged: 3, mealsExpected: 4, calorieAdherence: 75, proteinAdherence: 70 })
      const trend = getAdherenceTrend(TEST_METHOD_C)
      expect(trend.averageScore).toBe(7)
    })

    it('detects declining trend', () => {
      for (let i = 0; i < 6; i++) {
        recordAdherence({
          methodId: TEST_METHOD_D,
          score: 9 - i,
          mealsLogged: 4,
          mealsExpected: 4,
          calorieAdherence: 90 - i * 5,
          proteinAdherence: 85 - i * 5,
        })
      }
      const trend = getAdherenceTrend(TEST_METHOD_D)
      expect(trend.trend).toBe('declining')
    })
  })

  describe('detectAdherenceProblems', () => {
    it('returns null for insufficient data', () => {
      const result = detectAdherenceProblems(TEST_METHOD_A, baseProfile)
      expect(result).toBeNull()
    })

    it('detects declining trend (consecutiveDeclining >= 4)', () => {
      for (let i = 0; i < 5; i++) {
        recordAdherence({
          methodId: TEST_METHOD_B,
          score: 9 - i,
          mealsLogged: 4,
          mealsExpected: 4,
          calorieAdherence: 90 - i * 10,
          proteinAdherence: 85 - i * 10,
        })
      }
      const result = detectAdherenceProblems(TEST_METHOD_B, baseProfile)
      expect(result).not.toBeNull()
      expect(result!.type).toBe('adjust')
      expect(result!.severity).toBe('medium')
    })

    it('returns null for good adherence', () => {
      for (let i = 0; i < 5; i++) {
        recordAdherence({
          methodId: TEST_METHOD_A,
          score: 9,
          mealsLogged: 4,
          mealsExpected: 4,
          calorieAdherence: 95,
          proteinAdherence: 90,
        })
      }
      const result = detectAdherenceProblems(TEST_METHOD_A, baseProfile)
      expect(result).toBeNull()
    })

    it('detects low calorie/protein adherence', () => {
      for (let i = 0; i < 5; i++) {
        recordAdherence({
          methodId: TEST_METHOD_E,
          score: 6,
          mealsLogged: 3,
          mealsExpected: 4,
          calorieAdherence: 45,
          proteinAdherence: 40,
        })
      }
      const result = detectAdherenceProblems(TEST_METHOD_E, baseProfile)
      expect(result).not.toBeNull()
      expect(result!.type).toBe('adjust')
    })
  })

  describe('calculateAutomaticAdherence', () => {
    it('returns 10 for perfect adherence', () => {
      const score = calculateAutomaticAdherence(TEST_METHOD_A, 4, 2500, 150, 2500, 150)
      expect(score).toBe(10)
    })

    it('returns lower score for missing meals', () => {
      const score = calculateAutomaticAdherence(TEST_METHOD_A, 2, 2500, 150, 2500, 150)
      expect(score).toBeLessThan(10)
    })

    it('returns lower score for low calories', () => {
      const score = calculateAutomaticAdherence(TEST_METHOD_A, 4, 1500, 150, 2500, 150)
      expect(score).toBeLessThan(10)
    })

    it('clamps to 0-10', () => {
      const score = calculateAutomaticAdherence(TEST_METHOD_A, 0, 0, 0, 2500, 150)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(10)
    })
  })

  describe('getAdherenceSummary', () => {
    it('returns zero summary for no data', () => {
      const summary = getAdherenceSummary(baseProfile)
      expect(summary.overallScore).toBe(0)
      expect(summary.bestMethod).toBeNull()
      expect(summary.recommendations.length).toBeGreaterThan(0)
    })

    it('identifies best and worst methods with valid IDs', () => {
      for (let i = 0; i < 5; i++) {
        recordAdherence({ methodId: TEST_METHOD_A, score: 9, mealsLogged: 4, mealsExpected: 4, calorieAdherence: 95, proteinAdherence: 90 })
      }
      for (let i = 0; i < 5; i++) {
        recordAdherence({ methodId: TEST_METHOD_B, score: 3, mealsLogged: 2, mealsExpected: 5, calorieAdherence: 40, proteinAdherence: 50 })
      }
      const summary = getAdherenceSummary(baseProfile)
      expect(summary.bestMethod).toBe(TEST_METHOD_A)
      expect(summary.worstMethod).toBe(TEST_METHOD_B)
    })
  })
})
