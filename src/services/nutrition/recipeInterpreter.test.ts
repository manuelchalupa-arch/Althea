import { describe, it, expect } from 'vitest'
import {
  interpretDish,
  computeDishTotals,
  setIngredientGrams,
  removeIngredient,
} from './recipeInterpreter'

function ids(draft: { ingredients: Array<{ foodId: string }> }): string[] {
  return draft.ingredients.map(i => i.foodId)
}

function gramsOf(draft: { ingredients: Array<{ foodId: string; grams: number }> }, foodId: string): number {
  return draft.ingredients.find(i => i.foodId === foodId)?.grams ?? -1
}

describe('Interprete de comidas — recetas base deterministas', () => {
  it('"fideos con boloñesa" se descompone en fideos, carne picada, salsa de tomate y cebolla', () => {
    const d = interpretDish('fideos con boloñesa')
    expect(d).not.toBeNull()
    expect(ids(d!)).toEqual(['fideos', 'carne-picada', 'salsa-tomate', 'cebolla'])
  })

  it('"fideos con boloñesa y queso rallado" agrega el queso rallado', () => {
    const d = interpretDish('fideos con boloñesa y queso rallado')
    expect(ids(d!)).toContain('queso-rallado')
    // no duplica los fideos de la receta base
    expect(ids(d!).filter(x => x === 'fideos')).toHaveLength(1)
    expect(gramsOf(d!, 'queso-rallado')).toBe(20)
  })

  it('"pastel de papa" se descompone en papa, carne picada y cebolla', () => {
    const d = interpretDish('pastel de papa')
    expect(ids(d!)).toEqual(['papa', 'carne-picada', 'cebolla'])
  })

  it('"pastel de papa con queso" conserva la receta base y agrega el queso SIN adivinar el tipo', () => {
    const d = interpretDish('pastel de papa con queso')
    // Regla de producto: "queso" genérico jamás se convierte en "queso rallado".
    expect(ids(d!)).toEqual(['papa', 'carne-picada', 'cebolla', 'queso'])
    expect(d!.ingredients.find(i => i.foodId === 'queso')?.label).toBe('Queso')
    expect(ids(d!)).not.toContain('queso-rallado')
  })

  it('"ensalada de lechuga y tomate" se descompone en lechuga y tomate', () => {
    const d = interpretDish('ensalada de lechuga y tomate')
    expect(ids(d!)).toEqual(['lechuga', 'tomate'])
  })

  it('"milanesa" incluye carne, huevo, pan rallado y aceite', () => {
    const d = interpretDish('milanesa')
    expect(ids(d!)).toEqual(['carne', 'huevo', 'pan-rallado', 'aceite'])
  })

  it('"milanesa con queso" agrega queso sin perder los componentes base ni inventar el tipo', () => {
    const d = interpretDish('milanesa con queso')
    expect(ids(d!)).toEqual(['carne', 'huevo', 'pan-rallado', 'aceite', 'queso'])
    expect(ids(d!)).not.toContain('queso-rallado')
  })

  it('"arroz con pollo", "pollo con puré" y "yogur con banana" se reconocen', () => {
    expect(ids(interpretDish('arroz con pollo')!)).toEqual(['arroz', 'pollo'])
    expect(ids(interpretDish('pollo con puré')!)).toEqual(['pollo', 'pure-papa'])
    expect(ids(interpretDish('yogur con banana')!)).toEqual(['yogur', 'banana'])
  })

  it('normaliza acentos y mayusculas: "Fideos con Boloñesa"', () => {
    expect(ids(interpretDish('Fideos con Boloñesa')!)).toEqual(['fideos', 'carne-picada', 'salsa-tomate', 'cebolla'])
  })

  it('no inventa ingredientes: texto sin alimentos reconocidos devuelve null', () => {
    expect(interpretDish('comida rara que no existe')).toBeNull()
    expect(interpretDish('')).toBeNull()
    expect(interpretDish('   ')).toBeNull()
  })
})

