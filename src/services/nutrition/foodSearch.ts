// Búsqueda nutricional unificada.
//
// Orden de prioridad (el producto lo exige):
//   1. alimentos personalizados del usuario (Dexie)
//   2. catálogo local + recetas interpretables
//   3. proveedor externo (Open Food Facts) — OPCIONAL y tolerante a fallos
//   4. si no hay nada, la pantalla ofrece crear el alimento manualmente
//
// La búsqueda local NUNCA depende de la red: funciona offline. El proveedor
// externo solo se consulta de forma explícita desde la UI cuando el usuario
// pide "buscar en línea", y cualquier error de red se degrada a lista vacía
// (sin romper la pantalla ni filtrar claves).

import { allFoods, normalizeDishText, sumMacros, scaleMacros, getFood, type FoodBase, type Macros, type FoodExtras } from './foodComposition'
import { RECIPES, type Recipe } from './mealInterpretation'
import { usdaFoodsLoaded } from './usdaFoods'
import { listCustomFoods } from '@/services/storage/customFoodStore'

export type FoodSearchSource = 'custom' | 'catalog' | 'recipe' | 'external' | 'usda'

export interface FoodSearchResult {
  id: string
  label: string
  source: FoodSearchSource
  unit: 'g' | 'ml'
  /** macros por 100 g / 100 ml. Para recetas, un valor estimado por porción. */
  per100: Macros
  /** porción estándar sugerida (g) para precargar la cantidad. */
  standardGrams: number
  brand?: string
  state?: string
  /** nutrientes opcionales (fibra, azúcares, grasas específicas, sodio...). */
  extras?: FoodExtras
  /** porciones alternativas declaradas por la fuente (etiqueta + gramos). */
  portions?: Array<{ label: string; grams: number }>
  /** referencia de origen (fdcId de USDA, código de Open Food Facts...). */
  ref?: string
  /** presente solo en resultados de receta */
  recipe?: Recipe
  /** presente solo en resultados externos */
  externalCode?: string
}

/** Macros por 100 g estimados de una receta, sumando sus ingredientes. */
export function recipePer100(recipe: Recipe): { per100: Macros; grams: number } {
  let grams = 0
  const macros: Macros[] = []
  for (const item of recipe.items) {
    const food = getFood(item.foodId)
    if (!food) { continue }
    const g = item.units !== undefined ? item.units * (food.unitGrams ?? food.standardGrams) : (item.grams ?? food.standardGrams)
    grams += g
    macros.push(scaleMacros(food.per100, g))
  }
  const total = sumMacros(macros)
  const per100 = grams > 0 ? scaleMacros(total, 100 / grams) : { calories: 0, proteins: 0, carbs: 0, fats: 0 }
  return { per100, grams }
}

function foodToResult(food: FoodBase, source: FoodSearchSource): FoodSearchResult {
  return {
    id: food.id,
    label: food.label,
    source,
    unit: food.unit ?? 'g',
    per100: food.per100,
    standardGrams: food.standardGrams,
    brand: food.brand,
    state: food.state,
    extras: food.extras,
  }
}

function singularizeWord(w: string): string {
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) { return w.slice(0, -1) }
  return w
}

/**
 * Normaliza texto para BÚSQUEDA: minúsculas, sin acentos y sin plural, para que
 * "porotos" encuentre "poroto" y viceversa. No altera los alias almacenados.
 */
export function normalizeSearchText(text: string): string {
  return normalizeDishText(text).split(' ').map(singularizeWord).join(' ').trim()
}

/** Puntaje de un conjunto de candidatos: exacto(3) > prefijo(2) > contiene(1). */
function scoreOf(candidates: string[], q: string): number {
  let best = -1
  for (const c of candidates) {
    if (c === q) { best = Math.max(best, 3) }
    else if (c.startsWith(q)) { best = Math.max(best, 2) }
    else if (c.includes(q)) { best = Math.max(best, 1) }
  }
  return best
}

