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
