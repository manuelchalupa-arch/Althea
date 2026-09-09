// ExerciseGymGifsDB — API estática en español via jsDelivr
// Base: https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@v1.1.0
// Repo: https://github.com/JahelCuadrado/ExerciseGymGifsDB
// Unica fuente a usar según instrucción del usuario — wger y seeds locales deprecados

export const BASE = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@v1.1.0'
export const LANG = 'es' // siempre español

export type Exercise = {
  id: string // "biceps/barbell-curl"
  slug: string
  name: string
  muscle: string
  bodyPart: string
  equipment: string
  category: string
  secondaryMuscles: string[]
  instructions: string[]
  file: string
  gifUrl: string
}

export type MuscleEntry = { muscle:string; count:number; endpoint:string }
export type EquipmentEntry = { equipment:string; count:number; endpoint:string }
export type BodyPartEntry = { bodyPart:string; count:number; endpoint:string }
export type CategoryEntry = { category:string; count:number; endpoint:string }

async function getJSON<T>(url:string):Promise<T>{
  const res = await fetch(url, { headers:{ Accept:'application/json' } })
  if(!res.ok) throw new Error(`ExerciseGym ${res.status} ${url}`)
  return res.json() as Promise<T>
}

// Listados
export const fetchMuscles = ()=> getJSON<MuscleEntry[]>(`${BASE}/api/${LANG}/muscles.json`)
export const fetchEquipment = ()=> getJSON<EquipmentEntry[]>(`${BASE}/api/${LANG}/equipment.json`)
export const fetchBodyParts = ()=> getJSON<BodyPartEntry[]>(`${BASE}/api/${LANG}/bodyparts.json`)
export const fetchCategories = ()=> getJSON<CategoryEntry[]>(`${BASE}/api/${LANG}/categories.json`)

// Colecciones filtradas
export const fetchByMuscle = (muscle:string)=> getJSON<{ muscle:string; count:number; exercises:Exercise[] }>(`${BASE}/api/${LANG}/muscles/${muscle}.json`)
export const fetchByEquipment = (equipment:string)=> getJSON<{ equipment:string; count:number; exercises:Exercise[] }>(`${BASE}/api/${LANG}/equipment/${equipment}.json`)
export const fetchByBodyPart = (bp:string)=> getJSON<{ bodyPart:string; count:number; exercises:Exercise[] }>(`${BASE}/api/${LANG}/bodyparts/${bp}.json`)
export const fetchByCategory = (cat:string)=> getJSON<{ category:string; count:number; exercises:Exercise[] }>(`${BASE}/api/${LANG}/categories/${cat}.json`)
export const fetchAll = ()=> getJSON<{ count:number; exercises:Exercise[] }>(`${BASE}/api/${LANG}/exercises.json`)
export const fetchOne = (muscle:string, slug:string)=> getJSON<Exercise>(`${BASE}/api/${LANG}/exercises/${muscle}/${slug}.json`)

// Cache simple para offline (localStorage + Workbox runtime cache hará el resto)
export function cacheSet(key:string, data:any){ try{ localStorage.setItem(`exgym:${key}`, JSON.stringify({t:Date.now(), data})) }catch{} }
export function cacheGet(key:string){ try{ const v=localStorage.getItem(`exgym:${key}`); if(!v) return null; return JSON.parse(v).data }catch{ return null } }