/**
 * Busca en el catálogo local (personalizados + base), en las recetas y en el
 * catálogo USDA ya cargado. Ranking determinístico: exacto > prefijo > contiene.
 * `limit` acota los resultados. No toca la red.
 *
 * El catálogo USDA se incluye SOLO si ya está cargado (`loadUsdaFoods()`), para
 * no forzar ~5 MB en cada búsqueda ni en tests que no lo necesitan. La pantalla
 * de búsqueda lo dispara al montarse.
 */
export async function searchFoodsLocal(query: string, limit = 25): Promise<FoodSearchResult[]> {
  const q = normalizeSearchText(query)
  if (!q) { return [] }

  const customIds = new Set((await listCustomFoods().catch(() => [])).map(f => f.id))

  const scored: Array<{ score: number; result: FoodSearchResult }> = []

  for (const food of allFoods()) {
    const best = scoreOf([normalizeSearchText(food.label), ...food.aliases.map(normalizeSearchText)], q)
    if (best < 0) { continue }
    // Un poco más de prioridad a los personalizados (el usuario los creó).
    const source: FoodSearchSource = customIds.has(food.id) ? 'custom' : 'catalog'
    scored.push({ score: best + (source === 'custom' ? 0.5 : 0), result: foodToResult(food, source) })
  }

  for (const recipe of RECIPES) {
    const best = scoreOf([normalizeSearchText(recipe.name), ...recipe.aliases.map(normalizeSearchText)], q)
    if (best < 0) { continue }
    const { per100, grams } = recipePer100(recipe)
    scored.push({
      score: best,
      result: {
        id: recipe.id,
        label: recipe.name,
        source: 'recipe',
        unit: 'g',
        per100,
        standardGrams: Math.round(grams) || 300,
        recipe,
      },
    })
  }

  // Catálogo USDA (cargado en diferido). Penalización fuerte para que el
  // catálogo curado en español gane siempre que exista un resultado razonable
  // (prefijo ⇒ 2), incluso ante un match exacto de USDA (3 − 1.5 = 1.5). Así el
  // dataset de 13k alimentos amplía la cobertura sin desplazar las referencias
  // curadas ni saturar la lista con variantes irrelevantes.
  for (const f of usdaFoodsLoaded()) {
    const best = scoreOf([normalizeSearchText(f.label), ...f.aliases.map(normalizeSearchText)], q)
    if (best < 0) { continue }
    scored.push({
      score: best - 1.5,
      result: {
        id: f.id,
        label: f.label,
        source: 'usda',
        unit: 'g',
        per100: f.per100,
        standardGrams: f.standardGrams,
        state: f.state,
        extras: f.extras,
        portions: f.portions,
        ref: String(f.fdcId),
      },
    })
  }

  return scored
    .sort((a, b) => b.score - a.score || a.result.label.localeCompare(b.result.label, 'es'))
    .slice(0, limit)
    .map(s => s.result)
}

// ── Proveedor externo (Open Food Facts) ─────────────────────────────────────
// Open Food Facts expone una API pública de lectura sin API key (licencia ODbL).
// Se usa SOLO como último recurso y de forma opt-in. Nunca se envía información
// del usuario: únicamente el texto de búsqueda.

const OFF_ENDPOINT = 'https://world.openfoodfacts.org/cgi/search.pl'
const EXTERNAL_CACHE = new Map<string, FoodSearchResult[]>()

/** Resultado detallado: distingue "sin resultados" de "falló el proveedor". */
export interface ExternalSearchOutcome {
  status: 'ok' | 'empty' | 'error'
  results: FoodSearchResult[]
  /** código HTTP cuando aplica (para explicar el fallo). */
  httpStatus?: number
  /** true cuando conviene reintentar más tarde (timeout, 5xx, 429, sin red). */
  retryable?: boolean
  /** mensaje breve y en español, ya listo para mostrar. */
  message?: string
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0
}

