// wgerRecipeComposer — Capa de composición de recetas.
// FASE 13: Recetas.
//
// Crea una capa de composición:
//   Recipe → IngredientReference[] → WGER ingredient → nutritional calculation → Althea recipe result
//
// Permite: receta completa, cantidad total, número de porciones, macros totales, macros por porción.
// No destruye la lógica nutricional existente de Althea.
// WGER debe actuar como fuente complementaria.

import type { Macros } from '@/services/nutrition/foodComposition'
import { sumMacros } from '@/services/nutrition/foodComposition'
import { getWgerIngredientValues, type WgerIngredientValuesResult } from './ingredientValues'

// ─── Tipos de receta ───

export interface IngredientReference {
  ingredientId: number
  amount: number
  unit: string
  notes?: string
}

export interface RecipeIngredient {
  reference: IngredientReference
  values: WgerIngredientValuesResult
}

export interface RecipeResult {
  id: string
  name: string
  ingredients: RecipeIngredient[]
  // Totales
  totalMacros: Macros
  totalWeightGrams: number
  // Por porción
  servings: number
  macrosPerServing: Macros
  weightPerServingGrams: number
  // Metadatos
  source: 'wger'
  createdAt: string
}

export interface RecipeCompositionOptions {
  name: string
  ingredients: IngredientReference[]
  servings?: number
}

// ─── Componer receta desde ingredientes WGER ───
export async function composeRecipe(
  options: RecipeCompositionOptions,
): Promise<RecipeResult | null> {
  const { name, ingredients, servings = 1 } = options

  if (ingredients.length === 0) {
    return null
  }

  // Obtener valores nutricionales de cada ingrediente
  const recipeIngredients: RecipeIngredient[] = []
  for (const ref of ingredients) {
    const values = await getWgerIngredientValues(ref.ingredientId, ref.amount, ref.unit)
    if (values) {
      recipeIngredients.push({ reference: ref, values })
    }
  }

  if (recipeIngredients.length === 0) {
    return null
  }

  // Calcular totales
  const totalMacros = sumMacros(recipeIngredients.map((ri) => ri.values.values))
  const totalWeightGrams = recipeIngredients.reduce(
    (sum, ri) => sum + ri.reference.amount,
    0,
  )

  // Calcular por porción
  const macrosPerServing: Macros = {
    calories: Math.round(totalMacros.calories / servings),
    proteins: Math.round((totalMacros.proteins / servings) * 10) / 10,
    carbs: Math.round((totalMacros.carbs / servings) * 10) / 10,
    fats: Math.round((totalMacros.fats / servings) * 10) / 10,
  }
  const weightPerServingGrams = Math.round(totalWeightGrams / servings)

  return {
    id: `wger-recipe-${Date.now()}`,
    name,
    ingredients: recipeIngredients,
    totalMacros,
    totalWeightGrams,
    servings,
    macrosPerServing,
    weightPerServingGrams,
    source: 'wger',
    createdAt: new Date().toISOString(),
  }
}

// ─── Componer receta desde texto libre (usa búsqueda WGER) ───
// NOTA: La interpretación de lenguaje natural sigue siendo responsabilidad de Althea/IA.
// Esta función solo procesa referencias de ingredientes ya identificadas.

export interface ParsedIngredient {
  name: string
  amount: number
  unit: string
  wgerIngredientId?: number
}

export async function composeRecipeFromParsed(
  name: string,
  parsedIngredients: ParsedIngredient[],
  servings: number = 1,
): Promise<RecipeResult | null> {
  const references: IngredientReference[] = []

  for (const parsed of parsedIngredients) {
    if (parsed.wgerIngredientId) {
      references.push({
        ingredientId: parsed.wgerIngredientId,
        amount: parsed.amount,
        unit: parsed.unit,
      })
    }
  }

  if (references.length === 0) {
    return null
  }

  return composeRecipe({ name, ingredients: references, servings })
}

// ─── Validar si un ingrediente WGER existe ───
export async function validateWgerIngredient(ingredientId: number): Promise<boolean> {
  try {
    const { fetchIngredient } = await import('./client')
    await fetchIngredient(ingredientId)
    return true
  } catch {
    return false
  }
}

// ─── Obtener información detallada de un ingrediente ───
export async function getIngredientDetails(ingredientId: number): Promise<{
  id: number
  name: string
  brand: string
  energy: number
  protein: number
  carbs: number
  fat: number
  sugar: number
  saturatedFat: number
  fiber: number
  sodium: number
  isVegan: boolean | null
  isVegetarian: boolean | null
  nutriscore: string | null
  weightUnits: Array<{ id: number; name: string; gram: number }>
} | null> {
  try {
    const { fetchIngredient } = await import('./client')
    const ingredient = await fetchIngredient(ingredientId)
    return {
      id: ingredient.id,
      name: ingredient.name,
      brand: ingredient.brand,
      energy: ingredient.energy,
      protein: parseFloat(ingredient.protein || '0'),
      carbs: parseFloat(ingredient.carbohydrates || '0'),
      fat: parseFloat(ingredient.fat || '0'),
      sugar: parseFloat(ingredient.carbohydrates_sugar || '0'),
      saturatedFat: parseFloat(ingredient.fat_saturated || '0'),
      fiber: parseFloat(ingredient.fiber || '0'),
      sodium: parseFloat(ingredient.sodium || '0'),
      isVegan: ingredient.is_vegan,
      isVegetarian: ingredient.is_vegetarian,
      nutriscore: ingredient.nutriscore,
      weightUnits: ingredient.weight_units.map((wu) => ({
        id: wu.id,
        name: wu.name,
        gram: wu.gram,
      })),
    }
  } catch (err) {
    console.warn(`Failed to get ingredient details for ${ingredientId}:`, err)
    return null
  }
}
