// Tipos crudos de la API REST Wger /api/v2/ — nutrición.
// Referencia: https://wger.de/api/v2/
// FASE 11-13: Nutrición, valores nutricionales y recetas.
//
// WGER tiene su propio modelo nutricional. NO es equivalente al de Althea.
// CATÁLOGO → ingredient, PLAN → nutrition plan, COMIDA → meal, ITEM → meal item, REGISTRO → diary/log

import type { WgerListResponse } from '../wgerTypes'

export interface WgerIngredientInfo {
  id: number
  uuid: string
  code: string
  name: string
  common_name: string
  brand: string
  energy: number
  protein: string | null
  carbohydrates: string | null
  carbohydrates_sugar: string | null
  fat: string | null
  fat_saturated: string | null
  fiber: string | null
  sodium: string | null
  is_vegan: boolean | null
  is_vegetarian: boolean | null
  nutriscore: string | null
  weight_units: Array<{
    id: number
    uuid: string
    ingredient: number
    gram: number
    name: string
  }>
  license: number
  license_title: string
  license_object_url: string
  license_author: string
  language: number
}

export interface WgerNutritionPlan {
  id: number
  uuid: string
  name: string
  description: string | null
  created: string
  last_update: string
  start_date: string | null
  end_date: string | null
  is_active: boolean
  is_template: boolean
}

export interface WgerMeal {
  id: number
  nutrition_plan: number
  order: number
  time: string | null
  name: string
}

export interface WgerMealItem {
  id: number
  meal: number
  ingredient: number
  weight_unit: number | null
  amount: number
  order: number
  ingredient_name: string
  ingredient_energy: number
  ingredient_protein: string | null
  ingredient_carbohydrates: string | null
  ingredient_fat: string | null
}

export interface WgerNutritionDiary {
  id: number
  nutrition_plan: number
  ingredient: number
  weight_unit: number | null
  amount: number
  date: string
  time: string | null
  meal: number | null
  ingredient_name: string
  ingredient_energy: number
  ingredient_protein: string | null
  ingredient_carbohydrates: string | null
  ingredient_fat: string | null
}

export interface WgerIngredientListResponse extends WgerListResponse<WgerIngredientInfo> {}
export interface WgerNutritionPlanListResponse extends WgerListResponse<WgerNutritionPlan> {}
export interface WgerMealListResponse extends WgerListResponse<WgerMeal> {}
export interface WgerMealItemListResponse extends WgerListResponse<WgerMealItem> {}
export interface WgerNutritionDiaryListResponse extends WgerListResponse<WgerNutritionDiary> {}
