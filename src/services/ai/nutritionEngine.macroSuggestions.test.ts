import { describe, it, expect } from 'vitest'
import { buildMacroSuggestions, MACRO_SUGGESTION_COLORS } from './nutritionEngine'

const goals = { protein: 150, carbs: 250, fat: 70 }

describe('buildMacroSuggestions — una sugerencia por macro', () => {
  it('devuelve exactamente proteínas, carbohidratos y grasas', () => {
    const out = buildMacroSuggestions({ goals, totals: { protein: 100, carbs: 250, fat: 70 } })!
    expect(out.map(s => s.key)).toEqual(['protein', 'carbs', 'fat'])
    expect(out).toHaveLength(3)
  })

  it('usa los colores de los segmentos del gráfico de macros', () => {
    const out = buildMacroSuggestions({ goals, totals: { protein: 0, carbs: 0, fat: 0 } })!
    expect(out.find(s => s.key === 'protein')!.color).toBe(MACRO_SUGGESTION_COLORS.protein)
    expect(out.find(s => s.key === 'carbs')!.color).toBe(MACRO_SUGGESTION_COLORS.carbs)
    expect(out.find(s => s.key === 'fat')!.color).toBe(MACRO_SUGGESTION_COLORS.fat)
    expect(MACRO_SUGGESTION_COLORS.carbs).toBe('var(--althea-primary)')
  })

  it('cuantifica la brecha cuando falta el macro y recomienda cuando está cubierto', () => {
    const out = buildMacroSuggestions({ goals, totals: { protein: 100, carbs: 250, fat: 20 } })!
    expect(out[0].detail).toContain('Faltan 50 g')
    expect(out[1].detail).toMatch(/en rango/i)
    expect(out[2].detail).toContain('Faltan 50 g')
  })

  it('sin metas personalizadas no inventa sugerencias', () => {
    expect(buildMacroSuggestions({ goals: null, totals: { protein: 0, carbs: 0, fat: 0 } })).toBeNull()
  })
})
