import { describe, it, expect } from 'vitest'
import {
  getTrainingLimitations,
  getPainAreas,
  getExcludedExercises,
  getNutritionRestrictions,
  getNutritionAllergies,
  getNutritionDislikedFoods,
} from './restrictions'

// Perfil con los dos dominios poblados a la vez: es el caso que S4 debe
// mantener separado sin mezclas.
const PERFIL_MIXTO = {
  limitations: ['equipamiento', 'tiempo'],
  painAreas: ['rodillas'],
  excludedExercises: ['biceps/barbell-curl'],
  restrictions: ['equipamiento', 'tiempo'],
  nutritionPrefs: {
    restrictions: ['vegano', 'sin gluten'],
    allergies: ['maní'],
    dislikedFoods: ['hígado'],
  },
}

describe('FASE 2 S4 — fuentes canónicas de restricciones', () => {
  it('1. lee desde la fuente canónica de cada concepto', () => {
    expect(getTrainingLimitations(PERFIL_MIXTO)).toEqual(['equipamiento', 'tiempo'])
    expect(getPainAreas(PERFIL_MIXTO)).toEqual(['rodillas'])
    expect(getExcludedExercises(PERFIL_MIXTO)).toEqual(['biceps/barbell-curl'])
    expect(getNutritionRestrictions(PERFIL_MIXTO)).toEqual(['vegano', 'sin gluten'])
    expect(getNutritionAllergies(PERFIL_MIXTO)).toEqual(['maní'])
    expect(getNutritionDislikedFoods(PERFIL_MIXTO)).toEqual(['hígado'])
  })

  it('2. SEPARACIÓN: la restricción nutricional no llega como de entrenamiento', () => {
    const training = getTrainingLimitations(PERFIL_MIXTO)
    expect(training).not.toContain('vegano')
    expect(training).not.toContain('sin gluten')
    expect(training).not.toContain('maní')
  })

  it('3. SEPARACIÓN: la restricción de entrenamiento no llega como nutricional', () => {
    const nutrition = getNutritionRestrictions(PERFIL_MIXTO)
    expect(nutrition).not.toContain('equipamiento')
    expect(nutrition).not.toContain('tiempo')
    expect(nutrition).not.toContain('espacio')
  })

  it('4. el espejo legacy profile.restrictions NO se usa como fuente nutricional', () => {
    // Perfil guardado por Perfil antes de S4: la lista alimentaria quedó
    // duplicada en el campo de entrenamiento. Con el canónico vacío, el
    // legacy tiene contenido SOLO si viene del onboarding (entrenamiento),
    // así que no puede interpretarse como dieta.
    const legacyEntrenamiento = { restrictions: ['equipamiento'], nutritionPrefs: { restrictions: [] } }
    expect(getNutritionRestrictions(legacyEntrenamiento)).toEqual([])
    expect(getTrainingLimitations(legacyEntrenamiento)).toEqual([])
  })

  it('5. el legacy duplicado no pisa al canónico cuando ambos existen', () => {
    const p = { restrictions: ['equipamiento'], nutritionPrefs: { restrictions: ['vegano'] } }
    expect(getNutritionRestrictions(p)).toEqual(['vegano'])
  })

  it('6. ausencia de restricciones: sin crash, sin undefined, sin null', () => {
    for (const source of [null, undefined, {}, { limitations: undefined, nutritionPrefs: undefined }]) {
      expect(getTrainingLimitations(source as never)).toEqual([])
      expect(getPainAreas(source as never)).toEqual([])
      expect(getExcludedExercises(source as never)).toEqual([])
      expect(getNutritionRestrictions(source as never)).toEqual([])
      expect(getNutritionAllergies(source as never)).toEqual([])
      expect(getNutritionDislikedFoods(source as never)).toEqual([])
    }
  })

  it('7. combina varias restricciones de cada dominio sin perder ni inventar valores', () => {
    const p = {
      limitations: ['equipamiento', 'espacio', 'movimientos'],
      nutritionPrefs: { restrictions: ['vegano', 'sin lactosa', 'sin gluten'] },
    }
    expect(getTrainingLimitations(p)).toEqual(['equipamiento', 'espacio', 'movimientos'])
    expect(getNutritionRestrictions(p)).toEqual(['vegano', 'sin lactosa', 'sin gluten'])
  })

  it('8. descarta entradas no utilizables sin lanzar error', () => {
    const p = {
      limitations: ['equipamiento', '', '   ', null, 42] as unknown as string[],
      nutritionPrefs: { restrictions: ['vegano', undefined, ''] as unknown as string[] },
    }
    expect(getTrainingLimitations(p)).toEqual(['equipamiento'])
    expect(getNutritionRestrictions(p)).toEqual(['vegano'])
  })
})
