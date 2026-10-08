// wgerNutritionClient — Cliente HTTP para endpoints de nutrición.
// FASE 11-13: Nutrición, valores nutricionales y recetas.
//
// WGER tiene su propio modelo nutricional. NO es equivalente al de Althea.
// La interpretación de lenguaje natural sigue siendo responsabilidad de Althea/IA.

import type { WgerListResponse } from '../wgerTypes'
import type {
  WgerIngredientListResponse,
  WgerIngredientInfo,
  WgerNutritionPlanListResponse,
  WgerNutritionPlan,
  WgerMealListResponse,
  WgerMealItemListResponse,
  WgerNutritionDiaryListResponse,
} from './types'

const BASE = 'https://wger.de/api/v2'

async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!res.ok) {throw new Error(`Wger ${res.status} ${url}`)}
  return res.json() as Promise<T>
}

// ─── Ingredients (CATÁLOGO) ───
// GET /ingredient/?id={id}

export function fetchIngredients(
  opts: { id?: number; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerIngredientListResponse> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.id) {params.set('id', String(opts.id))}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/ingredient/?${params}`, signal)
}

export function fetchIngredient(
  id: number,
  signal?: AbortSignal,
): Promise<WgerIngredientInfo> {
  return getJSON(`${BASE}/ingredient/${id}/?format=json`, signal)
}

// ─── Nutrition Plans (PLAN) ───
// GET /nutritionplan/?id={id}

export function fetchNutritionPlans(
  opts: { id?: number; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerNutritionPlanListResponse> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.id) {params.set('id', String(opts.id))}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/nutritionplan/?${params}`, signal)
}

export function fetchNutritionPlan(
  id: number,
  signal?: AbortSignal,
): Promise<WgerNutritionPlan> {
  return getJSON(`${BASE}/nutritionplan/${id}/?format=json`, signal)
}

// ─── Meals (COMIDA) ───
// GET /meal/?nutrition_plan={id}

export function fetchMeals(
  opts: { nutrition_plan?: number; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerMealListResponse> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.nutrition_plan) {params.set('nutrition_plan', String(opts.nutrition_plan))}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/meal/?${params}`, signal)
}

// ─── Meal Items (ITEM) ───
// GET /mealitem/?meal={id}

export function fetchMealItems(
  opts: { meal?: number; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerMealItemListResponse> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.meal) {params.set('meal', String(opts.meal))}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/mealitem/?${params}`, signal)
}

// ─── Nutrition Diary (REGISTRO) ───
// GET /nutritiondiary/?nutrition_plan={id}&date={date}

export function fetchNutritionDiary(
  opts: { nutrition_plan?: number; date?: string; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerNutritionDiaryListResponse> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.nutrition_plan) {params.set('nutrition_plan', String(opts.nutrition_plan))}
  if (opts.date) {params.set('date', opts.date)}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/nutritiondiary/?${params}`, signal)
}

// ─── Ingredient Sync ───
// GET /ingredient-sync/

export function fetchIngredientSync(
  signal?: AbortSignal,
): Promise<WgerListResponse<{ id: number; source_name: string; source_url: string }>> {
  return getJSON(`${BASE}/ingredient-sync/?format=json`, signal)
}
