// Catálogo USDA FoodData Central — carga diferida, offline, con procedencia.
//
// Los datos se derivan de los conjuntos descargables de USDA FoodData Central
// (Foundation Foods, FNDDS/Survey, SR Legacy), que son de dominio público (CC0).
// USDA solicita atribución; se conserva en `usdaMeta()`.
//
// Por qué un archivo aparte y no el catálogo curado:
// - Son ~13.000 alimentos: cargarlos en el bundle inicial sería un desperdicio.
//   Se cargan UNA vez, bajo demanda (primer búsqueda), y quedan en memoria.
//   El import es dinámico, así que Vite lo separa en su propio chunk.
// - NO se registran en el intérprete de texto (`allFoods`): alimentar 13k
//   entradas a `scanFoods` degradaría la interpretación. Solo participan de la
//   BÚSQUEDA local, donde el usuario elige explícitamente.
//
// Regla dura: un estado seco nunca se reutiliza como cocido. El `state` viene
// precalculado por el importador (scripts/import-usda.mjs) y es explícito.

import type { FoodExtras, Macros } from './foodComposition'

/** Registro compacto tal como lo emite scripts/import-usda.mjs. */
interface CompactFood {
  i: number
  d: 'f' | 'n' | 's'
  n: string
  a: string[]
  c?: string
  s?: string
  k?: number
  p?: number
  h?: number
  f?: number
  j?: number
  x?: { fb?: number; su?: number; as?: number; sf?: number; tf?: number; na?: number }
  po?: Array<[string, number]>
}

interface UsdaDataset {
  generatedAt: string
  license: string
  attribution: string
  sources: Array<{ code: string; dataType: string; release: string; url: string; foods: number }>
  count: number
  foods: CompactFood[]
}

export interface UsdaMeta {
  generatedAt: string
  license: string
  attribution: string
  sources: UsdaDataset['sources']
  count: number
}

/** Alimento USDA ya normalizado para la búsqueda (per 100 g, unit 'g'). */
export interface UsdaFood {
  id: string
  /** fdcId numérico de origen (procedencia). */
  fdcId: number
  label: string
  /** alias normalizados (sin acentos, minúsculas): inglés + traducción. */
  aliases: string[]
  source: 'usda'
  unit: 'g'
  per100: Macros
  standardGrams: number
  state?: string
  extras?: FoodExtras
  portions?: Array<{ label: string; grams: number }>
}

let cache: UsdaFood[] | null = null
let metaCache: UsdaMeta | null = null
let loading: Promise<UsdaFood[]> | null = null

function extrasOf(x: CompactFood['x']): FoodExtras | undefined {
  if (!x) { return undefined }
  const e: FoodExtras = {}
  if (typeof x.fb === 'number') { e.fiber = x.fb }
  if (typeof x.su === 'number') { e.sugars = x.su }
  if (typeof x.as === 'number') { e.addedSugars = x.as }
  if (typeof x.sf === 'number') { e.saturatedFat = x.sf }
  if (typeof x.tf === 'number') { e.transFat = x.tf }
  if (typeof x.na === 'number') { e.sodium = x.na }
  return Object.keys(e).length ? e : undefined
}

function toFood(r: CompactFood): UsdaFood {
  const per100: Macros = {
    calories: typeof r.k === 'number' ? r.k : 0,
    proteins: typeof r.p === 'number' ? r.p : 0,
    carbs: typeof r.h === 'number' ? r.h : 0,
    fats: typeof r.f === 'number' ? r.f : 0,
  }
  const portions = r.po?.map(([label, grams]) => ({ label, grams }))
  const standardGrams = portions && portions.length > 0 ? portions[0].grams : 100
  const extras = extrasOf(r.x)
  const food: UsdaFood = {
    id: `usda-${r.i}`,
    fdcId: r.i,
    label: r.n,
    aliases: r.a ?? [],
    source: 'usda',
    unit: 'g',
    per100,
    standardGrams,
  }
  if (r.s) { food.state = r.s }
  if (extras) { food.extras = extras }
  if (typeof r.j === 'number') { food.extras = { ...(food.extras ?? {}), energyKj: r.j } }
  if (portions && portions.length > 0) { food.portions = portions }
  return food
}

/**
 * Carga (una sola vez) el catálogo USDA. Es un import dinámico: Vite lo separa
 * en un chunk propio, así que no engorda el bundle inicial ni la pantalla de
 * Nutrición hasta que el usuario busca. Devuelve [] si el asset no está
 * disponible (la búsqueda local sigue funcionando con el catálogo curado).
 */
export async function loadUsdaFoods(): Promise<UsdaFood[]> {
  if (cache) { return cache }
  if (!loading) {
    loading = (async () => {
      try {
        // `?raw` evita que TypeScript infiera el tipo de un JSON de ~5 MB y
        // mantiene el archivo como un asset separado del bundle inicial.
        const mod = await import('../../data/foods/usda-foods.json?raw')
        const data = JSON.parse(mod.default) as UsdaDataset
        metaCache = {
          generatedAt: data.generatedAt,
          license: data.license,
          attribution: data.attribution,
          sources: data.sources,
          count: data.count,
        }
        cache = data.foods.map(toFood)
        return cache
      } catch {
        cache = []
        return cache
      }
    })()
  }
  return loading
}

/** Los alimentos USDA ya cargados, o [] si todavía no se cargaron. */
export function usdaFoodsLoaded(): UsdaFood[] {
  return cache ?? []
}

export function usdaLoaded(): boolean {
  return cache !== null
}

/** Procedencia y versión del dataset (para mostrarla en la UI). */
export function usdaMeta(): UsdaMeta | null {
  return metaCache
}

/** Solo para tests: limpia el cache en memoria. */
export function resetUsdaCache(): void {
  cache = null
  metaCache = null
  loading = null
}
