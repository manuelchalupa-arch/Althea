// wgerNutritionMapper — Convierte tipos WGER → modelo Althea.
// FASE 11: Nutrición. WGER tiene su propio modelo nutricional.
// NO asumir que WGER equivale directamente a la estructura de Nutrition de Althea.
//
// Mapeo de conceptos:
//   CATÁLOGO → ingredient (WgerIngredientInfo)
//   PLAN → nutrition plan (WgerNutritionPlan)
//   COMIDA → meal (WgerMeal)
//   ITEM → meal item (WgerMealItem)
//   REGISTRO → diary/log (WgerNutritionDiary)

import type { Macros } from '@/services/nutrition/foodComposition'
import type { DiaryEntry, DiaryIngredientRecord } from '@/services/storage/diaryStore'
import type {
  WgerIngredientInfo,
  WgerNutritionPlan,
  WgerMeal,
  WgerMealItem,
  WgerNutritionDiary,
} from './types'

// ─── Mapeo de valores nutricionales ───
// WGER devuelve valores por 100g. Althea usa el mismo formato.

export interface AltheaIngredientValues {
  id: string
  name: string
  brand: string
  per100: Macros
  // Campos adicionales de WGER
  sugar?: number
  saturatedFat?: number
  fiber?: number
  sodium?: number
  isVegan?: boolean
  isVegetarian?: boolean
  nutriscore?: string
  // Unidades de peso disponibles
  weightUnits: Array<{ id: number; name: string; gram: number }>
}

// ─── Convertir string | null → number ───
function parseNum(value: string | null): number {
  if (value === null) {return 0}
  const n = parseFloat(value)
  return isNaN(n) ? 0 : n
}

// ─── Mapear WgerIngredientInfo → AltheaIngredientValues ───
export function mapWgerIngredientToAlthea(ingredient: WgerIngredientInfo): AltheaIngredientValues {
  return {
    id: `wger-ingredient-${ingredient.id}`,
    name: ingredient.name,
    brand: ingredient.brand,
    per100: {
      calories: ingredient.energy,
      proteins: parseNum(ingredient.protein),
      carbs: parseNum(ingredient.carbohydrates),
      fats: parseNum(ingredient.fat),
    },
    sugar: parseNum(ingredient.carbohydrates_sugar),
    saturatedFat: parseNum(ingredient.fat_saturated),
    fiber: parseNum(ingredient.fiber),
    sodium: parseNum(ingredient.sodium),
    isVegan: ingredient.is_vegan ?? undefined,
    isVegetarian: ingredient.is_vegetarian ?? undefined,
    nutriscore: ingredient.nutriscore ?? undefined,
    weightUnits: ingredient.weight_units.map((wu) => ({
      id: wu.id,
      name: wu.name,
      gram: wu.gram,
    })),
  }
}

// ─── Mapear WgerNutritionPlan → Althea NutritionPlan ───
// Althea no tiene un modelo de "plan nutricional" equivalente.
// Se convierte en una referencia de metadatos.

export interface AltheaNutritionPlanRef {
  id: string
  source: 'wger'
  sourceId: number
  name: string
  description: string | null
  startDate: string | null
  endDate: string | null
  isActive: boolean
  isTemplate: boolean
  createdAt: string
  updatedAt: string
}

export function mapWgerNutritionPlanToAlthea(plan: WgerNutritionPlan): AltheaNutritionPlanRef {
  return {
    id: `wger-nutritionplan-${plan.id}`,
    source: 'wger',
    sourceId: plan.id,
    name: plan.name,
    description: plan.description,
    startDate: plan.start_date,
    endDate: plan.end_date,
    isActive: plan.is_active,
    isTemplate: plan.is_template,
    createdAt: plan.created,
    updatedAt: plan.last_update,
  }
}

// ─── Mapear WgerMeal → Althea MealRef ───
// Althea no tiene un modelo de "comida" equivalente.
// Se convierte en una referencia de metadatos.

export interface AltheaMealRef {
  id: string
  source: 'wger'
  sourceId: number
  nutritionPlanId: string
  order: number
  time: string | null
  name: string
}

export function mapWgerMealToAlthea(meal: WgerMeal): AltheaMealRef {
  return {
    id: `wger-meal-${meal.id}`,
    source: 'wger',
    sourceId: meal.id,
    nutritionPlanId: `wger-nutritionplan-${meal.nutrition_plan}`,
    order: meal.order,
    time: meal.time,
    name: meal.name,
  }
}

// ─── Mapear WgerMealItem → Althea MealItemRef ───
// Althea no tiene un modelo de "meal item" equivalente.
// Se convierte en una referencia de metadatos.

export interface AltheaMealItemRef {
  id: string
  source: 'wger'
  sourceId: number
  mealId: string
  ingredientId: string
  weightUnitId: number | null
  amount: number
  order: number
  ingredientName: string
  energy: number
  protein: number
  carbs: number
  fat: number
}

export function mapWgerMealItemToAlthea(item: WgerMealItem): AltheaMealItemRef {
  return {
    id: `wger-meal-item-${item.id}`,
    source: 'wger',
    sourceId: item.id,
    mealId: `wger-meal-${item.meal}`,
    ingredientId: `wger-ingredient-${item.ingredient}`,
    weightUnitId: item.weight_unit,
    amount: item.amount,
    order: item.order,
    ingredientName: item.ingredient_name,
    energy: item.ingredient_energy,
    protein: parseNum(item.ingredient_protein),
    carbs: parseNum(item.ingredient_carbohydrates),
    fat: parseNum(item.ingredient_fat),
  }
}

// ─── Mapear WgerNutritionDiary → Althea DiaryEntry ───
// Este es el mapeo más importante: convierte un registro de diario de WGER
// en un DiaryEntry de Althea.

export function mapWgerNutritionDiaryToAlthea(diary: WgerNutritionDiary): DiaryEntry {
  const macros: Macros = {
    calories: diary.ingredient_energy,
    proteins: parseNum(diary.ingredient_protein),
    carbs: parseNum(diary.ingredient_carbohydrates),
    fats: parseNum(diary.ingredient_fat),
  }

  const ingredient: DiaryIngredientRecord = {
    foodId: `wger-ingredient-${diary.ingredient}`,
    label: diary.ingredient_name,
    grams: diary.amount,
    calories: macros.calories,
    proteins: macros.proteins,
    carbs: macros.carbs,
    fats: macros.fats,
  }

  return {
    id: `wger-diary-${diary.id}`,
    date: diary.date,
    name: diary.ingredient_name,
    mealType: 'WGER Import',
    servingLabel: `${diary.amount}g`,
    amount: diary.amount,
    unit: 'g',
    macros,
    time: diary.time || undefined,
    ingredients: [ingredient],
    addedAt: new Date().toISOString(),
  }
}

// ─── Mapear lista de diary entries ───
export function mapWgerNutritionDiaryListToAlthea(diaryList: WgerNutritionDiary[]): DiaryEntry[] {
  return diaryList.map(mapWgerNutritionDiaryToAlthea)
}