describe('Interprete de comidas — cantidades escritas por el usuario', () => {
  it('respeta "200 g de pollo"', () => {
    const d = interpretDish('200 g de pollo')
    expect(ids(d!)).toEqual(['pollo'])
    expect(gramsOf(d!, 'pollo')).toBe(200)
    expect(d!.hasExplicitAmount).toBe(true)
  })

  it('respeta "200g de pollo" sin espacio', () => {
    expect(gramsOf(interpretDish('200g de pollo')!, 'pollo')).toBe(200)
  })

  it('respeta "2 huevos" como alimento contable', () => {
    const d = interpretDish('2 huevos')
    expect(ids(d!)).toEqual(['huevo'])
    expect(gramsOf(d!, 'huevo')).toBe(100)
  })

  it('respeta "media porción de fideos" como mitad de la porción estándar', () => {
    const d = interpretDish('media porción de fideos')
    expect(gramsOf(d!, 'fideos')).toBe(90)
  })

  it('respeta "1 kg de fideos"', () => {
    expect(gramsOf(interpretDish('1 kg de fideos')!, 'fideos')).toBe(1000)
  })

  it('la cantidad escrita pisa la porción de la receta sin romper el resto', () => {
    const d = interpretDish('fideos con boloñesa y 200 g de fideos')
    expect(gramsOf(d!, 'fideos')).toBe(200)
    expect(gramsOf(d!, 'carne-picada')).toBe(100)
  })

  it('sin cantidad escrita usa la porción estándar del alimento nombrado', () => {
    expect(gramsOf(interpretDish('pollo')!, 'pollo')).toBe(120)
  })
})

describe('Interprete de comidas — calculo de macros y recalculo', () => {
  it('los totales salen de los ingredientes, no de numeros fijos', () => {
    const d = interpretDish('fideos con boloñesa')!
    const suma = d.ingredients.reduce(
      (a, i) => ({
        calories: a.calories + i.macros.calories,
        proteins: Math.round((a.proteins + i.macros.proteins) * 10) / 10,
        carbs: Math.round((a.carbs + i.macros.carbs) * 10) / 10,
        fats: Math.round((a.fats + i.macros.fats) * 10) / 10,
      }),
      { calories: 0, proteins: 0, carbs: 0, fats: 0 }
    )
    expect(d.totals.calories).toBe(suma.calories)
    expect(d.totals.proteins).toBe(suma.proteins)
    expect(d.totals.carbs).toBe(suma.carbs)
    expect(d.totals.fats).toBe(suma.fats)
  })

  it('cambiar los gramos de un ingrediente recalcula sus macros al instante', () => {
    const d = interpretDish('fideos con boloñesa')!
    const idx = d.ingredients.findIndex(i => i.foodId === 'fideos')
    const antes = d.ingredients[idx].macros.calories
    const despues = setIngredientGrams(d.ingredients, idx, 360)
    expect(despues[idx].grams).toBe(360)
    // el doble de gramos duplica el aporte (±1 por redondeo de kcal)
    expect(despues[idx].macros.calories).toBeCloseTo(antes * 2, -1)
    // los otros ingredientes no se tocan
    expect(despues.find(i => i.foodId === 'carne-picada')).toEqual(
      d.ingredients.find(i => i.foodId === 'carne-picada')
    )
  })

  it('cambiar los gramos cambia el total de la comida', () => {
    const d = interpretDish('fideos con boloñesa')!
    const idx = d.ingredients.findIndex(i => i.foodId === 'carne-picada')
    const antes = computeDishTotals(d.ingredients).proteins
    const despues = computeDishTotals(setIngredientGrams(d.ingredients, idx, 200))
    // el doble de carne (100 g -> 200 g) = +26 g de proteína
    expect(despues.proteins).toBeCloseTo(antes + 26, 1)
  })

  it('quitar un ingredient recalcula el total', () => {
    const d = interpretDish('milanesa')!
    const antes = computeDishTotals(d.ingredients).calories
    const sinAceite = removeIngredient(d.ingredients, d.ingredients.findIndex(i => i.foodId === 'aceite'))
    expect(sinAceite).toHaveLength(3)
    expect(computeDishTotals(sinAceite).calories).toBeLessThan(antes)
  })

  it('el nombre de la comida se capitaliza a partir de lo que escribió el usuario', () => {
    expect(interpretDish('fideos con boloñesa y queso rallado')!.name).toBe('Fideos con boloñesa y queso rallado')
    expect(interpretDish('200 g de pollo')!.name).toBe('200 g de pollo')
  })
})
