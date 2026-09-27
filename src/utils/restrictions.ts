import type { UserProfile } from '@/types'

/**
 * FASE 2 — S4 · Fuentes canónicas de restricciones.
 *
 * Antes de S4 el concepto "restricciones" estaba duplicado y mezclado:
 *  - `profile.restrictions`        →semántica de ENTRENAMIENTO (equipamiento,
 *    movimiento, ejercicios, tiempo, espacio) escrita por el onboarding.
 *  - `profile.nutritionPrefs.restrictions` → semántica NUTRICIONAL
 *    (vegano, sin gluten, alergias) escrita por Perfil.
 *
 * El defecto real era de ESCRITURA: `Perfil` escribía la misma lista
 * alimentaria en ambos campos, y los lectores de IA leían el campo de
 * entrenamiento como si fuera nutricional, de modo que una restricción de
 * equipamiento ("equipamiento", "tiempo") llegaba al Coach como si fuera
 * dietética.
 *
 * Reglas de S4 (no negociables):
 *  1. Un concepto = una fuente canónica. No se mezclan dominios.
 *  2. No hay fallback cruzado entre entrenamiento y nutrición: una
 *     restricción de entrenamiento JAMÁS se lee como nutricional.
 *  3. `profile.restrictions` queda como espejo legacy de solo escritura
 *     (onboarding). No tiene lectores: ver FASE_2_S4_REPORT.md.
 */

/** Perfil potencialmente parcial: los consumidores suelen pasar el perfil completo o null. */
type RestrictionSource = Partial<UserProfile> | Record<string, any> | null | undefined

/**
 * Normaliza a `string[]` sin inventar ni transformar valores: solo descarta
 * lo que no es un string utilizable, para que ningún prompt reciba
 * `undefined`, `null` o entradas vacías.
 */
function asList(value: unknown): string[] {
  if (!Array.isArray(value)) { return [] }
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
}

/**
 * ENTRENAMIENTO · Limitaciones y restricciones de entrenamiento.
 * Canónico: `profile.limitations` (superset que incluye las del onboarding
 * más el flag de dolor). Consumido por methodSelector, variantService y el
 * pipeline de Coach.
 */
export function getTrainingLimitations(profile: RestrictionSource): string[] {
  return asList(profile?.limitations)
}

/**
 * ENTRENAMIENTO · Zonas del cuerpo con dolor o lesión declaradas.
 * Canónico: `profile.painAreas`. No se fusiona con `limitations` porque su
 * semántica es anatómica, no de limitación.
 */
export function getPainAreas(profile: RestrictionSource): string[] {
  return asList(profile?.painAreas)
}

/**
 * ENTRENAMIENTO · Ids de ejercicios que el usuario excluyó.
 * Canónico: `profile.excludedExercises` (ids "biceps/barbell-curl").
 */
export function getExcludedExercises(profile: RestrictionSource): string[] {
  return asList(profile?.excludedExercises)
}

/**
 * NUTRICIÓN · Restricciones alimentarias.
 * Canónico: `profile.nutritionPrefs.restrictions`.
 *
 * SIN fallback a `profile.restrictions` a propósito: Perfil escribía ambos
 * campos con la misma lista, así que cuando el canónico está vacío y el
 * legacy tiene contenido, ese contenido es necesariamente del onboarding
 * (restricciones de entrenamiento). Leerlo aquí reintroduciría el bug que S4
 * elimina.
 */
export function getNutritionRestrictions(profile: RestrictionSource): string[] {
  return asList(profile?.nutritionPrefs?.restrictions)
}

/** NUTRICIÓN · Alergias e intolerancias. Canónico: `profile.nutritionPrefs.allergies`. */
export function getNutritionAllergies(profile: RestrictionSource): string[] {
  return asList(profile?.nutritionPrefs?.allergies)
}

/** NUTRICIÓN · Alimentos que no le gustan. Canónico: `profile.nutritionPrefs.dislikedFoods`. */
export function getNutritionDislikedFoods(profile: RestrictionSource): string[] {
  return asList(profile?.nutritionPrefs?.dislikedFoods)
}
