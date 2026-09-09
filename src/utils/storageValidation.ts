import { z } from 'zod'

export const rutinaMetaSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(50),
  createdAt: z.string(),
  rotationDays: z.number().min(7).max(90)
})

export const nutriCalendarioSchema = z.array(z.object({
  fecha: z.string(),
  dia: z.string(),
  desayuno: z.string(),
  almuerzo: z.string(),
  merienda: z.string(),
  cena: z.string(),
  total: z.object({ kcal: z.number(), p: z.number(), c: z.number(), g: z.number() })
}))

export function safeParseLocalStorage<T>(key:string, schema:z.ZodSchema<T>, fallback:T):T{
  try{
    const raw = localStorage.getItem(key)
    if(!raw) return fallback
    const json = JSON.parse(raw)
    return schema.parse(json)
  }catch{
    localStorage.removeItem(key)
    return fallback
  }
}
