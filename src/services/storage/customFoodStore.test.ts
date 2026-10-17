import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  validateCustomFoodInput,
  normalizeToPer100,
  macroDiscrepancyWarning,
  createCustomFood,
  updateCustomFood,
  buildCustomFood,
  listCustomFoods,
  getCustomFood,
  deleteCustomFood,
  refreshCustomFoods,
  toFoodBase,
  type CustomFoodInput,
} from './customFoodStore'
import { db } from '@/services/storage/db'
import { getFood, clearExtraFoods } from '@/services/nutrition/foodComposition'
import { interpretMeal } from '@/services/nutrition/mealInterpretation'

const base = (over: Partial<CustomFoodInput> = {}): CustomFoodInput => ({
  name: 'Yogur de coco',
  basis: 'per100g',
  calories: 120,
  proteins: 2,
  carbs: 9,
  fats: 8,
  ...over,
})

async function reset() {
  await db.customFoods.clear()
  clearExtraFoods()
}

describe('validación de alta manual', () => {
  beforeEach(reset)
  afterEach(reset)

  it('un campo vacío NO se trata como 0: se reporta como vacío', () => {
    const errs = validateCustomFoodInput(base({ proteins: null }))
    expect(errs.some(e => e.includes('Proteínas') && e.includes('vacío'))).toBe(true)
  })

  it('un 0 explícito es válido y distinto de vacío', () => {
    expect(validateCustomFoodInput(base({ fats: 0 }))).toEqual([])
  })

  it('rechaza números negativos', () => {
    const errs = validateCustomFoodInput(base({ carbs: -3 }))
    expect(errs.some(e => e.includes('Carbohidratos'))).toBe(true)
  })

  it('rechaza nombre en blanco y exige peso de porción en base perServing', () => {
    expect(validateCustomFoodInput(base({ name: '   ' })).length).toBeGreaterThan(0)
    const noWeight = validateCustomFoodInput(base({ basis: 'perServing' }))
    expect(noWeight.some(e => e.includes('porción'))).toBe(true)
    expect(validateCustomFoodInput(base({ basis: 'perServing', servingGrams: 30 }))).toEqual([])
  })
})

describe('normalización de macros a per100', () => {
  it('base por 100 g se mantiene igual', () => {
    const { per100 } = normalizeToPer100(base())
    expect(per100.calories).toBe(120)
    expect(per100.proteins).toBe(2)
  })

  it('base por porción escala a per100 usando el peso de la porción', () => {
    // porción de 50 g con 60 kcal → 120 kcal / 100 g
    const { per100 } = normalizeToPer100(base({ basis: 'perServing', servingGrams: 50, calories: 60, proteins: 5 }))
    expect(per100.calories).toBe(120)
    expect(per100.proteins).toBe(10)
  })

  it('guarda los macros ingresados tal cual para trazabilidad', () => {
    const { entered } = normalizeToPer100(base({ basis: 'perServing', servingGrams: 50, calories: 60 }))
    expect(entered.calories).toBe(60)
  })
})

describe('aviso de discrepancia kcal vs macros', () => {
  it('avisa cuando las calorías no cuadran con los macros', () => {
    // 100 kcal pero macros que suman ~65 kcal
    const w = macroDiscrepancyWarning({ calories: 100, proteins: 2, carbs: 5, fats: 0 })
    expect(w).toBeTruthy()
  })

  it('no avisa cuando cuadra', () => {
    // P5·4 + C25·4 + G5·9 = 20+100+45 = 165
    expect(macroDiscrepancyWarning({ calories: 165, proteins: 5, carbs: 25, fats: 5 })).toBeNull()
  })
})

