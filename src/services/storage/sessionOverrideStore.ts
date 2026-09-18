import { db } from './db'

export interface SessionOverrideData {
  date: string
  overrideDay: number
  changed: Record<string, any> | null
  observation: Record<string, any> | null
}

function table() {
  return (db as any).sessionOverrides as import('dexie').Table<SessionOverrideData, string>
}

// ─── Read ───

export async function getOverrideDay(date: string): Promise<number | null> {
  const row = await table().get(date)
  return row?.overrideDay ?? null
}

export async function getChangedData(date: string): Promise<Record<string, any> | null> {
  const row = await table().get(date)
  return row?.changed ?? null
}

export async function getObservationData(date: string): Promise<Record<string, any> | null> {
  const row = await table().get(date)
  return row?.observation ?? null
}

export async function hasOverride(date: string): Promise<boolean> {
  const row = await table().get(date)
  return row != null
}

// ─── Write ───

export async function setOverride(date: string, dayN: number, changed: Record<string, any> | null, observation: Record<string, any> | null): Promise<void> {
  await table().put({ date, overrideDay: dayN, changed, observation })
}

export async function removeOverride(date: string): Promise<void> {
  await table().delete(date)
}

// ─── Migration from localStorage ───

export async function migrateSessionOverridesFromLocalStorage(): Promise<void> {
  const migrated = localStorage.getItem('althea:migration:sessionOverrides')
  if (migrated === 'done') return

  const keys = Object.keys(localStorage).filter(k =>
    k.startsWith('session:override:') || k.startsWith('session:changed:') || k.startsWith('session:observation:')
  )

  const dates = new Set<string>()
  for (const k of keys) {
    const date = k.split(':').slice(2).join(':')
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.add(date)
  }

  if (dates.size === 0) {
    localStorage.setItem('althea:migration:sessionOverrides', 'done')
    return
  }

  const existing = await table().toArray()
  const existingDates = new Set(existing.map(e => e.date))

  const toPut: SessionOverrideData[] = []
  for (const date of dates) {
    if (existingDates.has(date)) continue
    const raw = localStorage.getItem(`session:override:${date}`)
    const overrideDay = raw ? Number(raw) : null
    if (overrideDay == null || isNaN(overrideDay)) continue

    const changedRaw = localStorage.getItem(`session:changed:${date}`)
    const observationRaw = localStorage.getItem(`session:observation:${date}`)

    toPut.push({
      date,
      overrideDay,
      changed: changedRaw ? JSON.parse(changedRaw) : null,
      observation: observationRaw ? JSON.parse(observationRaw) : null,
    })
  }

  if (toPut.length) await table().bulkPut(toPut)
  localStorage.setItem('althea:migration:sessionOverrides', 'done')
}
