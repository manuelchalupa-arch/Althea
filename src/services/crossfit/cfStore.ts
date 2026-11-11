import { v4 as uuid } from 'uuid'
import { db } from '@/services/storage/db'
import type { CfMark, CfResult, CfScheduleEntry, CfTimerState, CfWod } from './types'

/**
 * Store del módulo CrossFit. Todas las escrituras son offline-first en Dexie
 * y encolan la operación de sincronización con el mismo mecanismo idempotente
 * del resto de Althea (opQueue con id determinístico `tabla:clave`).
 * El cronómetro es local-only: es estado en curso, no un dato del usuario.
 */

const nowIso = () => new Date().toISOString()
const enqueue = (table: string, key: string) => {
  import('@/services/sync/opQueue').then(({ enqueueOp }) => enqueueOp(table, key)).catch(() => {})
}

// ---------- WODs ----------

export async function listWods(): Promise<CfWod[]> {
  const rows = await db.cfWods.toArray().catch(() => [] as CfWod[])
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getWod(id: string): Promise<CfWod | null> {
  return (await db.cfWods.get(id).catch(() => null)) ?? null
}

export async function saveWod(wod: CfWod): Promise<CfWod> {
  const row: CfWod = { ...wod, updatedAt: nowIso() }
  await db.cfWods.put(row)
  enqueue('cfWods', row.id)
  return row
}

export async function newWod(partial: Partial<CfWod>): Promise<CfWod> {
  const t = nowIso()
  return saveWod({
    id: uuid(),
    name: 'WOD sin nombre',
    format: 'FOR_TIME',
    objective: '',
    modalities: [],
    movements: [],
    equipment: [],
    instructions: [],
    level: 'intermedio',
    isTemplate: false,
    source: 'user',
    createdAt: t,
    updatedAt: t,
    ...partial,
  })
}

export async function deleteWod(id: string): Promise<void> {
  await db.cfWods.delete(id)
  const { recordDelete } = await import('@/services/firebase/sync')
  recordDelete('cfWods', id).catch(() => {})
}

// ---------- Programación ----------

export async function listSchedule(): Promise<CfScheduleEntry[]> {
  const rows = await db.cfSchedule.toArray().catch(() => [] as CfScheduleEntry[])
  return rows.sort((a, b) => a.date.localeCompare(b.date))
}

/** Entradas entre dos fechas locales inclusive (YYYY-MM-DD). */
export async function listScheduleRange(from: string, to: string): Promise<CfScheduleEntry[]> {
  const rows = await db.cfSchedule.where('date').between(from, to, true, true).toArray().catch(() => [] as CfScheduleEntry[])
  return rows.sort((a, b) => a.date.localeCompare(b.date))
}

export async function getScheduleByDate(date: string): Promise<CfScheduleEntry[]> {
  return (await db.cfSchedule.where('date').equals(date).toArray().catch(() => [])) as CfScheduleEntry[]
}

export async function saveScheduleEntry(entry: CfScheduleEntry): Promise<CfScheduleEntry> {
  const row: CfScheduleEntry = { ...entry, updatedAt: nowIso() }
  await db.cfSchedule.put(row)
  enqueue('cfSchedule', row.id)
  return row
}

export async function newScheduleEntry(partial: Partial<CfScheduleEntry> & { date: string; kind: CfScheduleEntry['kind'] }): Promise<CfScheduleEntry> {
  const t = nowIso()
  return saveScheduleEntry({ id: uuid(), createdAt: t, updatedAt: t, ...partial })
}

export async function deleteScheduleEntry(id: string): Promise<void> {
  await db.cfSchedule.delete(id)
  const { recordDelete } = await import('@/services/firebase/sync')
  recordDelete('cfSchedule', id).catch(() => {})
}

// ---------- Resultados ----------

export async function listResults(): Promise<CfResult[]> {
  const rows = await db.cfResults.toArray().catch(() => [] as CfResult[])
  // Append-only: el más reciente primero, sin depender de índices de fecha.
  return rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt))
}

export async function listResultsFor(wodId: string): Promise<CfResult[]> {
  const rows = await db.cfResults.where('wodId').equals(wodId).toArray().catch(() => [] as CfResult[])
  return rows.sort((a, b) => b.date.localeCompare(a.date))
}

export async function listBenchmarkResults(benchmarkId: string): Promise<CfResult[]> {
  const rows = await db.cfResults.where('benchmarkId').equals(benchmarkId).toArray().catch(() => [] as CfResult[])
  return rows.sort((a, b) => b.date.localeCompare(a.date))
}

export async function saveResult(result: CfResult): Promise<CfResult> {
  const row: CfResult = { ...result, updatedAt: nowIso() }
  await db.cfResults.put(row)
  enqueue('cfResults', row.id)
  return row
}

export async function newResult(partial: Partial<CfResult> & { wodName: string; format: CfResult['format']; scoreText: string }): Promise<CfResult> {
  const t = nowIso()
  const date = partial.date ?? t.slice(0, 10)
  return saveResult({
    id: uuid(),
    date,
    level: 'rx',
    isBenchmark: false,
    createdAt: t,
    updatedAt: t,
    ...partial,
  })
}

export async function deleteResult(id: string): Promise<void> {
  await db.cfResults.delete(id)
  const { recordDelete } = await import('@/services/firebase/sync')
  recordDelete('cfResults', id).catch(() => {})
}

// ---------- Marcas personales ----------

export async function listMarks(): Promise<CfMark[]> {
  const rows = await db.cfMarks.toArray().catch(() => [] as CfMark[])
  return rows.sort((a, b) => b.date.localeCompare(a.date))
}

export async function saveMark(mark: CfMark): Promise<CfMark> {
  const row: CfMark = { ...mark, updatedAt: nowIso() }
  await db.cfMarks.put(row)
  enqueue('cfMarks', row.id)
  return row
}

export async function newMark(partial: Partial<CfMark> & { movement: string; reps: number; valueKg: number }): Promise<CfMark> {
  const t = nowIso()
  return saveMark({ id: uuid(), date: t.slice(0, 10), createdAt: t, updatedAt: t, ...partial })
}

export async function deleteMark(id: string): Promise<void> {
  await db.cfMarks.delete(id)
  const { recordDelete } = await import('@/services/firebase/sync')
  recordDelete('cfMarks', id).catch(() => {})
}

// ---------- Cronómetro activo (local-only) ----------

export const CF_TIMER_ID = 'active'

export async function getTimerState(): Promise<CfTimerState | null> {
  return (await db.cfTimerState.get(CF_TIMER_ID).catch(() => null)) ?? null
}

export async function saveTimerState(state: Omit<CfTimerState, 'id' | 'updatedAt'>): Promise<void> {
  await db.cfTimerState.put({ ...state, id: CF_TIMER_ID, updatedAt: nowIso() })
}

export async function clearTimerState(): Promise<void> {
  await db.cfTimerState.delete(CF_TIMER_ID)
}
