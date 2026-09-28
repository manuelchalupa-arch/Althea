// FASE 16 — Comparación Wger vs fuente actual de ejercicios.
// Datos obtenidos de ambas APIs. NO eliminar nada hasta decidir.

/**
 * COMPARACIÓN DE COBERTURA
 *
 * Fuente actual: ExerciseGymGifsDB (jsDelivr CDN)
 *   - URL: https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@v1.1.0
 *   - Ejercicios: 1323
 *   - Idioma: español (nombres e instrucciones)
 *   - GIFs: sí (CDN directo)
 *   - Instrucciones: 5 pasos detallados por ejercicio
 *   - Licencia: repositorio GitHub (verificar)
 *   - IDs: string ("abs/3-4-sit-up")
 *
 * Wger:
 *   - URL: https://wger.de/api/v2/
 *   - Ejercicios: 912
 *   - Idioma: inglés (con traducciones ES disponibles)
 *   - GIFs: no (imágenes SVG/estáticas de músculos)
 *   - Descripciones: variable (HTML, longitud variada)
 *   - Licencia: CC-BY-SA 4.0 (por ejercicio)
 *   - IDs: numérico (9, 12, 15...)
 *   - Ingredientes: 3,063,298 (Open Food Facts)
 *   - Músculos: 15 (con anatomía SVG)
 *   - Equipamiento: 12
 */

export interface SourceComparison {
  source: string
  exerciseCount: number
  language: string
  hasGifs: boolean
  hasInstructions: boolean
  hasLicense: boolean
  licenseType: string
  idFormat: string
  strengths: string[]
  weaknesses: string[]
}

export const CURRENT_SOURCE: SourceComparison = {
  source: 'ExerciseGymGifsDB',
  exerciseCount: 1323,
  language: 'español',
  hasGifs: true,
  hasInstructions: true,
  hasLicense: false,
  licenseType: 'no documentada en API',
  idFormat: 'string (muscle/slug)',
  strengths: [
    '1323 ejercicios (vs 912 Wger)',
    'Nombres e instrucciones en español nativo',
    'GIFs animados por CDN',
    'Instrucciones consistentes (5 pasos)',
    'IDs legibles para humanos',
    'Funciona offline via Workbox cache',
    'Sin dependencia de API externa en runtime',
  ],
  weaknesses: [
    'Sin licencia documentada por ejercicio',
    'Sin datos de ingredientes/nutrición',
    'Sin imágenes anatómicas de músculos',
    'Repositorio de terceros (mantenimiento no garantizado)',
    'Sin API de traducción',
    'Sin código de barras ni Open Food Facts',
  ],
}

export const WGER_SOURCE: SourceComparison = {
  source: 'Wger',
  exerciseCount: 912,
  language: 'inglés (traducciones ES disponibles)',
  hasGifs: false,
  hasInstructions: true,
  hasLicense: true,
  licenseType: 'CC-BY-SA 4.0',
  idFormat: 'numérico (9, 12, 15...)',
  strengths: [
    'Licencia clara CC-BY-SA 4.0 por ejercicio',
    '3M+ ingredientes con macros (Open Food Facts)',
    'Imágenes anatómicas SVG de músculos',
    'Traducciones multiidioma (ES/EN)',
    'Código de barras para alimentos',
    'API REST documentada y estable',
    'Datos de licencia y autoría por registro',
    'Nutriscore para ingredientes',
  ],
  weaknesses: [
    '912 ejercicios (vs 1323 actual)',
    'Sin GIFs animados',
    'Nombres en inglés (requiere traducción)',
    'Descripciones inconsistentes (HTML variable)',
    'IDs numéricos (no legibles)',
    'Requiere Internet para primera carga',
    'Rate limiting posible',
    'Menos ejercicios de stretching/cardio',
  ],
}

/**
 * DECISIÓN FASE 16:
 *
 * Ambas fuentes se CONSERVAN. Ninguna se retira.
 *
 * Razones:
 * 1. ExerciseGym tiene +411 ejercicios y GIFs → no se puede retirar
 * 2. Wger tiene licencia CC-BY-SA y 3M ingredientes → complementa
 * 3. Son complementarias: ExerciseGym para biblioteca, Wger para nutrición
 * 4. No hay evidencia de que Wger cubra todo lo que ExerciseGym cubre
 *
 * Arquitectura resultante:
 * - ExerciseGym = fuente principal de ejercicios (biblioteca)
 * - Wger = fuente externa de enriquecimiento (ingredientes + ejercicios adicionales)
 * - Ambas cacheadas en Dexie para offline
 * - customExercises = independiente de ambas
 */
export const DECISION = {
  decision: 'MANTENER_AMBAS',
  rationale: 'Wger no cubre los 1323 ejercicios ni los GIFs de ExerciseGym. ExerciseGym no tiene ingredientes ni licencia por ejercicio. Son complementarias.',
  exerciseSource: 'ExerciseGym (principal) + Wger (enriquecimiento)',
  nutritionSource: 'API actual (principal) + Wger ingredients (adicional, pendiente comparación)',
  noRetirement: 'Ninguna fuente se retira en esta fase.',
} as const

/**
 * Cobertura comparativa por categoría de datos:
 */
export const COVERAGE = {
  exercises: { current: 1323, wger: 912, verdict: 'current_wins' },
  spanishNames: { current: 'nativo', wger: 'traducido', verdict: 'current_wins' },
  gifs: { current: 'sí', wger: 'no', verdict: 'current_wins' },
  instructions: { current: '5 pasos consistentes', wger: 'variable HTML', verdict: 'current_wins' },
  license: { current: 'no documentada', wger: 'CC-BY-SA 4.0', verdict: 'wger_wins' },
  ingredients: { current: 'no', wger: '3,063,298', verdict: 'wger_wins' },
  muscleImages: { current: 'no', wger: 'SVG anatómico', verdict: 'wger_wins' },
  barcodeSearch: { current: 'no', wger: 'sí (Open Food Facts)', verdict: 'wger_wins' },
  offline: { current: 'Workbox cache', wger: 'requiere sync previa', verdict: 'current_wins' },
} as const
