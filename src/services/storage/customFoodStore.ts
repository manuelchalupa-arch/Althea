// Alimentos personalizados — altas manuales del usuario con macros propios.
//
// Fuente de verdad de los alimentos que el usuario crea a mano cuando no
// encuentra el alimento en el catálogo ni en las recetas. Se persisten en Dexie
// (tabla `customFoods`, schema v26) y se inyectan en el intérprete vía
// `registerExtraFoods` para que la búsqueda y el cálculo por gramos los traten
// igual que cualquier alimento del catálogo.
//
// Reglas del producto:
// - La carga puede ser por 100 g, por 100 ml o por porción. Internamente SIEMPRE
//   se normaliza a `per100` (porción → per100 con el peso de la porción) para que
//   el cálculo por gramos sea uniforme y no se mezclen bases.
// - Un campo vacío NO es 0: el usuario debe escribir 0 explícito si quiere cero.
// - Los macros se guardan como snapshot en cada DiaryEntry al confirmar la
//   comida; editar o borrar un alimento personalizado NO reescribe el historial.

import { normFold } from '@/utils/format'
import { db } from '@/services/storage/db'
import {
  registerExtraFoods,
  type FoodBase,
  type FoodCategory,
  type FoodExtras,
  type FoodState,
  type Macros,
} from '@/services/nutrition/foodComposition'

export type CustomFoodBasis = 'per100g' | 'per100ml' | 'perServing'

/** Macros tal como los cargó el usuario en la base elegida. */
export interface CustomFoodMacros {
  calories: number
  proteins: number
  carbs: number
  fats: number
}

/** Porción alternativa declarada por el usuario (etiqueta + gramos). */
export interface CustomPortion {
  label: string
  grams: number
}

export interface CustomFood {
  id: string
  name: string
  brand?: string
  category?: FoodCategory
  state?: FoodState
  /** base de carga elegida por el usuario. */
  basis: CustomFoodBasis
  /** peso/volumen de UNA porción (g o ml). Requerido si basis === 'perServing'. */
  servingGrams?: number
  /** macros normalizados a per100 (g o ml). Es lo que usa el cálculo. */
  per100: CustomFoodMacros
  /** macros tal como los cargó el usuario, para trazabilidad/edición. */
  entered: CustomFoodMacros
  /**
   * Nutrientes OPCIONALES normalizados a per100 (fibra, azúcares, grasas
   * saturadas/trans, sodio). Un nutriente desconocido queda AUSENTE, nunca 0.
   */
  extras?: FoodExtras
  /** código de barras, si la etiqueta lo trae. */
  barcode?: string
  /** porciones alternativas declaradas por la etiqueta. */
  portions?: CustomPortion[]
  /** sinónimos normalizados (sin acentos, minúsculas) para interpretar texto. */
  aliases: string[]
  unit: 'g' | 'ml'
  source: string
  createdAt: string
  updatedAt: string
}

/** Entrada del formulario. `null` en un macro significa "campo vacío" (≠ 0). */
export interface CustomFoodInput {
  name: string
  brand?: string
  category?: FoodCategory
  state?: FoodState
  basis: CustomFoodBasis
  unit?: 'g' | 'ml'
  calories: number | null
  proteins: number | null
  carbs: number | null
  fats: number | null
  servingGrams?: number | null
  aliases?: string[]
  /** nutrientes opcionales; `null`/vacío = desconocido (no es 0). */
  fiber?: number | null
  sugars?: number | null
  addedSugars?: number | null
  saturatedFat?: number | null
  transFat?: number | null
  sodium?: number | null
  salt?: number | null
  energyKj?: number | null
  barcode?: string
  portions?: CustomPortion[]
}

export const DEFAULT_LABELS: Record<CustomFoodBasis, string> = {
  per100g: 'por 100 g',
  per100ml: 'por 100 ml',
  perServing: 'por porción',
}

const round1 = (n: number) => Math.round(n * 10) / 10

function isBlankField(n: number | null | undefined): boolean {
  return n === null || n === undefined || (typeof n === 'number' && Number.isNaN(n))
}

