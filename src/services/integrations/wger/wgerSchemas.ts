// wgerSchemas — Validación de respuestas de la API WGER con Zod.
// FASE 27: Validación de respuestas.
//
// REGLAS:
// - No asumir que todos los endpoints mantienen exactamente los mismos tipos de ID.
// - WGER ha cambiado varios IDs a UUID/string (nutrición, sesiones, logs).
// - Validar contra el schema real antes de tipar.
// - Usar .passthrough() para permitir campos adicionales no documentados.

import { z } from 'zod'

// ─── ID flexible: number | string (UUID) ───
const wgerId = z.union([z.string(), z.number()])

// ─── Response list wrapper ───
export const WgerListResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(itemSchema),
  })

// ─── Exercise ───
export const WgerMuscleSchema = z.object({
  id: wgerId,
  name: z.string(),
  name_en: z.string(),
  is_front: z.boolean(),
  image_url_main: z.string(),
  image_url_secondary: z.string(),
}).passthrough()

export const WgerEquipmentSchema = z.object({
  id: wgerId,
  name: z.string(),
}).passthrough()

export const WgerCategorySchema = z.object({
  id: wgerId,
  name: z.string(),
}).passthrough()

export const WgerLicenseSchema = z.object({
  id: wgerId,
  full_name: z.string(),
  short_name: z.string(),
  url: z.string(),
}).passthrough()

export const WgerTranslationSchema = z.object({
  id: wgerId,
  uuid: z.string(),
  name: z.string(),
  exercise: wgerId,
  description: z.string(),
  description_source: z.string(),
  language: z.number(),
  aliases: z.array(z.string()),
  notes: z.array(z.string()),
}).passthrough()

export const WgerExerciseListItemSchema = z.object({
  id: wgerId,
  uuid: z.string(),
  created: z.string(),
  last_update: z.string(),
  category: wgerId,
  muscles: z.array(wgerId),
  muscles_secondary: z.array(wgerId),
  equipment: z.array(wgerId),
  variation_group: z.string().nullable(),
  license_author: z.string(),
}).passthrough()

export const WgerExerciseInfoSchema = z.object({
  id: wgerId,
  uuid: z.string(),
  created: z.string(),
  last_update: z.string(),
  category: WgerCategorySchema,
  muscles: z.array(WgerMuscleSchema),
  muscles_secondary: z.array(WgerMuscleSchema),
  equipment: z.array(WgerEquipmentSchema),
  license: WgerLicenseSchema,
  license_author: z.string(),
  images: z.array(z.unknown()),
  translations: z.array(WgerTranslationSchema),
  videos: z.array(z.unknown()),
}).passthrough()

