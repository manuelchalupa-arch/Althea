// Adaptador entre MealInterpretation (estructura de componentes) y DishDraft
// (lista plana de ingredientes) que usan el diario y las pantallas de edición.
//
// El motor de interpretación vive en mealInterpretation.ts. Los macros salen
// SIEMPRE de aritmética sobre la tabla local (foodComposition.ts): nunca de un
// LLM. Esta capa solo acomoda la forma de los datos para guardar/editar.

import {
  findFoodByLabel,
  getFood,
  FOODS,
  normalizeDishText,
  scaleMacros,
  sumMacros,
} from './foodComposition'
import {
  dropComponent,
  flattenComponents,
  interpretMeal,
  setComponentQuantity,
  type MealInterpretation,
} from './mealInterpretation'
import type { DiaryIngredientRecord } from '@/services/storage/diaryStore'
import type { Macros } from './foodComposition'

export interface DishIngredient {
  foodId: string
  label: string
  grams: number
  macros: Macros
}

export interface DishDraft {
  name: string
  ingredients: DishIngredient[]
  totals: Macros
  /** true si el usuario escribio al menos una cantidad explicita */
  hasExplicitAmount: boolean
}

/** Hojas de la interpretación en la forma plana que guarda el diario. */
export function ingredientsOf(meal: MealInterpretation): DishIngredient[] {
  return flattenComponents(meal.components)
    .filter(c => c.canonicalFoodId !== null)
    .map(c => ({
      foodId: c.canonicalFoodId as string,
      label: c.displayName,
      grams: c.grams,
      macros: c.macros,
    }))
}

/**
 * Interpreta una comida escrita en texto.
 * Devuelve null cuando no reconoce ningun ingrediente o receta.
 */
export function interpretDish(input: string): DishDraft | null {
  const meal = interpretMeal(input)
  if (!meal) { return null }
  const ingredients = ingredientsOf(meal)
  if (ingredients.length === 0) { return null }
  return {
    name: meal.mealName,
    ingredients,
    totals: sumMacros(ingredients.map(i => i.macros)),
    hasExplicitAmount: meal.hasExplicitAmount,
  }
}

/** Recalcula los totales de un dish a partir de sus ingredientes. */
export function computeDishTotals(ingredients: DishIngredient[]): Macros {
  return sumMacros(ingredients.map(i => i.macros))
}

/** Cambia los gramos de un ingrediente y recalcula sus macros al instante. */
export function setIngredientGrams(
  ingredients: DishIngredient[],
  index: number,
  grams: number
): DishIngredient[] {
  const current = ingredients[index]
  if (!current) { return ingredients }
  const food = getFood(current.foodId)
  if (!food) { return ingredients }
  const g = Math.max(0, Math.round(grams))
  const next = ingredients.slice()
  next[index] = { foodId: current.foodId, label: food.label, grams: g, macros: scaleMacros(food.per100, g) }
  return next
}

/** Quita un ingrediente del dish. */
export function removeIngredient(ingredients: DishIngredient[], index: number): DishIngredient[] {
  return ingredients.filter((_, i) => i !== index)
}

/** Quita un componente de una interpretación (usado por la pantalla de revisión). */
export { dropComponent, setComponentQuantity }

/** Vuelve a los ingredientes de un plato guardado en el diario, para editarlo. */
export function toDishIngredients(records: DiaryIngredientRecord[] | undefined): DishIngredient[] {
  if (!records || records.length === 0) { return [] }
  return records.map(r => {
    const foodId = r.foodId ?? findFoodByLabel(r.label)?.id ?? r.label
    // Si el alimento sigue en la tabla local se recalcula desde los gramos para
    // que editar una cantidad nunca deje macros viejos.
    const food = getFood(foodId)
    if (food) {
      return { foodId, label: food.label, grams: r.grams, macros: scaleMacros(food.per100, r.grams) }
    }
    return {
      foodId,
      label: r.label,
      grams: r.grams,
      macros: { calories: r.calories, proteins: r.proteins, carbs: r.carbs, fats: r.fats },
    }
  })
}

/** Reconstruye el borrador de una comida guardada. Null si no tiene ingredientes. */
export function dishFromEntry(entry: { name: string; ingredients?: DiaryIngredientRecord[] }): DishDraft | null {
  const ingredients = toDishIngredients(entry.ingredients)
  if (ingredients.length === 0) { return null }
  return {
    name: entry.name,
    ingredients,
    totals: computeDishTotals(ingredients),
    hasExplicitAmount: true,
  }
}

export { normalizeDishText, findFoodByLabel, getFood, FOODS }