describe('persistencia y registro en el intérprete', () => {
  beforeEach(reset)
  afterEach(reset)

  it('crea, lista y recupera un alimento personalizado', async () => {
    const created = await createCustomFood(base())
    expect(created.source).toBe('manual')
    expect(created.id).toMatch(/^custom-food-/)
    const list = await listCustomFoods()
    expect(list).toHaveLength(1)
    expect((await getCustomFood(created.id))?.name).toBe('Yogur de coco')
  })

  it('se registra en el intérprete y es reconocido en texto', async () => {
    const created = await createCustomFood(base({
      name: 'Pan casero integral',
      aliases: ['pan casero', 'pan integral casero'],
      calories: 260, proteins: 9, carbs: 48, fats: 4,
    }))
    expect(getFood(created.id)).toBeDefined()
    // El texto pasa por interpretMeal y reconoce el alimento personalizado.
    const meal = interpretMeal('200 g de pan casero integral')
    expect(meal).not.toBeNull()
    expect(meal!.components.some(c => c.canonicalFoodId === created.id)).toBe(true)
    const comp = meal!.components.find(c => c.canonicalFoodId === created.id)!
    expect(comp.grams).toBe(200)
    expect(comp.macros.calories).toBeCloseTo(260 * 2, 5)
  })

  it('actualizar cambia los macros y el registro en memoria', async () => {
    const created = await createCustomFood(base())
    await updateCustomFood(created.id, base({ calories: 200, proteins: 4 }))
    expect(getFood(created.id)?.per100.calories).toBe(200)
    expect((await getCustomFood(created.id))?.per100.proteins).toBe(4)
  })

  it('borrar quita el alimento del intérprete', async () => {
    const created = await createCustomFood(base())
    expect(getFood(created.id)).toBeDefined()
    await deleteCustomFood(created.id)
    expect(getFood(created.id)).toBeUndefined()
    expect(await listCustomFoods()).toHaveLength(0)
  })

  it('toFoodBase expone un FoodBase con aliases normalizados y fuente manual', async () => {
    const created = await createCustomFood(base({ aliases: ['Yogur Coco', 'coco yogur'] }))
    const fb = toFoodBase(created)
    expect(fb.source).toBe('manual')
    expect(fb.aliases).toContain('yogur de coco')
    expect(fb.aliases).toContain('yogur coco')
    expect(fb.per100.calories).toBe(120)
  })

  it('refreshCustomFoods relee Dexie y repuebla el registro', async () => {
    await createCustomFood(base({ name: 'Mermelada casera' }))
    clearExtraFoods()
    expect(getFood((await listCustomFoods())[0].id)).toBeUndefined()
    await refreshCustomFoods()
    expect(getFood((await listCustomFoods())[0].id)).toBeDefined()
  })
})

describe('nutrientes opcionales, código de barras y porciones', () => {
  beforeEach(reset)
  afterEach(reset)

  it('guarda fibra/sodio/código/porciones y deja ausente lo que no se cargó', async () => {
    const saved = await createCustomFood(base({
      fiber: 3.5,
      sodium: 200,
      barcode: '7791234567890',
      portions: [{ label: '1 taza', grams: 240 }],
    }))
    expect(saved.extras?.fiber).toBe(3.5)
    expect(saved.extras?.sodium).toBe(200)
    expect(saved.extras?.sugars).toBeUndefined()
    expect(saved.barcode).toBe('7791234567890')
    expect(saved.portions).toEqual([{ label: '1 taza', grams: 240 }])
  })

  it('sin extras cargados, `extras` queda ausente (no 0 ficticio)', async () => {
    const saved = await createCustomFood(base())
    expect(saved.extras).toBeUndefined()
  })

  it('perServing escala los extras con el mismo factor que los macros', () => {
    const { extras } = normalizeToPer100(base({
      basis: 'perServing', servingGrams: 50, sodium: 100, fiber: 2,
    }))
    expect(extras?.sodium).toBe(200)
    expect(extras?.fiber).toBe(4)
  })

  it('toFoodBase propaga los extras al intérprete', async () => {
    const created = await createCustomFood(base({ saturatedFat: 5, salt: 1.2 }))
    const fb = toFoodBase(created)
    expect(fb.extras?.saturatedFat).toBe(5)
    expect(fb.extras?.salt).toBe(1.2)
  })

  it('rechaza un nutriente opcional negativo', () => {
    const errs = validateCustomFoodInput(base({ sodium: -1 }))
    expect(errs.some(e => e.includes('Sodio'))).toBe(true)
  })

  it('rechaza una porción alternativa con gramos no positivos', () => {
    const errs = validateCustomFoodInput(base({ portions: [{ label: '1 cda', grams: 0 }] }))
    expect(errs.some(e => e.includes('Porción'))).toBe(true)
  })

  it('ignora porciones vacías al construir', () => {
    const built = buildCustomFood(base({ portions: [{ label: '', grams: 0 }] }))
    expect(built.portions).toBeUndefined()
  })
})

describe('no altera el historial del diario', () => {
  beforeEach(reset)
  afterEach(reset)

  it('crear y borrar un alimento personalizado no toca nutritionDiary', async () => {
    await db.nutritionDiary.put({
      id: 'entry-1', date: '2026-10-16', name: 'Comida', mealType: 'Comida',
      servingLabel: '', amount: 1, unit: 'g',
      macros: { calories: 300, proteins: 20, carbs: 30, fats: 10 },
      addedAt: new Date().toISOString(),
      ingredients: [{ label: 'Pollo', grams: 150, calories: 200, proteins: 30, carbs: 0, fats: 5 }],
    })
    const custom = await createCustomFood(base({ name: 'Alimento nuevo' }))
    await deleteCustomFood(custom.id)
    const entries = await db.nutritionDiary.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0].macros.calories).toBe(300)
    expect(entries[0].ingredients![0].grams).toBe(150)
  })
})
