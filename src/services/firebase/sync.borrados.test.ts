import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * R1 (FASE FINAL): el trazo de `syncDeletes` solo se limpia tras confirmar el
 * borrado remoto. Éxito total → se limpia todo; fallo total → se conserva
 * todo; parciales → se limpia solo lo procesado; el reintento completa lo
 * pendiente. Un borrado fallido nunca puede "resucitar" en la descarga.
 */

const deleteDoc = vi.fn(async (_ref: unknown): Promise<void> => {})
// Filas remotas devueltas por getDocs: { data: () => row }
let remoteRows: Array<{ data: () => Record<string, unknown> }> = []
// Paths (users/uid/tabla/docId) que deben fallar al borrar.
let failDeletePaths: string[] = []

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  // Soporta ambas formas: doc(colRef, id) y doc(db, 'users', uid, table, id).
  doc: (a: { path?: string }, ...rest: string[]) =>
    ({ path: a?.path !== undefined ? `${a.path}/${rest[0]}` : rest.join('/') }),
  getDocs: vi.fn(async () => ({ forEach: (cb: (d: { data: () => Record<string, unknown> }) => void) => remoteRows.forEach(cb) })),
  setDoc: vi.fn(async () => {}),
  writeBatch: vi.fn(() => ({ set: () => {}, commit: async () => {} })),
  deleteDoc: (ref: unknown) => deleteDoc(ref),
}))

vi.mock('./config', () => ({ firebaseDb: vi.fn(() => ({})) }))

import { syncAll, recordDelete, pendingDeletes } from './sync'
import { db } from '@/services/storage/db'

const tracePaths = async () => (await pendingDeletes()).map((d) => `${d.table}/${d.docId}`).sort()

beforeEach(async () => {
  vi.clearAllMocks()
  localStorage.clear()
  remoteRows = []
  failDeletePaths = []
  deleteDoc.mockImplementation(async (ref: unknown) => {
    const path = (ref as { path: string }).path
    if (failDeletePaths.some((p) => path.includes(p))) { throw new Error('network down') }
  })
  await db.delete()
  await db.open()
})

describe('R1 — syncAll: borrados solo se limpian tras confirmarse', () => {
  it('éxito total: limpia los trazos y los cuenta como borrados', async () => {
    await recordDelete('activitySessions', 'a1')
    await recordDelete('sessionOverrides', '2026-11-14')

    const res = await syncAll('uid-test')

    expect(res.deleted).toBe(2)
    expect(await pendingDeletes()).toHaveLength(0)
    expect(await tracePaths()).toEqual([])
  })

  it('fallo total: conserva TODOS los trazos (reintento posterior posible)', async () => {
    failDeletePaths = ['activitySessions/a1', 'sessionOverrides/2026-11-14']
    await recordDelete('activitySessions', 'a1')
    await recordDelete('sessionOverrides', '2026-11-14')

    const res = await syncAll('uid-test')

    expect(res.deleted).toBe(0)
    expect(await tracePaths()).toEqual(['activitySessions/a1', 'sessionOverrides/2026-11-14'])
  })

  it('parcial: limpia SOLO los confirmados y conserva el fallido', async () => {
    failDeletePaths = ['sessionOverrides/2026-11-14']
    await recordDelete('activitySessions', 'a1')
    await recordDelete('activitySessions', 'a2')
    await recordDelete('sessionOverrides', '2026-11-14')

    const res = await syncAll('uid-test')

    expect(res.deleted).toBe(2)
    expect(await tracePaths()).toEqual(['sessionOverrides/2026-11-14'])
  })

  it('reintento: el segundo syncAll completa lo que falló y vacía la cola', async () => {
    failDeletePaths = ['sessionOverrides/2026-11-14']
    await recordDelete('activitySessions', 'a1')
    await recordDelete('sessionOverrides', '2026-11-14')
    await syncAll('uid-test')
    expect(await tracePaths()).toEqual(['sessionOverrides/2026-11-14'])

    failDeletePaths = []
    const second = await syncAll('uid-test')

    expect(second.deleted).toBe(1)
    expect(await pendingDeletes()).toHaveLength(0)
  })

  it('ningún delete remoto sale del subárbol users/{uid}', async () => {
    await recordDelete('activitySessions', 'a1')
    await syncAll('uid-A')
    for (const call of deleteDoc.mock.calls) {
      const path = (call[0] as { path: string }).path
      expect(path.startsWith('users/uid-A/')).toBe(true)
    }
  })

  it('descarga: activitySessions sigue ADD_ONLY (lo remoto no pisa lo local)', async () => {
    const local = {
      id: 's-local', userId: 'me', activityId: 'run', activityName: 'Correr',
      calendarDate: '2026-11-14', startedAt: '2026-11-01T09:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    await db.activitySessions.put(local as never)
    remoteRows = [{
      data: () => ({
        id: 's-local', userId: 'me', activityId: 'run', activityName: 'CORREGIDO-REMOTO',
        calendarDate: '2026-11-14', startedAt: '2026-11-14T09:00:00.000Z',
        updatedAt: '2026-11-14T00:00:00.000Z',
      }),
    }]

    const res = await syncAll('uid-test')

    const after = await db.activitySessions.get('s-local' as never)
    expect(after?.updatedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(after?.activityName).toBe('Correr')
    expect(res.conflicts.some((c) => c.table === 'activitySessions' && c.reason === 'history-preserved')).toBe(true)
  })
})
