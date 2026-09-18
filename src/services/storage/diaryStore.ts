import { db } from './db'

export interface DiaryEntry {
  id: string
  date: string
  name: string
  mealType: string
  servingLabel: string
  amount: number
  unit: string
  macros: {
    calories: number
    proteins: number
    carbs: number
    fats: number
  }
  addedAt: string
}

const LS_PREFIX = 'nutri:diario_v2:'

function todayLocalDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function getDiaryEntries(date?: string): Promise<DiaryEntry[]> {
  const d = date || todayLocalDate()
  return db.nutritionDiary.where('date').equals(d).toArray() as Promise<DiaryEntry[]>
}

export async function addDiaryEntry(entry: DiaryEntry): Promise<void> {
  await db.nutritionDiary.put(entry as any)
}

export async function removeDiaryEntry(id: string): Promise<void> {
  await db.nutritionDiary.delete(id)
}

export async function saveDiaryEntries(entries: DiaryEntry[], date?: string): Promise<void> {
  const d = date || todayLocalDate()
  // Remove existing entries for this date
  const existing = await db.nutritionDiary.where('date').equals(d).toArray()
  const toRemove = existing.map((e: any) => e.id).filter((id: string) => !entries.find(e => e.id === id))
  await db.nutritionDiary.bulkDelete(toRemove)
  await db.nutritionDiary.bulkPut(entries as any)
}

export async function migrateDiaryFromLocalStorage(): Promise<void> {
  try {
    // Migrate all nutri:diario_v2:* keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(LS_PREFIX)) continue
      const date = key.slice(LS_PREFIX.length)
      const raw = localStorage.getItem(key)
      if (!raw) continue
      try {
        const entries: DiaryEntry[] = JSON.parse(raw)
        if (Array.isArray(entries) && entries.length > 0) {
          // Ensure each entry has a date field
          const dated = entries.map(e => ({ ...e, date: e.date || date }))
          await db.nutritionDiary.bulkPut(dated as any)
        }
        localStorage.removeItem(key)
      } catch { /* skip corrupted data */ }
    }
    // Also migrate v1 nutri:diario: prefix
    const v1Prefix = 'nutri:diario:'
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(v1Prefix)) continue
      const date = key.slice(v1Prefix.length)
      const raw = localStorage.getItem(key)
      if (!raw) continue
      try {
        const entries: DiaryEntry[] = JSON.parse(raw)
        if (Array.isArray(entries) && entries.length > 0) {
          const dated = entries.map(e => ({ ...e, date: e.date || date }))
          await db.nutritionDiary.bulkPut(dated as any)
        }
        localStorage.removeItem(key)
      } catch { /* skip */ }
    }
  } catch { /* migration best-effort */ }
}

// --- Adherence ---

export interface AdherenceRecord {
  id: string
  methodId: string
  date: string
  score: number
  daysOnMethod: number
  mealsLogged: number
  mealsExpected: number
  calorieAdherence: number
  proteinAdherence: number
  notes?: string
  createdAt: string
}

const ADHERENCE_KEY = 'nutrition:adherence'

export async function getAdherenceRecords(): Promise<AdherenceRecord[]> {
  return db.nutritionAdherence.toArray() as Promise<AdherenceRecord[]>
}

export async function saveAdherenceRecords(records: AdherenceRecord[]): Promise<void> {
  const ids = records.map((r: any) => r.id)
  const existing = await db.nutritionAdherence.toArray()
  const toDelete = existing.filter((e: any) => !ids.includes(e.id)).map((e: any) => e.id)
  if (toDelete.length) await db.nutritionAdherence.bulkDelete(toDelete)
  if (records.length) await db.nutritionAdherence.bulkPut(records as any)
}

export async function migrateAdherenceFromLocalStorage(): Promise<void> {
  try {
    const raw = localStorage.getItem(ADHERENCE_KEY)
    if (!raw) return
    const records: AdherenceRecord[] = JSON.parse(raw)
    if (Array.isArray(records) && records.length > 0) {
      await db.nutritionAdherence.bulkPut(records as any)
    }
    localStorage.removeItem(ADHERENCE_KEY)
  } catch { /* best-effort */ }
}
