// wgerIngredientValues — Obtiene valores nutricionales de ingredientes WGER.
// FASE 12: Valores nutricionales.
//
// Aprovecha: energía, proteína, carbohidratos, azúcar, grasas, grasas saturadas, fibra, sodio.
// Normaliza el resultado al modelo nutricional de Althea.
//
// WGER NO será el responsable de interpretar lenguaje natural.
// La interpretación de la receta continúa siendo responsabilidad de Althea/IA.

import type { Macros } from '@/services/nutrition/foodComposition'
import { fetchIngredient } from './client'
import { mapWgerIngredientToAlthea, type AltheaIngredientValues } from './mapper'

export interface WgerIngredientValuesResult {
  id: string
  name: string
  brand: string
  amount: number
  unit: string
  // Valores para la cantidad solicitada
  values: Macros
  // Valores adicionales
  sugar: number
  saturatedFat: number
  fiber: number
  sodium: number
  // Metadatos
  isVegan?: boolean
  isVegetarian?: boolean
  nutriscore?: string
  // Unidades de peso disponibles
  weightUnits: Array<{ id: number; name: string; gram: number }>
}

// ─── Obtener valores nutricionales de un ingrediente WGER ───
// amount: cantidad en gramos
// unit: unidad de medida (actualmente solo se soporta 'g')
export async function getWgerIngredientValues(
  ingredientId: number,
  amount: number,
  unit: string = 'g',
): Promise<WgerIngredientValuesResult | null> {
  try {
    const ingredient = await fetchIngredient(ingredientId)
    const altheaIngredient = mapWgerIngredientToAlthea(ingredient)

    // WGER devuelve valores por 100g. Escalar a la cantidad solicitada.
    const factor = amount / 100

    const values: Macros = {
      calories: Math.round(altheaIngredient.per100.calories * factor),
      proteins: Math.round(altheaIngredient.per100.proteins * factor * 10) / 10,
      carbs: Math.round(altheaIngredient.per100.carbs * factor * 10) / 10,
      fats: Math.round(altheaIngredient.per100.fats * factor * 10) / 10,
    }

    return {
      id: altheaIngredient.id,
      name: altheaIngredient.name,
      brand: altheaIngredient.brand,
      amount,
      unit,
      values,
      sugar: Math.round((altheaIngredient.sugar || 0) * factor * 10) / 10,
      saturatedFat: Math.round((altheaIngredient.saturatedFat || 0) * factor * 10) / 10,
      fiber: Math.round((altheaIngredient.fiber || 0) * factor * 10) / 10,
      sodium: Math.round((altheaIngredient.sodium || 0) * factor * 10) / 10,
      isVegan: altheaIngredient.isVegan,
      isVegetarian: altheaIngredient.isVegetarian,
      nutriscore: altheaIngredient.nutriscore,
      weightUnits: altheaIngredient.weightUnits,
    }
  } catch (err) {
    console.warn(`Failed to get WGER ingredient values for ${ingredientId}:`, err)
    return null
  }
}

// ─── Buscar ingredientes por nombre ───
export async function searchWgerIngredients(
  query: string,
  limit: number = 20,
): Promise<AltheaIngredientValues[]> {
  try {
    const { fetchIngredients } = await import('./client')
    const response = await fetchIngredients({ limit })
    const ingredients = response.results.filter(
      (i) =>
        i.name.toLowerCase().includes(query.toLowerCase()) ||
        i.common_name.toLowerCase().includes(query.toLowerCase()),
    )
    return ingredients.map(mapWgerIngredientToAlthea)
  } catch (err) {
    console.warn(`Failed to search WGER ingredients for "${query}":`, err)
    return []
  }
}

// ─── Obtener ingrediente por ID ───
export async function getWgerIngredient(
  ingredientId: number,
): Promise<AltheaIngredientValues | null> {
  try {
    const ingredient = await fetchIngredient(ingredientId)
    return mapWgerIngredientToAlthea(ingredient)
  } catch (err) {
    console.warn(`Failed to get WGER ingredient ${ingredientId}:`, err)
    return null
  }
}
