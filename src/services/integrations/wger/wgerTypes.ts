// Tipos crudos de la API REST Wger /api/v2/ — solo lo consumido por Althea.
// Referencia: https://wger.de/api/v2/
// Documentación de endpoints en wgerAdapter.ts (sección ENDPOINTS).

export interface WgerListResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface WgerMuscle {
  id: number
  name: string
  name_en: string
  is_front: boolean
  image_url_main: string
  image_url_secondary: string
}

export interface WgerEquipment {
  id: number
  name: string
}

export interface WgerCategory {
  id: number
  name: string
}

export interface WgerLicense {
  id: number
  full_name: string
  short_name: string
  url: string
}

export interface WgerTranslation {
  id: number
  uuid: string
  name: string
  exercise: number
  description: string
  description_source: string
  language: number
  aliases: string[]
  notes: string[]
}

export interface WgerExerciseListItem {
  id: number
  uuid: string
  created: string
  last_update: string
  category: number
  muscles: number[]
  muscles_secondary: number[]
  equipment: number[]
  variation_group: string | null
  license_author: string
}

export interface WgerExerciseInfo {
  id: number
  uuid: string
  created: string
  last_update: string
  category: WgerCategory
  muscles: WgerMuscle[]
  muscles_secondary: WgerMuscle[]
  equipment: WgerEquipment[]
  license: WgerLicense
  license_author: string
  images: WgerExerciseImage[]
  translations: WgerTranslation[]
  videos: unknown[]
}

export interface WgerExerciseImage {
  id: number
  uuid: string
  exercise: number
  image: string
  is_main: boolean
  style: string
  license: number
  license_title: string
  license_object_url: string
  license_author: string
  license_author_url: string
  license_derivative_source_url: string
}

export interface WgerIngredient {
  id: number
  uuid: string
  remote_id: string | null
  source_name: string
  source_url: string
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
  weight_units: WgerWeightUnit[]
  license: number
  license_title: string
  license_object_url: string
  license_author: string
  language: number
}

export interface WgerWeightUnit {
  id: number
  uuid: string
  ingredient: number
  gram: number
  name: string
}

// ─── Routine Types (FASE 5+) ───
export interface WgerRoutineListItem {
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

export interface WgerRoutineDetail extends WgerRoutineListItem {
  days: WgerDay[]
}

export interface WgerDay {
  id: number
  routine: number
  day: number
  name: string
  description: string | null
  order: number
  slots: WgerSlot[]
}

export interface WgerSlot {
  id: number
  day: number
  order: number
  comment: string | null
  entries: WgerSlotEntry[]
}

export interface WgerSlotEntry {
  id: number
  slot: number
  exercise: number
  order: number
  sets: number
  reps: number | null
  weight: number | null
  weight_unit: number | null
  repetition_unit: number | null
  rippetenz: number | null
  rest: number | null
  comment: string | null
}

export interface WgerWeightConfig {
  id: number
  slot_entry: number
  value: number
  unit: number
  iteration: number | null
}

export interface WgerRepetitionsConfig {
  id: number
  slot_entry: number
  value: number
  iteration: number | null
}

export interface WgerSetsConfig {
  id: number
  slot_entry: number
  value: number
  iteration: number | null
}

export interface WgerRirConfig {
  id: number
  slot_entry: number
  value: number
  iteration: number | null
}

export interface WgerRestConfig {
  id: number
  slot_entry: number
  value: number
  iteration: number | null
}

// ─── Vinculación externa (FASE 2) ───
// IDs externos y locales permanecen separados. Nunca usar ID de WGER como ID principal de Althea.

export interface ExternalAccountLink {
  id: string
  altheaUserId: string
  externalProvider: 'wger'
  externalUserId: string
  externalUsername: string
  linkedAt: string
  lastSyncAt: string | null
  status: 'active' | 'revoked'
}

export interface ExternalEntityLink {
  id: string
  altheaEntityId: string
  externalProvider: 'wger'
  externalEntityId: string
  externalEntityUuid: string
  entityType: 'exercise' | 'routine' | 'ingredient'
  linkedAt: string
  lastSyncAt: string | null
  metadata: Record<string, unknown>
}

// ─── Nutrition, Measurement y Stats types ───
// Se definen en sus sub-módulos respectivos para evitar conflictos:
//   - nutrition/types.ts (WgerIngredientInfo, WgerNutritionPlan, WgerMeal, WgerMealItem, WgerNutritionDiary)
//   - measurements/types.ts (WgerMeasurementCategory, WgerMeasurement)
//   - stats/types.ts (WgerRoutineStructure, WgerRoutineDateSequence, WgerRoutineStats)
