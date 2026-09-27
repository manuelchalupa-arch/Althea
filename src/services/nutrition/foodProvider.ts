import * as Codulia from '@/services/codulia'

// Capa de proveedor nutricional (FASE 3): la UI nunca habla directo con una
// API. Proveedores intercambiables con la misma forma. Ningún proveedor
// registra consumo: solo devuelven candidatos que el usuario confirma.
//
// Configuración externa (no desplegar nada desde aquí):
// - Codulia: requiere x-api-key. Se carga EXPLÍCITAMENTE con setFoodApiKey()
//   (clave del propio usuario en su dispositivo). Sin clave → los métodos
//   lanzan error honesto y la UI lo muestra (sin inventar alimentos).
// - API Ninjas: interfaz lista; requiere proxy server-side para no exponer
//   la clave (ver docs/NUTRITION_PROVIDER.md). Sin proxy → no configurado.
// - Barcode: Codulia expone GET /foods/barcode/:code (requiere clave).
// - Foto/OCR: sin dependencia pesada; la foto se adjunta como evidencia y
//   el usuario transcribe la etiqueta (ver PhotoManualEntry en Nutricion).
//   Un OCR real (p. ej. Tesseract) queda como mejora documentada.

export type ProviderId = 'codulia' | 'ninjas'

export interface FoodCandidate {
  provider: ProviderId | 'manual'
  id: string
  name: string
  brand?: string | null
  baseUnit: 'g' | 'ml'
  caloriesPer100: number
  proteinsPer100: number
  carbsPer100: number
  fatsPer100: number
  photoUrl?: string | null
}

export interface FoodDetail extends FoodCandidate {
  servings: { label: string; amount: number; unit: 'g' | 'ml' }[]
}

export interface FoodProvider {
  readonly id: ProviderId
  isConfigured(): boolean
  search(query: string): Promise<FoodCandidate[]>
  barcode(code: string): Promise<FoodDetail | null>
  detail(id: string): Promise<FoodDetail>
}

function toCandidate(raw: {
  id: string; name: string; brand?: string | null; baseUnit: 'g' | 'ml'
  caloriesPer100g?: number; caloriesPer100?: number; calories?: number
  proteinsPer100g?: number; carbsPer100g?: number; fatsPer100g?: number
  photoUrl?: string | null
}, provider: ProviderId): FoodCandidate {
  return {
    provider,
    id: raw.id,
    name: raw.name,
    brand: raw.brand ?? null,
    baseUnit: raw.baseUnit,
    caloriesPer100: Number(raw.caloriesPer100g ?? raw.caloriesPer100 ?? raw.calories ?? 0),
    proteinsPer100: Number(raw.proteinsPer100g ?? 0),
    carbsPer100: Number(raw.carbsPer100g ?? 0),
    fatsPer100: Number(raw.fatsPer100g ?? 0),
    photoUrl: raw.photoUrl ?? null,
  }
}

function toDetail(d: Codulia.CoduliaFoodDetail): FoodDetail {
  return {
    ...toCandidate(d, 'codulia'),
    servings: (d.servings || []).map(s => ({ label: s.label, amount: s.amount, unit: s.unit })),
  }
}

export const coduliaProvider: FoodProvider = {
  id: 'codulia',
  isConfigured() {
    try { return Codulia.getCoduliaKey().length > 0 } catch { return false }
  },
  async search(query: string) {
    const r = await Codulia.searchFoods(query, { limit: 20 })
    return r.map(x => toCandidate(x, 'codulia'))
  },
  async barcode(code: string) {
    try {
      return toDetail(await Codulia.getByBarcode(code))
    } catch {
      return null
    }
  },
  async detail(id: string) {
    return toDetail(await Codulia.getFoodDetail(id))
  },
}

const CALORIE_NINJAS_KEY_STORAGE = 'althea:calorieninjas_key'

export function getCalorieNinjasKey(): string {
  try {
    return (localStorage.getItem(CALORIE_NINJAS_KEY_STORAGE) || '').trim()
  } catch {
    return ''
  }
}

export function setCalorieNinjasKey(key: string): void {
  try {
    localStorage.setItem(CALORIE_NINJAS_KEY_STORAGE, key.trim())
  } catch { /* noop */ }
}

export const ninjasProvider: FoodProvider = {
  id: 'ninjas',
  isConfigured() {
    return getCalorieNinjasKey().length > 0
  },
  async search(query: string): Promise<FoodCandidate[]> {
    const key = getCalorieNinjasKey()
    if (!key) {
      throw new Error('CalorieNinjas no configurado (cargá tu API Key en Nutrición o variables de entorno).')
    }
    const res = await fetch(`https://api.calorieninjas.com/v1/nutrition?query=${encodeURIComponent(query)}`, {
      headers: { 'X-Api-Key': key }
    })
    if (!res.ok) {
      throw new Error(`CalorieNinjas error HTTP ${res.status}`)
    }
    const data = await res.json()
    const items = Array.isArray(data.items) ? data.items : []
    return items.map((item: any) => {
      const servG = Math.max(1, Number(item.serving_size_g || 100))
      const scale = 100 / servG
      return {
        provider: 'ninjas' as const,
        id: `ninjas-${item.name.toLowerCase().replace(/\s+/g, '-')}`,
        name: item.name,
        baseUnit: 'g' as const,
        caloriesPer100: Math.round(Number(item.calories || 0) * scale),
        proteinsPer100: Math.round(Number(item.protein_g || 0) * scale * 10) / 10,
        carbsPer100: Math.round(Number(item.carbohydrates_total_g || 0) * scale * 10) / 10,
        fatsPer100: Math.round(Number(item.fat_total_g || 0) * scale * 10) / 10,
        photoUrl: null,
      }
    })
  },
  async barcode() {
    return null
  },
  async detail(id: string): Promise<FoodDetail> {
    const cleanName = id.replace(/^ninjas-/, '').replace(/-/g, ' ')
    const candidates = await this.search(cleanName)
    const match = candidates.find(c => c.id === id) || candidates[0]
    if (!match) {
      throw new Error(`Alimento ${id} no encontrado en CalorieNinjas`)
    }
    return {
      ...match,
      servings: [
        { label: '100 g', amount: 100, unit: 'g' },
        { label: '1 porción (150 g)', amount: 150, unit: 'g' },
        { label: '1 porción grande (250 g)', amount: 250, unit: 'g' },
      ],
    }
  },
}

export function setFoodApiKey(key: string): void {
  Codulia.setCoduliaKey(key)
  setCalorieNinjasKey(key)
}

export function getActiveProvider(): FoodProvider {
  if (ninjasProvider.isConfigured()) { return ninjasProvider }
  if (coduliaProvider.isConfigured()) { return coduliaProvider }
  return ninjasProvider
}

// Macros para una cantidad real (confirmada por el usuario, nunca inventada).
export function nutrientsForAmount(food: FoodCandidate, amount: number): { calories: number; proteins: number; carbs: number; fats: number } {
  const f = amount / 100
  return {
    calories: Math.round(food.caloriesPer100 * f),
    proteins: Math.round(food.proteinsPer100 * f * 10) / 10,
    carbs: Math.round(food.carbsPer100 * f * 10) / 10,
    fats: Math.round(food.fatsPer100 * f * 10) / 10,
  }
}