/** kcal por 100 g: usa energy-kcal_100g; si falta, deriva de energy_100g (kJ). */
function externalCalories(n: Record<string, unknown>): number {
  const kcal = num(n['energy-kcal_100g'])
  if (kcal > 0) { return kcal }
  const kj = num(n['energy_100g'])
  return kj > 0 ? Math.round((kj / 4.184) * 10) / 10 : 0
}

function mapProduct(p: Record<string, unknown>): FoodSearchResult | null {
  const name = String(p.product_name || '').trim()
  if (!name) { return null }
  const n = (p.nutriments || {}) as Record<string, unknown>
  const per100: Macros = {
    calories: externalCalories(n),
    proteins: num(n['proteins_100g']),
    carbs: num(n['carbohydrates_100g']),
    fats: num(n['fat_100g']),
  }
  const brand = String(p.brands || '').split(',')[0].trim() || undefined
  const code = String(p.code || '')
  const serving = num(p.serving_quantity)
  return {
    id: code ? `off-${code}` : `off-${name}`,
    label: brand ? `${name} (${brand})` : name,
    source: 'external',
    unit: 'g',
    per100,
    standardGrams: serving > 0 ? serving : 100,
    brand,
    externalCode: code || undefined,
    ref: code || undefined,
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Consulta Open Food Facts con información de estado.
 * - Distingue "sin resultados" ('empty') de un fallo del proveedor ('error').
 * - Reintenta UNA vez, con backoff, ante timeouts, 5xx, 429 o errores de red.
 * - Respeta el límite de consultas: es on-demand (nunca por pulsación de tecla).
 * - NUNCA lanza: degrada a un estado y deja la app funcionando.
 */
export async function searchExternalFoodsDetailed(
  query: string,
  limit = 15,
  timeoutMs = 6000,
  retries = 1,
): Promise<ExternalSearchOutcome> {
  const q = query.trim()
  if (!q) { return { status: 'empty', results: [] } }
  const key = q.toLowerCase()
  const cached = EXTERNAL_CACHE.get(key)
  if (cached) { return { status: cached.length ? 'ok' : 'empty', results: cached.slice(0, limit) } }

  if (typeof fetch !== 'function') {
    return { status: 'error', results: [], retryable: true, message: 'Sin conexión disponible.' }
  }

  const url = `${OFF_ENDPOINT}?search_terms=${encodeURIComponent(q)}`
    + `&search_simple=1&action=process&json=1&page_size=${limit}`
    + `&fields=code,product_name,brands,nutriments,serving_quantity`

  let last: ExternalSearchOutcome = { status: 'error', results: [], retryable: true, message: 'No se pudo consultar el proveedor.' }

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) { await delay(300 * attempt) }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)
      if (res.ok) {
        const data = await res.json() as { products?: Array<Record<string, unknown>> }
        const products = Array.isArray(data.products) ? data.products : []
        const results: FoodSearchResult[] = []
        for (const p of products) {
          const r = mapProduct(p)
          if (r) { results.push(r) }
        }
        EXTERNAL_CACHE.set(key, results)
        return { status: results.length ? 'ok' : 'empty', results }
      }
      // No ok: 4xx no se reintenta (salvo 429); 5xx sí.
      const retryable = res.status === 429 || res.status >= 500
      last = {
        status: 'error',
        results: [],
        httpStatus: res.status,
        retryable,
        message: res.status === 429
          ? 'El proveedor limitó las consultas. Probá en un momento.'
          : `El proveedor respondió ${res.status}.`,
      }
      if (!retryable) { return last }
    } catch {
      clearTimeout(timer)
      last = { status: 'error', results: [], retryable: true, message: 'Se agotó el tiempo de espera o no hay conexión.' }
    }
  }
  return last
}

/** Compatibilidad: devuelve solo los resultados (degradando a []). */
export async function searchExternalFoods(query: string, limit = 15, timeoutMs = 6000): Promise<FoodSearchResult[]> {
  return (await searchExternalFoodsDetailed(query, limit, timeoutMs)).results
}

/** Limpia la caché externa (tests). */
export function clearExternalCache(): void {
  EXTERNAL_CACHE.clear()
}
