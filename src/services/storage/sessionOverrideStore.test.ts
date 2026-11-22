import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { getDayNotDone, setDayNotDone, setOverride, getOverrideDay } from './sessionOverrideStore'

describe('sessionOverrideStore — día No realizado', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()))
  })

  it('marca y desmarca el día sin crear sesión', async () => {
    expect(await getDayNotDone('2026-11-20')).toBe(false)
    await setDayNotDone('2026-11-20', true)
    expect(await getDayNotDone('2026-11-20')).toBe(true)
    await setDayNotDone('2026-11-20', false)
    expect(await getDayNotDone('2026-11-20')).toBe(false)
    expect(await db.trainingSessions.count()).toBe(0)
  })

  it('cambiar de día cancela No realizado y conserva los demás campos', async () => {
    await setDayNotDone('2026-11-20', true)
    await setOverride('2026-11-20', 3, null, null)
    expect(await getDayNotDone('2026-11-20')).toBe(false)
    expect(await getOverrideDay('2026-11-20')).toBe(3)
  })

  it('conserva el día elegido al marcar No realizado', async () => {
    await setOverride('2026-11-20', 2, null, { note: 'ok' })
    await setDayNotDone('2026-11-20', true)
    expect(await getOverrideDay('2026-11-20')).toBe(2)
    expect(await getDayNotDone('2026-11-20')).toBe(true)
    const row = await db.sessionOverrides.get('2026-11-20')
    expect(row?.observation).toEqual({ note: 'ok' })
  })
})
