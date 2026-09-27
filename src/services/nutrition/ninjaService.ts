// Ninja Calórica — API Ninjas (api.api-ninjas.com/v1/nutrition)
// Key del usuario: se guarda en localStorage (no se embebe en bundle) + fallback .env
const NINJA_BASE = 'https://api.api-ninjas.com/v1/nutrition'
const LS_KEY = 'ninja_api_key'

export function getNinjaKey(): string {
  try {
    return (localStorage.getItem(LS_KEY) || '').trim()
  } catch {
    return ''
  }
}

export function setNinjaKey(k: string) {
  try { localStorage.setItem(LS_KEY, k.trim()) } catch {}
}

export function hasNinjaKey(): boolean {
  return !!getNinjaKey()
}

export type NinjaItem = {
  name: string
  calories: number
  serving_size_g: number
  protein_g: number
  fat_total_g: number
  carbohydrates_total_g: number
  fiber_g: number
  sugar_g: number
  sodium_mg: number
  cholesterol_mg: number
  potassium_mg: number
}

export async function queryNinjaNutrition(query: string): Promise<NinjaItem[]> {
  const key = getNinjaKey()
  if (!key) throw new Error('Ninja Calórica no configurada. Ingresá tu API key.')
  if (!query.trim()) return []
  const url = `${NINJA_BASE}?query=${encodeURIComponent(query.trim())}`
  const res = await fetch(url, { headers: { 'X-Api-Key': key } })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    if (res.status === 401 || res.status === 403) throw new Error('API key de Ninja inválida o sin permisos.')
    throw new Error(text.slice(0, 300) || `Error Ninja ${res.status}`)
  }
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error('Respuesta inesperada de Ninja')
  return data as NinjaItem[]
}

export function ninjaToDiaryEntry(item: NinjaItem, mealType: string) {
  return {
    id: `ninja-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: item.name,
    mealType,
    servingLabel: `${item.serving_size_g}g`,
    amount: item.serving_size_g,
    unit: 'g' as const,
    macros: {
      calories: Math.round(item.calories),
      proteins: Math.round(item.protein_g * 10) / 10,
      carbs: Math.round(item.carbohydrates_total_g * 10) / 10,
      fats: Math.round(item.fat_total_g * 10) / 10,
    },
    addedAt: new Date().toISOString(),
  }
}
