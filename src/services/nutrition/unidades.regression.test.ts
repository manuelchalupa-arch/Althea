import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  addFoodComponent,
  componentQuantityLabel,
  emptyMeal,
  setComponentQuantity,
} from './mealInterpretation'
import { createCustomFood } from '@/services/storage/customFoodStore'
import { db } from '@/services/storage/db'
import { clearExtraFoods, getFood } from './foodComposition'

// Regresión de unidades (auditoría de aceptación, sección 2):
// - Un alimento cuya referencia es por 100 ml conserva "ml": nunca se
//   reinterpreta como gramos (no se asume densidad = 1 g/ml).
// - Un alimento cargado por porción se normaliza a per100 con el peso de la
//   porción y el escalado usa SIEMPRE esa misma base.

async function reset() {
  await db.customFoods.clear()
  clearExtraFoods()
}

describe('unidades: ml vs g y base por porción', () => {
  beforeEach(reset)
  afterEach(reset)

  it('un alimento por 100 ml conserva ml y no se convierte en gramos', async () => {
    const cf = await createCustomFood({
      name: 'Bebida proteica',
      basis: 'per100ml',
      calories: 40,
      proteins: 6,
      carbs: 3,
      fats: 1,
    })
    expect(getFood(cf.id)!.unit).toBe('ml')

    let meal = emptyMeal('bebida proteica')
    meal = addFoodComponent(meal, cf.id, 250)
    const c = meal.components[0]

    expect(c.unit).toBe('ml')
    expect(c.grams).toBe(250) // 250 ml, no 250 g
    expect(c.quantity).toBe(250)
    expect(componentQuantityLabel(c)).toBe('250 ml')
    // 40 kcal / 100 ml sobre 250 ml = 100 kcal (sin densidad del agua)
    expect(c.macros.calories).toBeCloseTo(100, 1)
    expect(c.macros.proteins).toBeCloseTo(15, 1)
  })

  it('editar la cantidad de un alimento en ml mantiene ml y escala los 4 macros', async () => {
    const cf = await createCustomFood({
      name: 'Jugo natural',
      basis: 'per100ml',
      calories: 45,
      proteins: 0.7,
      carbs: 10,
      fats: 0.2,
    })

    let meal = emptyMeal('jugo')
    meal = addFoodComponent(meal, cf.id, 200)
    const id = meal.components[0].id
    meal = setComponentQuantity(meal, id, 400)
    const c = meal.components[0]

    expect(c.unit).toBe('ml')
    expect(c.quantity).toBe(400)
    expect(c.grams).toBe(400)
    expect(componentQuantityLabel(c)).toBe('400 ml')
    // per100 por 100 ml; 400 ml → ×4
    expect(c.macros.calories).toBeCloseTo(180, 1)
    expect(c.macros.proteins).toBeCloseTo(2.8, 1)
    expect(c.macros.carbs).toBeCloseTo(40, 1)
    expect(c.macros.fats).toBeCloseTo(0.8, 1)
  })

  it('un alimento por porción se normaliza a per100 y escala sobre el peso de la porción', async () => {
    // 150 kcal por porción de 60 g → 250 kcal / 100 g
    const cf = await createCustomFood({
      name: 'Pan casero',
      basis: 'perServing',
      servingGrams: 60,
      calories: 150,
      proteins: 5,
      carbs: 28,
      fats: 2,
    })
    expect(cf.per100.calories).toBeCloseTo(250, 1)
    expect(getFood(cf.id)!.standardGrams).toBe(60)

    // sin cantidad explícita usa la porción estándar (60 g) → vuelve al valor por porción
    let meal = addFoodComponent(emptyMeal('pan casero'), cf.id)
    const c = meal.components[0]
    expect(c.grams).toBe(60)
    expect(c.unit).toBe('g')
    expect(componentQuantityLabel(c)).toBe('60 g · cantidad estimada')
    expect(c.macros.calories).toBeCloseTo(150, 1)

    // el doble de la porción duplica los macros (misma base de cálculo)
    meal = setComponentQuantity(meal, c.id, 120)
    expect(meal.components[0].grams).toBe(120)
    expect(meal.components[0].macros.calories).toBeCloseTo(300, 1)
    expect(meal.components[0].macros.proteins).toBeCloseTo(10, 1)
  })

  it('ml y g del mismo valor numérico no se mezclan: la etiqueta y el cálculo respetan la unidad', async () => {
    const liquido = await createCustomFood({
      name: 'Refresco zero',
      basis: 'per100ml',
      calories: 0,
      proteins: 0,
      carbs: 0,
      fats: 0,
    })
    const solido = await createCustomFood({
      name: 'Galletita',
      basis: 'per100g',
      calories: 400,
      proteins: 6,
      carbs: 70,
      fats: 12,
    })

    let meal = emptyMeal('test')
    meal = addFoodComponent(meal, liquido.id, 100)
    meal = addFoodComponent(meal, solido.id, 100)

    expect(meal.components[0].unit).toBe('ml')
    expect(componentQuantityLabel(meal.components[0])).toBe('100 ml')
    expect(meal.components[1].unit).toBe('g')
    expect(componentQuantityLabel(meal.components[1])).toBe('100 g')
    expect(meal.components[0].macros.calories).toBe(0)
    expect(meal.components[1].macros.calories).toBeCloseTo(400, 1)
  })
})
