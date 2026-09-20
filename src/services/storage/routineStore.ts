import { db } from './db'
import { DEFAULT_CYCLE, type CycleConfig } from '@/utils/cycle'

export type RoutineData = {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  rotationDays: number
  cycle: CycleConfig
  dayExercises: Record<number, { id:string; exId:string; sets:number; reps:number; weight:number; gifUrl?:string; name?:string; muscle?:string; restSec?:number; seriesType?:string; routineExerciseId?:string }[]>
  isDemo?: boolean
}

const ACTIVE_ID_KEY = 'meta:activeId'

// ─── Read ───

export async function getAllRoutines(): Promise<RoutineData[]> {
  const all = await db.routineStore.toArray()
  return all.filter((r): r is RoutineData => 'dayExercises' in r)
}

export async function getActiveRoutineId(): Promise<string | null> {
  const meta = await db.routineStore.get(ACTIVE_ID_KEY)
  return meta && 'activeId' in meta ? meta.activeId : null
}

export async function getActiveRoutine(): Promise<RoutineData | null> {
  const activeId = await getActiveRoutineId()
  if (!activeId) {
    const all = await getAllRoutines()
    return all[0] || null
  }
  const r = await db.routineStore.get(activeId)
  return (r && 'dayExercises' in r) ? (r as RoutineData) : null
}

export async function getRoutineById(id: string): Promise<RoutineData | null> {
  const r = await db.routineStore.get(id)
  return (r && 'dayExercises' in r) ? (r as RoutineData) : null
}

// ─── Write ───

export async function saveAllRoutines(list: RoutineData[], activeId: string | null): Promise<void> {
  await db.routineStore.bulkPut(list as (RoutineData | { id: string; activeId: string; createdAt: string; updatedAt: string })[])
  if (activeId) {
    await db.routineStore.put({ id: ACTIVE_ID_KEY, activeId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
  }
}

export async function saveRoutine(routine: RoutineData): Promise<void> {
  await db.routineStore.put(routine)
}

export async function setActiveRoutineId(id: string): Promise<void> {
  await db.routineStore.put({ id: ACTIVE_ID_KEY, activeId: id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
}

export async function deleteRoutine(id: string): Promise<void> {
  await db.routineStore.delete(id)
}

// ─── Migration from localStorage ───

let _migrated = false

export async function migrateRoutinesFromLocalStorage(): Promise<void> {
  if (_migrated) {return}
  _migrated = true

  // Check if Dexie already has routines
  const count = await db.routineStore.count()
  if (count > 1) {return} // Already has data + meta entry

  try {
    const rawList = JSON.parse(localStorage.getItem('rutinas:list') || 'null')
    if (!rawList || !Array.isArray(rawList) || rawList.length === 0) {return}

    const activeId = localStorage.getItem('rutina:activeId') || rawList[0]?.id || null

    const routines: RoutineData[] = rawList.map((r: any) => ({
      id: r.id || `r-${Date.now()}`,
      name: r.name || 'Rutina',
      createdAt: r.createdAt || new Date().toISOString(),
      updatedAt: r.updatedAt || new Date().toISOString(),
      rotationDays: r.rotationDays || 30,
      cycle: r.cycle || DEFAULT_CYCLE,
      dayExercises: r.dayExercises || {},
    }))

    await saveAllRoutines(routines, activeId)

    // Clean up legacy localStorage keys
    localStorage.removeItem('rutinas:list')
    localStorage.removeItem('rutina:activeId')
    localStorage.removeItem('rutina:meta')
    localStorage.removeItem('rutina:ex')
  } catch {
    // Migration failed — localStorage data preserved as fallback
  }
}

// ─── Legacy compat: write-through to localStorage during transition ───

export async function syncToLocalStorage(): Promise<void> {
  try {
    const list = await getAllRoutines()
    const activeId = await getActiveRoutineId()
    if (list.length > 0) {
      localStorage.setItem('rutinas:list', JSON.stringify(list))
      if (activeId) {localStorage.setItem('rutina:activeId', activeId)}
      const active = list.find(r => r.id === activeId) || list[0]
      if (active) {
        localStorage.setItem('rutina:meta', JSON.stringify({ id: active.id, name: active.name, createdAt: active.createdAt, rotationDays: active.rotationDays }))
        localStorage.setItem('rutina:ex', JSON.stringify(active.dayExercises))
      }
    }
  } catch { /* noop */ }
}
