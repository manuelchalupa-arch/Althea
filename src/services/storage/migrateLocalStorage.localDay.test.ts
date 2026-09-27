import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from './db'
import { migrateAllLocalStorageToDexie } from './migrateLocalStorage'
import { todayKey } from '@/utils/dates'

// FASE 2 - S9 - regresion de la migracion (deuda #5 que S7 dejo para S9).
//
// La fase 8 de migrateLocalStorage.ts migraba el localStorage legacy
// `coachPrefs` a `db.coachMemory['prefs:global']` escribiendo:
//
//   date: new Date().toISOString().slice(0, 10)
//
// `toISOString()` es UTC. El campo `date` de un registro de coachMemory es una
// FECHA CIVIL local, y asi lo escriben las fases vecinas de la misma migracion
// (las de QA usan `date: key`, donde `key` ya es un dia civil). En un huso al
// oeste de UTC, entre las 21:00 y las 24:00 locales, la migracion escribia el
// dia de manana en un campo que significa "hoy": una corrupcion de un dia, de
// forma latente, que se activaba justo al re-ejecutarse la migracion en un
// entorno nuevo (instalaciones nuevas o tras limpiar IndexedDB).

const atLocal = (y: number, m: number, d: number, h: number, mi = 0) => new Date(y, m - 1, d, h, mi, 0, 0)

/** localStorage minimo: solo la clave legacy `coachPrefs` que migra la fase 8. */
const legacyStorage = {
  getItem: (k: string) => (k === 'coachPrefs' ? JSON.stringify({ tone: 'directo' }) : null),
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  get length() { return 1 },
} as unknown as Storage

describe('S9 - la migracion escribe la fecha CIVIL local en coachMemory', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })
  afterEach(() => { vi.useRealTimers() })

  it('a las 21:30 escribe el dia local, no el dia UTC', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(atLocal(2026, 3, 10, 21, 30))

    // el dia UTC de este instante es manana: por eso el test distingue las dos
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-03-11')
    expect(todayKey()).toBe('2026-03-10')

    await migrateAllLocalStorageToDexie({ storage: legacyStorage })

    const row = await db.coachMemory.get('prefs:global')
    expect(row).toBeDefined()
    expect(row!.date).toBe('2026-03-10') // dia civil local
    expect(row!.date).not.toBe('2026-03-11') // nunca el dia UTC
  })

  it('a la madrugada escribe el dia local', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(atLocal(2026, 3, 11, 0, 30))

    await migrateAllLocalStorageToDexie({ storage: legacyStorage })

    const row = await db.coachMemory.get('prefs:global')
    expect(row!.date).toBe('2026-03-11')
  })

  it('sigue migrando el contenido de las preferencias legacy sin tocarlo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(atLocal(2026, 3, 10, 21, 30))

    await migrateAllLocalStorageToDexie({ storage: legacyStorage })

    const row = await db.coachMemory.get('prefs:global') as unknown as { data: { tone: string }; type: string; sessionId: string }
    expect(row!.data).toEqual({ tone: 'directo' })
    expect(row!.type).toBe('observation')
    expect(row!.sessionId).toBe('prefs')
  })

  it('la migracion sigue siendo idempotente: no duplica la fila si ya existe', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(atLocal(2026, 3, 10, 21, 30))

    await migrateAllLocalStorageToDexie({ storage: legacyStorage })
    const first = await db.coachMemory.get('prefs:global')
    await migrateAllLocalStorageToDexie({ storage: legacyStorage })
    const second = await db.coachMemory.get('prefs:global')

    expect(second!.date).toBe(first!.date)
    expect(await db.coachMemory.where('id').equals('prefs:global').count()).toBe(1)
  })
})
