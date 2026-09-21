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
  version?: number
  archived?: boolean
  supersedes?: string
}

export const MAX_ROUTINES = 5

const ACTIVE_ID_KEY = 'meta:activeId'

// ─── Read ───

export async function getAllRoutines(): Promise<RoutineData[]> {
  const all = await db.routineStore.toArray()
  return all.filter((r): r is RoutineData => 'dayExercises' in r && !(r as RoutineData).archived)
}

// Versiones históricas archivadas de una rutina (solo lectura).
export async function listRoutineVersions(routineId: string): Promise<RoutineData[]> {
  const all = await db.routineStore.toArray()
  return (all.filter((r): r is RoutineData =>
    'dayExercises' in r && (r as RoutineData).archived === true &&
    ((r as RoutineData).id === routineId || (r as RoutineData).id.startsWith(`${routineId}-v`))
  ) as RoutineData[]).sort((a, b) => (a.version ?? 0) - (b.version ?? 0))
}

function routineContentOf(r: RoutineData): string {
  return JSON.stringify({ cycle: r.cycle, dayExercises: r.dayExercises, rotationDays: r.rotationDays })
}

// Guarda con versionado: si la rutina ya fue utilizada en sesiones reales y
// el contenido cambió, archiva la versión anterior (vN) y guarda vN+1.
// Nunca utilizada o sin cambios → guardado directo sin versión nueva.
export async function saveRoutineVersioned(routine: RoutineData): Promise<{ saved: RoutineData; versioned: boolean }> {
  const stored = await db.routineStore.get(routine.id) as RoutineData | undefined
  const sessions = await db.trainingSessions.where('routineId').equals(routine.id).count().catch(() => 0)
  const now = new Date().toISOString()
  if (!stored || !('dayExercises' in stored) || sessions === 0 || routineContentOf(stored) === routineContentOf(routine)) {
    const saved = { ...routine, version: stored && 'version' in stored ? (stored as RoutineData).version ?? 1 : 1, updatedAt: now }
    await db.routineStore.put(saved)
    return { saved, versioned: false }
  }
  const prevVersion = stored.version ?? 1
  const snapshot: RoutineData = {
    ...stored,
    id: `${routine.id}-v${prevVersion}`,
    archived: true,
    supersedes: undefined,
    updatedAt: now,
  }
  await db.routineStore.put(snapshot)
  const saved: RoutineData = { ...routine, version: prevVersion + 1, updatedAt: now }
  await db.routineStore.put(saved)
  return { saved, versioned: true }
}

// Diferencia real entre dos versiones (por día): agregados, quitados, modificados.
export interface RoutineDiff {
  added: { day: number; exId: string; name: string }[]
  removed: { day: number; exId: string; name: string }[]
  changed: { day: number; exId: string; name: string; from: string; to: string }[]
}

export function diffRoutines(a: RoutineData, b: RoutineData): RoutineDiff {
  const key = (day: number, exId: string) => `${day}|${exId}`
  const flat = (r: RoutineData) => {
    const m = new Map<string, { day: number; exId: string; name: string; sig: string }>()
    for (const [dayStr, arr] of Object.entries(r.dayExercises || {})) {
      for (const e of arr || []) {
        m.set(key(Number(dayStr), e.exId), {
          day: Number(dayStr), exId: e.exId, name: e.name || e.exId,
          sig: `${e.sets}x${e.reps}@${e.weight}`,
        })
      }
    }
    return m
  }
  const ma = flat(a)
  const mb = flat(b)
  const added: RoutineDiff['added'] = []
  const removed: RoutineDiff['removed'] = []
  const changed: RoutineDiff['changed'] = []
  for (const [k, v] of mb) {
    const prev = ma.get(k)
    if (!prev) { added.push({ day: v.day, exId: v.exId, name: v.name }) }
    else if (prev.sig !== v.sig) { changed.push({ day: v.day, exId: v.exId, name: v.name, from: prev.sig, to: v.sig }) }
  }
  for (const [k, v] of ma) {
    if (!mb.has(k)) { removed.push({ day: v.day, exId: v.exId, name: v.name }) }
  }
  return { added, removed, changed }
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
