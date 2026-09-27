import { describe, it, expect } from 'vitest'
import {
  interpretMeal,
  flattenComponents,
  componentQuantityLabel,
  componentTypeLabel,
  resolveComponentOption,
  setComponentQuantity,
  dropComponent,
} from './mealInterpretation'

function leaves(meal: NonNullable<ReturnType<typeof interpretMeal>>) {
  return flattenComponents(meal.components)
}

function byName(meal: NonNullable<ReturnType<typeof interpretMeal>>, name: string) {
  return leaves(meal).find(c => c.displayName === name)
}

describe('Comidas compuestas — el plato manda, los ingredientes no se sueltan', () => {
  it('"Hamburguesa con queso, lechuga y tomate" se interpreta como plato + toppings', () => {
    const meal = interpretMeal('Hamburguesa con queso, lechuga y tomate')
    expect(meal).not.toBeNull()
    expect(meal!.mealName).toBe('Hamburguesa con queso, lechuga y tomate')

    // PLATO PRINCIPAL con SU composición
    const dish = meal!.components.find(c => c.type === 'dish')
    expect(dish).toBeTruthy()
    expect(dish!.displayName).toBe('Hamburguesa')
    expect(dish!.children?.map(c => c.displayName)).toEqual(['Pan de hamburguesa', 'Medallón de carne'])

    // Los toppings quedan como componentes del MISMO plato, no como comidas sueltas
    expect(meal!.components.filter(c => c.type === 'dish')).toHaveLength(1)

    const pan = byName(meal!, 'Pan de hamburguesa')!
    expect(componentQuantityLabel(pan)).toBe('1 unidad estimada')
    const medallon = byName(meal!, 'Medallón de carne')!
    expect(componentQuantityLabel(medallon)).toBe('1 unidad estimada')

    const queso = byName(meal!, 'Queso')!
    expect(componentTypeLabel(queso, meal!.ambiguities)).toBe('tipo no especificado')
    expect(componentQuantityLabel(queso)).toContain('cantidad estimada')

    expect(byName(meal!, 'Lechuga')).toBeTruthy()
    expect(byName(meal!, 'Tomate')).toBeTruthy()

    // Nunca un solo "Lechuga / Tomate" suelto perdiendo el plato
    expect(leaves(meal!).length).toBeGreaterThanOrEqual(5)
  })

  it('la suma nutricional cubre TODOS los componentes del plato', () => {
    const meal = interpretMeal('Hamburguesa con queso, lechuga y tomate')!
    const suma = leaves(meal).reduce((a, c) => a + c.macros.calories, 0)
    expect(meal.totals.calories).toBe(suma)
    expect(meal.totals.calories).toBeGreaterThan(0)
  })

  it('"fideos con boloñesa" identifica pasta + salsa boloñesa como un plato', () => {
    const meal = interpretMeal('fideos con boloñesa')!
    const dish = meal.components.find(c => c.type === 'dish')!
    expect(dish.displayName).toBe('Fideos con boloñesa')
    expect(dish.children?.map(c => c.displayName)).toEqual([
      'Fideos', 'Carne picada', 'Salsa de tomate', 'Cebolla',
    ])
    expect(meal.ambiguities).toHaveLength(0)
  })

  it('"fideos con boloñesa y queso rallado" identifica pasta + salsa + queso rallado', () => {
    const meal = interpretMeal('fideos con boloñesa y queso rallado')!
    const names = leaves(meal).map(c => c.displayName)
    expect(names).toContain('Fideos')
    expect(names).toContain('Queso rallado')
    // el usuario especificó el tipo: no hay ambigüedad
    expect(meal.ambiguities).toHaveLength(0)
    expect(meal.needsConfirmation).toBe(false)
    // no duplica la pasta de la receta base
    expect(names.filter(n => n === 'Fideos')).toHaveLength(1)
  })

  it('"pastel de papa" y "milanesa" se reconocen como preparaciones compuestas', () => {
    expect(interpretMeal('pastel de papa')!.components[0].type).toBe('dish')
    expect(interpretMeal('pastel de papa')!.components[0].children!.map(c => c.displayName))
      .toEqual(['Papa', 'Carne picada', 'Cebolla'])
    expect(interpretMeal('milanesa')!.components[0].type).toBe('dish')
    expect(interpretMeal('milanesa')!.components[0].children!.map(c => c.displayName))
      .toEqual(['Carne', 'Huevo', 'Pan rallado', 'Aceite'])
  })

  it('el recetario reconoce pizza, empanada, tarta, sándwich, ensalada compuesta y guiso', () => {
    for (const [text, dishName] of [
      ['pizza', 'Pizza'],
      ['empanada', 'Empanada'],
      ['tarta de papa', 'Tarta de papa'],
      ['sandwich de miga', 'Sándwich de miga'],
      ['ensalada compuesta', 'Ensalada compuesta'],
      ['guiso', 'Guiso de carne'],
    ] as const) {
      const meal = interpretMeal(text)
      expect(meal, text).not.toBeNull()
      expect(meal!.components[0].type, text).toBe('dish')
      expect(meal!.components[0].displayName, text).toBe(dishName)
    }
  })
})

