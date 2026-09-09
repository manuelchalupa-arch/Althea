// Codulia — API de Nutrición Argentina (única fuente nutricional)
// Base real: https://nutricion-api-arg.fly.dev/v1  (documentada en https://codulia.com)
// Autenticación: header x-api-key
// Endpoints usados:
//   GET /v1/foods/search?q=&limit=&offset=
//   GET /v1/foods/barcode/:code
//   GET /v1/foods/:id
// Guía: https://codulia.com

export const CODULIA_BASE = 'https://nutricion-api-arg.fly.dev/v1'
export const CODULIA_DOCS = 'https://codulia.com'

export type BaseUnit = 'g' | 'ml'
export type FoodSource = 'GENERIC' | 'BRANDED' | 'COMMUNITY'

export type Serving = {
  id?: string
  label: string // "1 pote"
  amount: number // 190 (en baseUnit)
  unit: BaseUnit
}

export type CoduliaFoodSummary = {
  id: string
  name: string
  brand?: string | null
  source: FoodSource
  baseUnit: BaseUnit
  barcode?: string | null
  photoUrl?: string | null
  nutritionLabelUrl?: string | null
  caloriesPer100g?: number // alias según docs; puede venir como caloriesPer100
  caloriesPer100?: number
  proteinsPer100g?: number
  carbsPer100g?: number
  fatsPer100g?: number
  fiberPer100g?: number
  sodiumPer100g?: number
  sugarsPer100g?: number
  // algunos campos alternativos según versión
  calories?: number
}

export type CoduliaFoodDetail = CoduliaFoodSummary & {
  nameEs?: string
  description?: string
  servings: Serving[]
  verified?: boolean
  sourceDetail?: string
  // macros completos por 100 unidades base
  macros: {
    calories: number
    proteins: number
    carbs: number
    fats: number
    fiber: number
    sugars: number
    sodium: number // mg
  }
  per100Label?: string // "por 100 g" o "por 100 ml"
}

type SearchResponse = { results: CoduliaFoodSummary[]; total?: number; count?: number }
type BarcodeResponse = { food: CoduliaFoodDetail }
type DetailResponse = { food: CoduliaFoodDetail }

function getKey(): string {
  // Prioridad: env de build (Vite) > localStorage (compatibilidad)
  const envKey = (import.meta as any).env?.VITE_CODULIA_API_KEY || ''
  return envKey || localStorage.getItem('codulia_api_key') || ''
}
export function setCoduliaKey(k:string){ localStorage.setItem('codulia_api_key', k.trim()) }
export function getCoduliaKey(){ return getKey() }

function headers(){
  const k = getKey()
  if(!k) throw new Error('Servicio nutricional no configurado. Contactá al administrador.')
  return { 'x-api-key': k, 'Accept':'application/json' }
}

function normalizeDetail(raw:any): CoduliaFoodDetail {
  // normaliza distintas formas que devuelve la API según sea genérico o góndola
  const baseUnit:BaseUnit = raw.baseUnit || raw.base_unit || (raw.servingSizeUnit==='ml'?'ml':'g')
  const servings:Serving[] = (raw.servings || raw.portions || []).map((s:any)=>({
    label: s.label || s.name || `${s.amount} ${baseUnit}`,
    amount: Number(s.amount ?? s.grams ?? s.size ?? 0),
    unit: (s.unit || baseUnit) as BaseUnit
  }))
  // si no hay servings pero hay peso (ej: 190 g en nombre), deja vacío y UI mostrará solo por 100
  const macros = {
    calories: Number(raw.caloriesPer100g ?? raw.caloriesPer100 ?? raw.calories ?? raw.energy ?? 0),
    proteins: Number(raw.proteinsPer100g ?? raw.proteins ?? raw.protein ?? 0),
    carbs: Number(raw.carbsPer100g ?? raw.carbs ?? raw.carbohydrates ?? 0),
    fats: Number(raw.fatsPer100g ?? raw.fats ?? raw.fat ?? 0),
    fiber: Number(raw.fiberPer100g ?? raw.fiber ?? 0),
    sugars: Number(raw.sugarsPer100g ?? raw.sugars ?? raw.sugar ?? 0),
    sodium: Number(raw.sodiumPer100g ?? raw.sodium ?? raw.salt ?? 0),
  }
  return {
    id: raw.id,
    name: raw.name || raw.nameEs,
    brand: raw.brand ?? raw.marca ?? null,
    source: raw.source || 'GENERIC',
    baseUnit,
    barcode: raw.barcode ?? raw.ean ?? null,
    photoUrl: raw.photoUrl ?? raw.image ?? raw.photo ?? null,
    nutritionLabelUrl: raw.nutritionLabelUrl ?? raw.labelUrl ?? raw.etiquetaUrl ?? null,
    macros,
    servings,
    verified: raw.verified ?? true,
    per100Label: `por 100 ${baseUnit}`,
  } as CoduliaFoodDetail
}

export async function searchFoods(q:string, opts?:{limit?:number; offset?:number}):Promise<CoduliaFoodSummary[]>{
  if(!q.trim()) return []
  const params = new URLSearchParams({ q: q.trim(), limit: String(opts?.limit ?? 20), offset: String(opts?.offset ?? 0) })
  const res = await fetch(`${CODULIA_BASE}/foods/search?${params.toString()}`, { headers: headers() })
  if(!res.ok){
    const body = await res.json().catch(()=>({error:{message:res.statusText}}))
    throw new Error(body?.error?.message || `Codulia search ${res.status}`)
  }
  const json = await res.json() as SearchResponse
  return json.results || (json as any).foods || []
}

export async function getByBarcode(code:string):Promise<CoduliaFoodDetail>{
  const clean = code.replace(/\D/g,'').trim()
  if(!clean) throw new Error('Código de barras vacío')
  const res = await fetch(`${CODULIA_BASE}/foods/barcode/${encodeURIComponent(clean)}`, { headers: headers() })
  if(!res.ok){
    const body = await res.json().catch(()=>({error:{message:res.statusText}}))
    throw new Error(body?.error?.message || `No encontrado (${res.status})`)
  }
  const json = await res.json() as BarcodeResponse
  return normalizeDetail(json.food || json)
}

export async function getFoodDetail(id:string):Promise<CoduliaFoodDetail>{
  const res = await fetch(`${CODULIA_BASE}/foods/${encodeURIComponent(id)}`, { headers: headers() })
  if(!res.ok){
    const body = await res.json().catch(()=>({error:{message:res.statusText}}))
    throw new Error(body?.error?.message || `Codulia detail ${res.status}`)
  }
  const json = await res.json() as DetailResponse
  return normalizeDetail(json.food || json)
}

// Util: calcula nutrientes para una porción real
export function nutrientsForServing(detail:CoduliaFoodDetail, grams:number){
  const factor = grams / 100
  const m = detail.macros
  return {
    calories: +(m.calories * factor).toFixed(1),
    proteins: +(m.proteins * factor).toFixed(1),
    carbs: +(m.carbs * factor).toFixed(1),
    fats: +(m.fats * factor).toFixed(1),
    fiber: +(m.fiber * factor).toFixed(1),
    sugars: +(m.sugars * factor).toFixed(1),
    sodium: +(m.sodium * factor).toFixed(1),
    label: `${grams} ${detail.baseUnit} · factor ${factor.toFixed(2)}`
  }
}
