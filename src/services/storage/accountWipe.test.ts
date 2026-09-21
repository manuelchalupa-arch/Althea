import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { clearUserDataOnAccountDelete } from './accountWipe'

describe('accountWipe — borrado selectivo al eliminar cuenta', () => {
  beforeEach(async () => {
    localStorage.clear()
    await db.delete()
    await db.open()
  })

  it('elimina solo claves de usuario y preserva preferencias UI y claves ajenas', async () => {
    localStorage.setItem('althea:theme', 'dark')
    localStorage.setItem('althea:textscale', 'm')
    localStorage.setItem('althea:nav-collapsed', '1')
    localStorage.setItem('third:party:key', 'x')
    localStorage.setItem('firebase:auth:keep', 'y')
    localStorage.setItem('onboard:nombre', 'Ana')
    localStorage.setItem('coachMemory', '[]')
    localStorage.setItem('rutinas:list', '[]')
    localStorage.setItem('session:active:2026-01-01', 's1')
    localStorage.setItem('exstate:2026-01-01:press', '{}')
    localStorage.setItem('recovery:2026-01-01', '{}')
    localStorage.setItem('nutri:diario_v2:2026-01-01', '{}')
    localStorage.setItem('syncQueue', '[]')
    localStorage.setItem('trainpwa-profile', '{}')
    localStorage.setItem('codulia_api_key', 'secret')

    const { removedKeys } = await clearUserDataOnAccountDelete()

    expect(removedKeys).toContain('onboard:nombre')
    expect(removedKeys).toContain('coachMemory')
    expect(removedKeys).toContain('syncQueue')
    expect(removedKeys).toContain('trainpwa-profile')
    expect(localStorage.getItem('onboard:nombre')).toBeNull()
    expect(localStorage.getItem('syncQueue')).toBeNull()

    expect(localStorage.getItem('althea:theme')).toBe('dark')
    expect(localStorage.getItem('althea:textscale')).toBe('m')
    expect(localStorage.getItem('althea:nav-collapsed')).toBe('1')
    expect(localStorage.getItem('third:party:key')).toBe('x')
    expect(localStorage.getItem('firebase:auth:keep')).toBe('y')
  })

  it('vacía Dexie sin usar indexedDB.deleteDatabase con nombre incorrecto', async () => {
    await db.recoveryChecks.put({
      id: '2026-01-01', localDate: '2026-01-01', energy: 7, fatigue: 3,
      stress: 3, motivation: 7, score: 70, color: 'green',
    } as any)
    expect(await db.recoveryChecks.count()).toBe(1)

    const { dexieDeleted } = await clearUserDataOnAccountDelete()
    expect(dexieDeleted).toBe(true)

    await db.open()
    expect(await db.recoveryChecks.count()).toBe(0)
  })

  it('tras el borrado la app rearranca: sync/memoria limpios y perfil reutilizable', async () => {
    await db.syncQueue.put({ id: 'trainingSessions:x', table: 'trainingSessions', key: 'x', status: 'pending', attempts: 0, createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-01-01T10:00:00Z' } as never)
    await db.coachMemory.put({ id: 'dec-1', date: '2026-01-01', type: 'reject', contextSnapshot: {}, createdAt: '2026-01-01T10:00:00Z' } as never)
    await db.userProfile.put({ id: 'me', favoriteExercises: ['press'] } as never)
    localStorage.setItem('althea:theme', 'dark')

    await clearUserDataOnAccountDelete()
    await db.open()

    expect(await db.syncQueue.count()).toBe(0)
    expect(await db.coachMemory.count()).toBe(0)
    expect(await db.userProfile.count()).toBe(0)
    // Estructuras técnicas intactas: se puede guardar perfil y operar de nuevo
    await db.userProfile.put({ id: 'me', onboardingDone: true } as never)
    expect(await db.userProfile.get('me')).toBeDefined()
    await db.trainingSessions.put({
      id: 'nueva', sessionId: 'nueva', userId: 'me', routineId: 'r1',
      plannedDay: 1, actualDay: 1, calendarDate: '2026-02-01',
      sessionStatus: 'COMPLETED', createdAt: '2026-02-01T10:00:00Z', updatedAt: '2026-02-01T10:00:00Z',
    } as never)
    expect(await db.trainingSessions.count()).toBe(1)
    expect(localStorage.getItem('althea:theme')).toBe('dark')
  })
})
