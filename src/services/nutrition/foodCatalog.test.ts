import { describe, it, expect } from 'vitest'
import { CATALOG_FOODS } from './foodCatalog'
import { FOODS, getFood } from './foodComposition'
import { RECIPES } from './mealInterpretation'

// Catálogo ampliado: cobertura, distinción de estados y trazabilidad.
// Estos tests protegen las invariantes que exige el producto:
//  - ids únicos y estables;
//  - seco ≠ cocido (registros separados, macros distintos);
//  - toda referencia de receta resuelve a un alimento real (no se omite en silencio).

describe('catálogo ampliado', () => {
  it('no repite ids y todos tienen macros válidos y no negativos', () => {
    const ids = new Set<string>()
    for (const f of CATALOG_FOODS) {
      expect(ids.has(f.id), `id duplicado en el catálogo: ${f.id}`).toBe(false)
      ids.add(f.id)
      expect(f.label.trim().length).toBeGreaterThan(0)
      expect(f.aliases.length).toBeGreaterThan(0)
      for (const v of [f.per100.calories, f.per100.proteins, f.per100.carbs, f.per100.fats]) {
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
      }
      expect(f.standardGrams).toBeGreaterThan(0)
    }
  })

  it('distingue el mismo alimento seco y cocido como registros separados', () => {
    const seco = getFood('avena-seca')
    const cocido = getFood('avena-cocida')
    expect(seco).toBeDefined()
    expect(cocido).toBeDefined()
    expect(seco!.state).toBe('seco')
    expect(cocido!.state).toBe('cocido')
    // 100 g de avena seca no tienen los macros de 100 g de avena cocida.
    expect(seco!.per100.calories).not.toBe(cocido!.per100.calories)

    const lentejas = getFood('lentejas-secas')
    const porotos = getFood('poroto-negro-cocido')
    expect(lentejas!.state).toBe('seco')
    expect(porotos!.state).toBe('hervido')
  })

  it('los alimentos del catálogo se fusionan en la tabla sin duplicar ids base', () => {
    const ids = FOODS.map(f => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const f of CATALOG_FOODS) {
      expect(FOODS.some(x => x.id === f.id)).toBe(true)
    }
  })

  it('todas las referencias foodId de las recetas existen (no se omiten en silencio)', () => {
    const missing: string[] = []
    for (const recipe of RECIPES) {
      for (const item of recipe.items) {
        if (!getFood(item.foodId)) { missing.push(`${recipe.id} → ${item.foodId}`) }
      }
    }
    expect(missing).toEqual([])
  })
})
