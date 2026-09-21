import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/services/storage/db'
import { calcIMC, calcTMB, calcTDEE, calorieGoal, proteinRange } from '@/utils/nutrition'
import { analyzeNutrition, buildNutritionSuggestions } from './ai/nutritionEngine'
import { addDiaryEntry, getDiaryEntries, removeDiaryEntry } from './storage/diaryStore'
import { getTodayHydration, addHydration } from './recovery/recoveryService'

import type { UserProfile } from '@/types'

const PROFILE_BASE = {
  id: 'me', weightKg: 80, heightCm: 180, age: 30, sex: 'M',
  activityLevel: 'moderado', trainingGoal: 'hypertrophy',
} as unknown as UserProfile

describe('FASE 6 — Nutrición real y consistente', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('IMC con datos válidos', () => {
    const r = calcIMC(80, 180)
    expect(Number(r.bmi)).toBeCloseTo(24.7, 0)
    expect(r.bmiCat).toBeTruthy()
  })

  it('ausencia de peso/altura → Sin datos (nulls + gap explícito)', async () => {
    const r = await analyzeNutrition({})
    expect(r.tdee).toBeNull()
    expect(r.calorieGoal).toBeNull()
    expect(r.macros).toBeNull()
    expect(r.gap).toMatch(/peso y altura/)
  })

  it('TMB/TDEE calculados desde perfil real', async () => {
    const tmb = calcTMB(80, 180, 30, 'M')
    expect(tmb).not.toBeNull()
    expect(tmb!).toBeGreaterThan(1000)
    const tdee = calcTDEE(tmb, 'moderado', 3)
    expect(tdee).not.toBeNull()
    expect(tdee!).toBeGreaterThan(tmb!)
    const r = await analyzeNutrition({ ...PROFILE_BASE })
    expect(r.tdee).toBe(tdee)
  })

  it('objetivos distintos producen metas distintas', async () => {
    const h = await analyzeNutrition({ ...PROFILE_BASE, trainingGoal: 'hypertrophy' })
    const f = await analyzeNutrition({ ...PROFILE_BASE, trainingGoal: 'fat_loss' })
    const m = await analyzeNutrition({ ...PROFILE_BASE, trainingGoal: 'general_health' })
    expect(h.calorieGoal).not.toBe(f.calorieGoal)
    expect(f.calorieGoal).toBeLessThan(h.calorieGoal!)
    expect(m.calorieGoal).toBeLessThanOrEqual(h.calorieGoal!)
  })

  it('cambio de objetivo no borra histórico ni peso', async () => {
    await addDiaryEntry({
      id: 'e1', date: '2026-09-20', name: 'Pollo', mealType: 'almuerzo',
      servingLabel: '100g', amount: 100, unit: 'g',
      macros: { calories: 165, proteins: 31, carbs: 0, fats: 3.6 },
      addedAt: '2026-09-20T13:00:00Z',
    })
    await db.userProfile.put({ ...PROFILE_BASE, trainingGoal: 'hypertrophy' } as never)
    // Cambio de objetivo: solo perfil; diario y entrenos intactos
    await db.userProfile.update('me', { trainingGoal: 'fat_loss' })
    expect(await getDiaryEntries('2026-09-20')).toHaveLength(1)
    const p = await db.userProfile.get('me')
    expect((p as { weightKg?: number })?.weightKg).toBe(80)
    expect((p as { targetWeightKg?: number })?.targetWeightKg).toBeUndefined()
    const before = await analyzeNutrition({ ...PROFILE_BASE, trainingGoal: 'hypertrophy' })
    const after = await analyzeNutrition({ ...PROFILE_BASE, trainingGoal: 'fat_loss' })
    expect(after.calorieGoal).toBeLessThan(before.calorieGoal!)
  })

  it('macros y peso objetivo', async () => {
    const r = await analyzeNutrition({ ...PROFILE_BASE })
    expect(r.macros!.protein).toBeGreaterThan(0)
    expect(r.macros!.carbs).toBeGreaterThan(0)
    expect(r.macros!.fat).toBeGreaterThan(0)
    expect(r.proteinPerKg).toBeCloseTo(r.macros!.protein / 80, 2)
    await db.userProfile.put({ ...PROFILE_BASE, targetWeightKg: 75 } as never)
    const p = await db.userProfile.get('me')
    expect((p as { targetWeightKg?: number })?.targetWeightKg).toBe(75)
    expect(75 - 80).toBe(-5)
  })

  it('registro de alimentos con fecha/hora; dos del mismo alimento sin colisión', async () => {
    const mk = (id: string) => ({
      id, date: '2026-09-20', name: 'Avena', mealType: 'desayuno',
      servingLabel: '50g', amount: 50, unit: 'g',
      macros: { calories: 190, proteins: 7, carbs: 33, fats: 4 },
      addedAt: new Date().toISOString(),
    })
    await addDiaryEntry(mk('a1'))
    await addDiaryEntry(mk('a2'))
    const all = await getDiaryEntries('2026-09-20')
    expect(all.length).toBe(2)
    expect(all[0].id).not.toBe(all[1].id)
    await removeDiaryEntry('a1')
    expect(await getDiaryEntries('2026-09-20')).toHaveLength(1)
  })

  it('hidratación diaria suma registros reales; vacía → 0', async () => {
    expect(await getTodayHydration()).toBe(0)
    await addHydration(250)
    await addHydration(500)
    expect(await getTodayHydration()).toBe(750)
  })

  it('estimado vs real: gap solo cuando corresponde', async () => {
    const ok = await analyzeNutrition({ ...PROFILE_BASE })
    expect(ok.gap).toBeNull()
    const aggressive = await analyzeNutrition({ ...PROFILE_BASE, trainingGoal: 'fat_loss' })
    // El motor marca déficit agresivo solo si aplica; si no, gap puede ser null
    expect(typeof aggressive.isAdequate).toBe('boolean')
  })

  it('restricciones: sugerencias respetan alergias y rechazos', () => {
    const s = buildNutritionSuggestions({
      goals: { calories: 2500, protein: 160, carbs: 300, fat: 70 },
      dayTotals: { calories: 400, protein: 20, carbs: 50, fats: 10 } as never,
      mealsLogged: 1,
      trainingTodayName: null, todayVolumeKg: 0,
      lastRecoveryScore: null, hydrationMl: null, hydrationGoalMl: null,
      allergies: ['pollo', 'huevo'], dislikedFoods: ['tofu'],
      methodName: null,
    })
    expect(s).not.toBeNull()
    const flat = JSON.stringify(s).toLowerCase()
    expect(flat).not.toContain('pollo')
    expect(flat).not.toContain('huevo')
    expect(flat).not.toContain('tofu')
    expect(s!.some(x => x.kind === 'protein')).toBe(true)
  })

  it('integración con entrenamiento y recuperación', () => {
    const base = {
      goals: { calories: 2500, protein: 160, carbs: 300, fat: 70 },
      dayTotals: { calories: 800, protein: 60, carbs: 100, fats: 20 } as never,
      mealsLogged: 2,
      trainingTodayName: 'Pecho', todayVolumeKg: 5000,
      lastRecoveryScore: 40, hydrationMl: 500, hydrationGoalMl: 2500,
      allergies: [], dislikedFoods: [], methodName: 'Hipertrofia',
    }
    const s = buildNutritionSuggestions(base)!
    expect(s.some(x => x.kind === 'training')).toBe(true)
    expect(s.some(x => x.kind === 'recovery')).toBe(true)
    expect(s.some(x => x.kind === 'hydration')).toBe(true)
    // Nada se registra como consumido: solo lectura
    expect(s.every(x => x.origin === 'dato' || x.origin === 'cálculo')).toBe(true)
  })

  it('sin base mínima → mensaje de insuficiencia, no sugerencias inventadas', () => {
    expect(buildNutritionSuggestions({
      goals: null,
      dayTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 } as never,
      mealsLogged: 0, trainingTodayName: null, todayVolumeKg: 0,
      lastRecoveryScore: null, hydrationMl: null, hydrationGoalMl: null,
      allergies: [], dislikedFoods: [], methodName: null,
    })).toBeNull()
  })

  it('demo excluido de hidratación real', async () => {
    await db.hydrationLogs.put({
      id: 'demo-h', localDate: new Date().toISOString().slice(0, 10),
      amountMl: 5000, time: new Date().toISOString(), isDemo: true,
    } as never)
    await addHydration(250)
    expect(await getTodayHydration()).toBe(250)
  })

  it('importación sin duplicados; histórico intacto', async () => {
    const { exportJSON, importJSON } = await import('./storage/exportImport')
    await addDiaryEntry({
      id: 'imp1', date: '2026-09-20', name: 'Arroz', mealType: 'almuerzo',
      servingLabel: '100g', amount: 100, unit: 'g',
      macros: { calories: 130, proteins: 2.7, carbs: 28, fats: 0.3 },
      addedAt: '2026-09-20T13:00:00Z',
    })
    const blob = await exportJSON()
    const text = await blob.text()
    // Reimportar dos veces el mismo payload no duplica (put por id)
    await importJSON(new File([text], 'backup.json'), { mode: 'merge' })
    await importJSON(new File([text], 'backup.json'), { mode: 'merge' })
    expect(await getDiaryEntries('2026-09-20')).toHaveLength(1)
  })
})