describe('Ambigüedad — nunca se inventa un ingrediente específico', () => {
  it('"queso" genérico queda como Queso (tipo no especificado), nunca queso rallado', () => {
    const meal = interpretMeal('hamburguesa con queso')!
    const queso = byName(meal, 'Queso')!
    expect(queso.canonicalFoodId).toBe('queso')
    expect(queso.displayName).toBe('Queso')
    expect(leaves(meal).some(c => c.canonicalFoodId === 'queso-rallado')).toBe(false)
    expect(meal.needsConfirmation).toBe(true)
    expect(meal.ambiguities[0].question).toBe('¿Qué tipo de queso usaste?')
  })

  it('las opciones de la pregunta salen de la biblioteca de alimentos', () => {
    const meal = interpretMeal('hamburguesa con queso')!
    const labels = meal.ambiguities[0].options.map(o => o.label)
    expect(labels).toEqual([
      'Queso (sin especificar)', 'Queso cremoso', 'Mozzarella', 'Cheddar', 'Queso rallado',
    ])
    const ids = meal.ambiguities[0].options.map(o => o.id)
    expect(ids).toContain('mozzarella')
    expect(ids).toContain('cheddar')
    expect(ids).toContain('queso-rallado')
  })

  it('elegir una opción resuelve la ambigüedad y recalcula los macros', () => {
    const meal = interpretMeal('hamburguesa con queso')!
    const queso = byName(meal, 'Queso')!
    const antes = meal.totals.calories

    const resuelta = resolveComponentOption(meal, queso.id, 'cheddar')
    expect(resuelta.needsConfirmation).toBe(false)
    expect(resuelta.ambiguities).toHaveLength(0)

    const nuevo = leaves(resuelta).find(c => c.canonicalFoodId === 'cheddar')!
    expect(nuevo.displayName).toBe('Cheddar')
    // cheddar (403 kcal/100g) tiene más calorías que el queso genérico (300)
    expect(resuelta.totals.calories).toBeGreaterThan(antes)
    // el resto del plato no cambió
    expect(leaves(resuelta).map(c => c.canonicalFoodId)).toContain('medallon-carne')
  })

  it('el queso explícito ("queso rallado") no dispara ninguna pregunta', () => {
    const meal = interpretMeal('milanesa con queso rallado')!
    expect(meal.ambiguities).toHaveLength(0)
    expect(meal.needsConfirmation).toBe(false)
    expect(byName(meal, 'Queso rallado')).toBeTruthy()
  })
})

describe('Cantidades ausentes — estimación marcada y editable', () => {
  it('sin cantidad escrita usa la porción estándar y lo marca como estimado', () => {
    const meal = interpretMeal('pollo')!
    const pollo = byName(meal, 'Pollo')!
    expect(pollo.quantityEstimated).toBe(true)
    expect(meal.hasEstimatedQuantities).toBe(true)
    expect(componentQuantityLabel(pollo)).toContain('cantidad estimada')
    expect(meal.hasExplicitAmount).toBe(false)
  })

  it('la cantidad escrita por el usuario deja de ser estimación', () => {
    const meal = interpretMeal('200 g de pollo')!
    const pollo = byName(meal, 'Pollo')!
    expect(pollo.quantityEstimated).toBe(false)
    expect(pollo.grams).toBe(200)
    expect(meal.hasExplicitAmount).toBe(true)
    expect(componentQuantityLabel(pollo)).toBe('200 g')
  })

  it('la cantidad escrita pisa la porción de la receta sin duplicar el alimento', () => {
    const meal = interpretMeal('fideos con boloñesa y 200 g de fideos')!
    const fideos = leaves(meal).filter(c => c.canonicalFoodId === 'fideos')
    expect(fideos).toHaveLength(1)
    expect(fideos[0].grams).toBe(200)
    expect(byName(meal, 'Carne picada')!.grams).toBe(100)
  })

  it('se puede cambiar la cantidad desde la revisión y los macros siguen al cambio', () => {
    const meal = interpretMeal('fideos con boloñesa')!
    const fideos = byName(meal, 'Fideos')!
    const antes = meal.totals.calories
    const next = setComponentQuantity(meal, fideos.id, 360)
    expect(byName(next, 'Fideos')!.grams).toBe(360)
    expect(next.totals.calories).toBeGreaterThan(antes)
    expect(next.components[0].type).toBe('dish')
  })

  it('se puede quitar un componente sin vaciar el plato', () => {
    const meal = interpretMeal('hamburguesa con queso, lechuga y tomate')!
    const lechuga = byName(meal, 'Lechuga')!
    const next = dropComponent(meal, lechuga.id)!
    expect(byName(next, 'Lechuga')).toBeUndefined()
    expect(byName(next, 'Tomate')).toBeTruthy()
    expect(next.totals.calories).toBeGreaterThan(0)
  })
})

describe('Confianza y texto irreconocible', () => {
  it('texto sin alimentos reconocidos devuelve null (no inventa)', () => {
    expect(interpretMeal('comida rara que no existe')).toBeNull()
    expect(interpretMeal('')).toBeNull()
  })

  it('una receta conocida tiene más confianza que un alimento suelto', () => {
    expect(interpretMeal('fideos con boloñesa')!.confidence).toBeGreaterThan(0.8)
    expect(interpretMeal('pollo')!.confidence).toBeLessThan(0.9)
  })
})