/** Valida la entrada. Devuelve la lista de errores (vacía = válida). */
export function validateCustomFoodInput(input: CustomFoodInput): string[] {
  const errs: string[] = []
  if (!input.name || !input.name.trim()) { errs.push('El nombre es obligatorio') }
  if (!input.basis) { errs.push('Elegí la base de cálculo') }

  const macros: Array<[keyof Pick<CustomFoodInput, 'calories' | 'proteins' | 'carbs' | 'fats'>, string]> = [
    ['calories', 'Calorías'],
    ['proteins', 'Proteínas'],
    ['carbs', 'Carbohidratos'],
    ['fats', 'Grasas'],
  ]
  for (const [key, label] of macros) {
    const v = input[key]
    if (isBlankField(v)) { errs.push(`${label}: campo vacío (escribí 0 si corresponde)`); continue }
    if (!Number.isFinite(v) || (v as number) < 0) { errs.push(`${label}: debe ser un número ≥ 0`) }
  }

  if (input.basis === 'perServing') {
    const s = input.servingGrams
    if (isBlankField(s)) { errs.push('Peso de la porción: campo vacío') }
    else if (!Number.isFinite(s) || (s as number) <= 0) { errs.push('Peso de la porción: debe ser mayor a 0') }
  }

  // Nutrientes OPCIONALES: vacío = desconocido (válido). Si se completa, debe ser
  // un número ≥ 0. Nunca se rellena con 0 ficticio.
  const optional: Array<[keyof Pick<CustomFoodInput, 'fiber' | 'sugars' | 'addedSugars' | 'saturatedFat' | 'transFat' | 'sodium' | 'salt' | 'energyKj'>, string]> = [
    ['fiber', 'Fibra'],
    ['sugars', 'Azúcares'],
    ['addedSugars', 'Azúcares añadidos'],
    ['saturatedFat', 'Grasas saturadas'],
    ['transFat', 'Grasas trans'],
    ['sodium', 'Sodio'],
    ['salt', 'Sal'],
    ['energyKj', 'Energía (kJ)'],
  ]
  for (const [key, label] of optional) {
    const v = input[key]
    if (isBlankField(v)) { continue }
    if (!Number.isFinite(v) || (v as number) < 0) { errs.push(`${label}: debe ser un número ≥ 0`) }
  }

  if (input.portions) {
    for (const p of input.portions) {
      if (!p.label || !p.label.trim()) { errs.push('Porción alternativa: falta el nombre') }
      if (!Number.isFinite(p.grams) || p.grams <= 0) { errs.push(`Porción "${p.label || '?'}": los gramos deben ser > 0`) }
    }
  }
  return errs
}

function normalizeAliases(raw: string[] | undefined): string[] {
  const out: string[] = []
  for (const a of raw ?? []) {
    const n = normFold(a.trim())
    if (n && !out.includes(n)) { out.push(n) }
  }
  return out
}

/**
 * Lee los nutrientes opcionales del formulario. Un campo vacío queda AUSENTE
 * (no se crea la clave), nunca 0 ficticio. Devuelve undefined si no hay ninguno.
 */
function readExtras(input: CustomFoodInput): FoodExtras | undefined {
  const out: FoodExtras = {}
  const put = (key: keyof FoodExtras, v: number | null | undefined) => {
    if (isBlankField(v)) { return }
    out[key] = Number(v)
  }
  put('fiber', input.fiber)
  put('sugars', input.sugars)
  put('addedSugars', input.addedSugars)
  put('saturatedFat', input.saturatedFat)
  put('transFat', input.transFat)
  put('sodium', input.sodium)
  put('salt', input.salt)
  put('energyKj', input.energyKj)
  return Object.keys(out).length > 0 ? out : undefined
}

function scaleExtras(extras: FoodExtras | undefined, factor: number): FoodExtras | undefined {
  if (!extras) { return undefined }
  const out: FoodExtras = {}
  for (const [k, v] of Object.entries(extras) as Array<[keyof FoodExtras, number]>) {
    out[k] = round1(v * factor)
  }
  return out
}

/**
 * Normaliza los macros cargados a `per100` según la base.
 * - per100g / per100ml: la carga YA es por 100.
 * - perServing: per100 = porción × 100 / servingGrams.
 * Los nutrientes opcionales se escalan con el mismo factor (o se omiten si no hay).
 */
export function normalizeToPer100(input: CustomFoodInput): {
  per100: CustomFoodMacros
  entered: CustomFoodMacros
  extras?: FoodExtras
} {
  const entered: CustomFoodMacros = {
    calories: Number(input.calories) || 0,
    proteins: Number(input.proteins) || 0,
    carbs: Number(input.carbs) || 0,
    fats: Number(input.fats) || 0,
  }
  const rawExtras = readExtras(input)
  if (input.basis === 'perServing') {
    const grams = Number(input.servingGrams) || 0
    const factor = grams > 0 ? 100 / grams : 0
    return {
      entered,
      per100: {
        calories: round1(entered.calories * factor),
        proteins: round1(entered.proteins * factor),
        carbs: round1(entered.carbs * factor),
        fats: round1(entered.fats * factor),
      },
      extras: scaleExtras(rawExtras, factor),
    }
  }
  return { entered, per100: entered, extras: rawExtras }
}

/**
 * Aviso (no bloqueante) cuando las calorías informadas no coinciden con la suma
 * de macros (4·proteínas + 4·carbohidratos + 9·grasas). Devuelve null si está bien.
 */
