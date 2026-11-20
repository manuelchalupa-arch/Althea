import { describe, it, expect, beforeEach } from 'vitest'
import {
  activityLevelFor,
  computeNutritionPlan,
  mifflinStJeor,
  suggestedActivityAdjustment,
  type NutritionInputs,
} from './goalEngine'

const base: NutritionInputs = {
  age: 30,
  sex: 'M',
  weightKg: 80,
  heightCm: 180,
  goal: 'maintain',
  dailyActivity: 'moderate',
  physicalActivity: { types: ['strength'], daysPerWeek: 4, minutesPerSession: 60, intensity: 'medium' },
}

const planOf = (patch: Partial<NutritionInputs> = {}) => {
  const r = computeNutritionPlan({ ...base, ...patch })
  if (!r.plan) {throw new Error('Se esperaba un plan')}
  return r.plan
}

describe('Nutrición — motor de objetivos', () => {
  it('Mifflin-St Jeor usa +5 (M) y −161 (F); X devuelve intervalo sin elegir categoría', () => {
    const m = mifflinStJeor(80, 180, 30, 'M')
    const f = mifflinStJeor(80, 180, 30, 'F')
    const x = mifflinStJeor(80, 180, 30, 'X')
    expect(Math.round(m.reference)).toBe(1780)
    expect(Math.round(f.reference)).toBe(1614)
    expect(x.low).toBe(f.reference)
    expect(x.high).toBe(m.reference)
    expect(x.reference).toBe((m.reference + f.reference) / 2)
    expect(x.formula).toContain('intervalo')
  })

  it('el gasto total aplica el factor de actividad y el TDEE es mayor que la TMB', () => {
    const plan = planOf()
    expect(plan.tdee.reference).toBeGreaterThan(plan.bmr.reference)
    expect(plan.tdee.factor).toBe(activityLevelFor('moderate', base.physicalActivity).factor)
    expect(plan.target.reference).toBe(plan.tdee.reference) // mantener no ajusta
  })

  it('macros: proteína 1,4–2,0 g/kg, grasas 20–35 % y suma calórica coherente', () => {
    for (const goal of ['gain', 'lose', 'maintain'] as const) {
      const plan = planOf({ goal })
      expect(plan.macros.proteinPerKg).toBeGreaterThanOrEqual(1.4)
      expect(plan.macros.proteinPerKg).toBeLessThanOrEqual(2.0)
      expect(plan.macros.protein).toBe(Math.round(80 * plan.macros.proteinPerKg))
      expect(plan.macros.fatPct).toBeGreaterThanOrEqual(20)
      expect(plan.macros.fatPct).toBeLessThanOrEqual(35)
      expect(Math.abs(plan.macros.kcalSum - plan.target.reference)).toBeLessThanOrEqual(4 * 3 + 9 + 4)
    }
  })

  it('los ajustes por objetivo son moderados y nunca bajan del gasto en reposo', () => {
    const gain = planOf({ goal: 'gain' })
    const lose = planOf({ goal: 'lose' })
    const maintain = planOf({ goal: 'maintain' })
    expect(gain.target.reference).toBeGreaterThan(maintain.target.reference)
    expect(lose.target.reference).toBeLessThan(maintain.target.reference)
    expect(lose.target.reference).toBeGreaterThanOrEqual(lose.bmr.reference)
    expect(gain.target.adjustmentPct).toBe(10)
    expect(lose.target.adjustmentPct).toBe(-15)
  })

  it('con sexo X muestra objetivos como intervalo, no como valor único', () => {
    const plan = planOf({ sex: 'X' })
    expect(plan.target.low).toBeLessThan(plan.target.high)
    expect(plan.notes.join(' ')).toContain('Sexo no especificado')
  })

  it('la falta de datos se informa y no inventa un plan', () => {
    const r = computeNutritionPlan({ ...base, weightKg: null, heightCm: null })
    expect(r.plan).toBeNull()
    expect(r.missing).toEqual(expect.arrayContaining(['peso', 'altura']))
  })

  it('bloquea y deriva en menores, embarazo, TCA, enfermedad o medicación', () => {
    const cases = ['minor', 'pregnancy', 'eatingDisorder', 'illness', 'medication'] as const
    for (const key of cases) {
      const r = computeNutritionPlan({ ...base, riskFlags: { [key]: true } })
      expect(r.plan).toBeNull()
      expect(r.blocked?.reasons.length).toBe(1)
      expect(r.blocked?.referral).toContain('Nutricionista')
    }
    const minorByAge = computeNutritionPlan({ ...base, age: 17 })
    expect(minorByAge.plan).not.toBeNull() // la edad sola no bloquea: lo decide riskFlags
  })

  it('el ajuste por actividad acredita la mitad, con tope, y no modifica la meta base', () => {
    const plan = planOf()
    const extras = [
      { id: 'a', label: 'Running', date: '2026-11-18', durationMinutes: 60, activeKcal: 600, method: 'MET', estimated: true },
    ]
    const adj = suggestedActivityAdjustment(plan, extras, '2026-11-18')
    expect(adj).not.toBeNull()
    expect(adj!.baseKcal).toBe(plan.target.reference)
    expect(adj!.adjustmentKcal).toBeLessThanOrEqual(Math.round(600 * 0.5))
    expect(adj!.adjustmentKcal).toBeLessThanOrEqual(Math.round(plan.target.reference * 0.15))
    expect(adj!.adjustmentKcal).toBeGreaterThanOrEqual(80)
    // La meta base del plan sigue intacta.
    expect(plan.target.reference).toBe(planOf().target.reference)
    // Sesiones cortas o de otro día no generan crédito.
    expect(suggestedActivityAdjustment(plan, extras, '2026-11-19')).toBeNull()
    expect(suggestedActivityAdjustment(plan, [{ ...extras[0], durationMinutes: 5 }], '2026-11-18')).toBeNull()
  })
})

describe('Nutrición — persistencia del plan', () => {
  beforeEach(async () => {
    const { db } = await import('@/services/storage/db')
    await db.userProfile.clear().catch(() => null)
    await db.nutritionDiary.clear().catch(() => null)
  })

  it('guarda el plan en el perfil con historial y no borra comidas', async () => {
    const { db } = await import('@/services/storage/db')
    const { loadNutritionPlan, saveNutritionPlan, macroGoalsFromPlan } = await import('./nutritionPlanStore')
    await db.userProfile.put({ id: 'me', createdAt: '', updatedAt: '' } as never)
    await db.nutritionDiary.put({ id: 'entry-1', date: '2026-11-18', mealType: 'Almuerzo', source: 'manual', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), macros: { calories: 500, proteins: 30, carbs: 60, fats: 15 }, items: [] } as never)

    const first = await saveNutritionPlan(base, 'Cálculo inicial')
    expect(first.plan).not.toBeNull()
    const stored = await loadNutritionPlan()
    expect(stored?.current.target.reference).toBe(first.plan!.target.reference)
    expect(stored?.history[0].reason).toBe('Cálculo inicial')

    await saveNutritionPlan({ ...base, goal: 'lose' }, 'Objetivo recalculado')
    const updated = await loadNutritionPlan()
    expect(updated?.history).toHaveLength(2)
    expect(updated?.history[0].reason).toBe('Objetivo recalculado')

    const goals = macroGoalsFromPlan(updated!.current)
    expect(goals.calories).toBe(updated!.current.target.reference)
    expect(goals.protein).toBe(updated!.current.macros.protein)
    expect(await db.nutritionDiary.count()).toBe(1)
  })
})