// ─── Routine ───
export const WgerRoutineListItemSchema = z.object({
  id: wgerId,
  uuid: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  created: z.string(),
  last_update: z.string(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  is_active: z.boolean(),
  is_template: z.boolean(),
}).passthrough()

export const WgerDaySchema = z.object({
  id: wgerId,
  routine: wgerId,
  day: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  order: z.number(),
  slots: z.array(z.unknown()),
}).passthrough()

export const WgerSlotSchema = z.object({
  id: wgerId,
  day: wgerId,
  order: z.number(),
  comment: z.string().nullable(),
  entries: z.array(z.unknown()),
}).passthrough()

export const WgerSlotEntrySchema = z.object({
  id: wgerId,
  slot: wgerId,
  exercise: wgerId,
  order: z.number(),
  sets: z.number(),
  reps: z.number().nullable(),
  weight: z.number().nullable(),
  weight_unit: wgerId.nullable(),
  repetition_unit: wgerId.nullable(),
  rippetenz: z.number().nullable(),
  rest: z.number().nullable(),
  comment: z.string().nullable(),
}).passthrough()

export const WgerWeightConfigSchema = z.object({
  id: wgerId,
  slot_entry: wgerId,
  value: z.number(),
  unit: wgerId,
  iteration: z.number().nullable(),
}).passthrough()

export const WgerRepetitionsConfigSchema = z.object({
  id: wgerId,
  slot_entry: wgerId,
  value: z.number(),
  iteration: z.number().nullable(),
}).passthrough()

export const WgerSetsConfigSchema = z.object({
  id: wgerId,
  slot_entry: wgerId,
  value: z.number(),
  iteration: z.number().nullable(),
}).passthrough()

export const WgerRirConfigSchema = z.object({
  id: wgerId,
  slot_entry: wgerId,
  value: z.number(),
  iteration: z.number().nullable(),
}).passthrough()

export const WgerRestConfigSchema = z.object({
  id: wgerId,
  slot_entry: wgerId,
  value: z.number(),
  iteration: z.number().nullable(),
}).passthrough()

// ─── Workout Session ───
export const WgerWorkoutSessionSchema = z.object({
  id: wgerId,
  uuid: z.string(),
  workout: wgerId,
  date: z.string(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  notes: z.string().nullable(),
  impression: z.union([z.literal('1'), z.literal('2'), z.literal('3')]).nullable(),
  time_start: z.string().nullable(),
  time_end: z.string().nullable(),
  created: z.string(),
  last_update: z.string(),
}).passthrough()

// ─── Workout Log ───
export const WgerWorkoutLogSchema = z.object({
  id: wgerId,
  uuid: z.string(),
  workout_session: wgerId,
  exercise: wgerId,
  exercise_name: z.string(),
  repetition_unit: wgerId,
  repetition_unit_name: z.string(),
  weight_unit: wgerId,
  weight_unit_name: z.string(),
  weight: z.number().nullable(),
  repetitions: z.number(),
  rippetenz: z.number().nullable(),
  order: z.number(),
  comment: z.string().nullable(),
  created: z.string(),
  last_update: z.string(),
}).passthrough()

// ─── Nutrition ───
export const WgerIngredientSchema = z.object({
  id: wgerId,
  uuid: z.string(),
  code: z.string(),
  name: z.string(),
  common_name: z.string(),
  brand: z.string(),
  energy: z.number(),
  protein: z.string().nullable(),
  carbohydrates: z.string().nullable(),
  carbohydrates_sugar: z.string().nullable(),
  fat: z.string().nullable(),
  fat_saturated: z.string().nullable(),
  fiber: z.string().nullable(),
  sodium: z.string().nullable(),
  is_vegan: z.boolean().nullable(),
  is_vegetarian: z.boolean().nullable(),
  nutriscore: z.string().nullable(),
  weight_units: z.array(z.object({
    id: wgerId,
    uuid: z.string(),
    ingredient: wgerId,
    gram: z.number(),
    name: z.string(),
  }).passthrough()),
  license: wgerId,
  license_title: z.string(),
  license_object_url: z.string(),
  license_author: z.string(),
  language: z.number(),
}).passthrough()

export const WgerNutritionPlanSchema = z.object({
  id: wgerId,
  uuid: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  created: z.string(),
  last_update: z.string(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  is_active: z.boolean(),
  is_template: z.boolean(),
}).passthrough()

export const WgerMealSchema = z.object({
  id: wgerId,
  nutrition_plan: wgerId,
  order: z.number(),
  time: z.string().nullable(),
  name: z.string(),
}).passthrough()

export const WgerMealItemSchema = z.object({
  id: wgerId,
  meal: wgerId,
  ingredient: wgerId,
  weight_unit: wgerId.nullable(),
  amount: z.number(),
  order: z.number(),
  ingredient_name: z.string(),
  ingredient_energy: z.number(),
  ingredient_protein: z.string().nullable(),
  ingredient_carbohydrates: z.string().nullable(),
  ingredient_fat: z.string().nullable(),
}).passthrough()

// ─── Measurement ───
export const WgerMeasurementCategorySchema = z.object({
  id: wgerId,
  name: z.string(),
  unit: z.string(),
}).passthrough()

export const WgerMeasurementSchema = z.object({
  id: wgerId,
  category: wgerId,
  category_name: z.string(),
  date: z.string(),
  value: z.number(),
  unit: z.string(),
  notes: z.string().nullable(),
}).passthrough()

// ─── Training Plan ───
export const WgerTrainingPlanSchema = z.object({
  id: wgerId,
  uuid: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  created: z.string(),
  last_update: z.string(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  is_active: z.boolean(),
  is_template: z.boolean(),
}).passthrough()

export const WgerSetConfigSchema = z.object({
  id: wgerId,
  training_plan: wgerId,
  exercise: wgerId,
  order: z.number(),
  sets: z.number(),
  reps: z.number().nullable(),
  weight: z.number().nullable(),
  weight_unit: wgerId.nullable(),
  repetition_unit: wgerId.nullable(),
  rippetenz: z.number().nullable(),
  rest: z.number().nullable(),
  comment: z.string().nullable(),
}).passthrough()

export const WgerProgressionConfigSchema = z.object({
  id: wgerId,
  training_plan: wgerId,
  exercise: wgerId,
  progression_type: z.enum(['weight', 'reps', 'sets', 'rir', 'rest', 'max', 'min']),
  progression_mode: z.enum(['absolute', 'percentage', 'fixed']),
  value: z.number(),
  min_value: z.number().nullable(),
  max_value: z.number().nullable(),
  step: z.number().nullable(),
  condition: z.string().nullable(),
  iteration: z.number().nullable(),
  comment: z.string().nullable(),
}).passthrough()

// ─── Type exports ───
export type WgerMuscle = z.infer<typeof WgerMuscleSchema>
export type WgerEquipment = z.infer<typeof WgerEquipmentSchema>
export type WgerCategory = z.infer<typeof WgerCategorySchema>
export type WgerLicense = z.infer<typeof WgerLicenseSchema>
export type WgerTranslation = z.infer<typeof WgerTranslationSchema>
export type WgerExerciseListItem = z.infer<typeof WgerExerciseListItemSchema>
export type WgerExerciseInfo = z.infer<typeof WgerExerciseInfoSchema>
export type WgerRoutineListItem = z.infer<typeof WgerRoutineListItemSchema>
export type WgerDay = z.infer<typeof WgerDaySchema>
export type WgerSlot = z.infer<typeof WgerSlotSchema>
export type WgerSlotEntry = z.infer<typeof WgerSlotEntrySchema>
export type WgerWeightConfig = z.infer<typeof WgerWeightConfigSchema>
export type WgerRepetitionsConfig = z.infer<typeof WgerRepetitionsConfigSchema>
export type WgerSetsConfig = z.infer<typeof WgerSetsConfigSchema>
export type WgerRirConfig = z.infer<typeof WgerRirConfigSchema>
export type WgerRestConfig = z.infer<typeof WgerRestConfigSchema>
export type WgerWorkoutSession = z.infer<typeof WgerWorkoutSessionSchema>
export type WgerWorkoutLog = z.infer<typeof WgerWorkoutLogSchema>
export type WgerIngredient = z.infer<typeof WgerIngredientSchema>
export type WgerNutritionPlan = z.infer<typeof WgerNutritionPlanSchema>
export type WgerMeal = z.infer<typeof WgerMealSchema>
export type WgerMealItem = z.infer<typeof WgerMealItemSchema>
export type WgerMeasurementCategory = z.infer<typeof WgerMeasurementCategorySchema>
export type WgerMeasurement = z.infer<typeof WgerMeasurementSchema>
export type WgerTrainingPlan = z.infer<typeof WgerTrainingPlanSchema>
export type WgerSetConfig = z.infer<typeof WgerSetConfigSchema>
export type WgerProgressionConfig = z.infer<typeof WgerProgressionConfigSchema>