export function macroDiscrepancyWarning(per100: CustomFoodMacros): string | null {
  const fromMacros = per100.proteins * 4 + per100.carbs * 4 + per100.fats * 9
  if (per100.calories <= 0 || fromMacros <= 0) { return null }
  const diff = Math.abs(per100.calories - fromMacros)
  if (diff <= Math.max(25, per100.calories * 0.2)) { return null }
  return `Las calorías (${Math.round(per100.calories)}) no coinciden con los macros (~${Math.round(fromMacros)} kcal). Se guardará igual.`
}

function unitFor(input: Pick<CustomFoodInput, 'basis' | 'unit'>): 'g' | 'ml' {
  if (input.unit) { return input.unit }
  return input.basis === 'per100ml' ? 'ml' : 'g'
}

function newCustomFoodId(): string {
  const hex = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0')
  return `custom-food-${hex().slice(0, 8)}`
}

/** Construye el CustomFood a partir de la entrada (sin persistir). */
export function buildCustomFood(input: CustomFoodInput, id = newCustomFoodId()): CustomFood {
  const { per100, entered, extras } = normalizeToPer100(input)
  const now = new Date().toISOString()
  const portions = (input.portions ?? [])
    .filter(p => p.label.trim() && Number.isFinite(p.grams) && p.grams > 0)
    .map(p => ({ label: p.label.trim(), grams: round1(p.grams) }))
  return {
    id,
    name: input.name.trim(),
    brand: input.brand?.trim() || undefined,
    category: input.category,
    state: input.state,
    basis: input.basis,
    servingGrams: input.basis === 'perServing' ? Number(input.servingGrams) : undefined,
    per100,
    entered,
    extras,
    barcode: input.barcode?.trim() || undefined,
    portions: portions.length > 0 ? portions : undefined,
    aliases: normalizeAliases(input.aliases),
    unit: unitFor(input),
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  }
}

/** Persiste un alimento personalizado nuevo y lo registra en el intérprete. */
export async function createCustomFood(input: CustomFoodInput): Promise<CustomFood> {
  const errs = validateCustomFoodInput(input)
  if (errs.length > 0) { throw new Error(errs.join(' · ')) }
  const rec = buildCustomFood(input)
  await db.customFoods.put(rec)
  await refreshCustomFoods()
  return rec
}

/** Edita un alimento personalizado existente. */
export async function updateCustomFood(id: string, input: CustomFoodInput): Promise<CustomFood> {
  const errs = validateCustomFoodInput(input)
  if (errs.length > 0) { throw new Error(errs.join(' · ')) }
  const prev = await db.customFoods.get(id).catch(() => null)
  const next: CustomFood = { ...buildCustomFood(input, id), createdAt: prev?.createdAt ?? new Date().toISOString() }
  await db.customFoods.put(next)
  await refreshCustomFoods()
  return next
}

export async function getCustomFood(id: string): Promise<CustomFood | null> {
  return (await db.customFoods.get(id).catch(() => null)) ?? null
}

export async function listCustomFoods(): Promise<CustomFood[]> {
  const rows = await db.customFoods.toArray().catch(() => [])
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export async function deleteCustomFood(id: string): Promise<void> {
  await db.customFoods.delete(id).catch(() => null)
  try {
    const { recordDelete } = await import('@/services/firebase/sync')
    await recordDelete('customFoods', id)
  } catch { /* noop */ }
  await refreshCustomFoods()
}

/**
 * Vista de un alimento personalizado como FoodBase, para inyectarlo en el
 * intérprete y en la búsqueda con el mismo shape que el catálogo.
 */
export function toFoodBase(cf: CustomFood): FoodBase {
  const baseName = normFold(cf.name)
  const aliases = [...new Set([baseName, ...cf.aliases])].filter(Boolean)
  const standardGrams = cf.basis === 'perServing' && cf.servingGrams ? cf.servingGrams : 100
  const per100: Macros = { ...cf.per100 }
  return {
    id: cf.id,
    label: cf.brand ? `${cf.name} (${cf.brand})` : cf.name,
    per100,
    aliases,
    standardGrams,
    category: cf.category,
    state: cf.state,
    extras: cf.extras,
    unit: cf.unit,
    brand: cf.brand,
    source: 'manual',
  }
}

/** Relee la tabla y actualiza el registro en memoria del intérprete. */
export async function refreshCustomFoods(): Promise<void> {
  const rows = await db.customFoods.toArray().catch(() => [])
  registerExtraFoods(rows.map(toFoodBase))
}

/** Carga inicial: llamar una vez al arrancar la app. */
export const loadCustomFoods = refreshCustomFoods
