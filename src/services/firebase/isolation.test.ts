import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls: Array<{ path: string }> = []

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  doc: (col: { path: string }, id: string) => ({ path: `${col.path}/${id}` }),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  setDoc: vi.fn((ref: { path: string }) => {
    calls.push({ path: ref.path })
    return Promise.resolve()
  }),
  writeBatch: vi.fn(),
}))

vi.mock('./config', () => ({
  firebaseDb: vi.fn(() => ({})),
}))

import { firestoreRemote, autoRestore, localUserDataEmpty } from './sync'
import { db } from '@/services/storage/db'

describe('Aislamiento multiusuario (Firestore users/{uid})', () => {
  beforeEach(() => {
    calls.length = 0
    vi.clearAllMocks()
  })

  it('Usuario A escribe solo en users/uid-A', async () => {
    await firestoreRemote('uid-A').upload('sessions', 's1', { v: 1 })
    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe('users/uid-A/sessions/s1')
  })

  it('Usuario B escribe solo en users/uid-B (sin contaminación cruzada)', async () => {
    await firestoreRemote('uid-A').upload('nutritionDiary', 'a1', { v: 1 })
    await firestoreRemote('uid-B').upload('nutritionDiary', 'b1', { v: 2 })
    const paths = calls.map((c) => c.path)
    expect(paths).toContain('users/uid-A/nutritionDiary/a1')
    expect(paths).toContain('users/uid-B/nutritionDiary/b1')
    expect(paths.some((p) => p.includes('uid-A') && p.includes('b1'))).toBe(false)
    expect(paths.some((p) => p.includes('uid-B') && p.includes('a1'))).toBe(false)
  })

  it('ninguna escritura sale del subárbol users/{uid}', async () => {
    await firestoreRemote('uid-A').upload('userProfile', 'me', { v: 1 })
    for (const c of calls) {
      expect(c.path.startsWith('users/uid-A/')).toBe(true)
    }
  })
})

describe('restore automático por cuenta (autoRestore)', () => {
  beforeEach(() => {
    calls.length = 0
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('al iniciar sesión baja los datos de users/{uid} y registra el restore', async () => {
    const { getDocs } = await import('firebase/firestore')
    await autoRestore('uid-A')
    expect((getDocs as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0)
    expect(localStorage.getItem('althea:autoSync:uid-A')).toBeTruthy()
  })

  it('no repite el restore dentro de los 5 min (throttle por uid)', async () => {
    localStorage.setItem('althea:autoSync:uid-B', String(Date.now()))
    const { getDocs } = await import('firebase/firestore')
    await autoRestore('uid-B')
    expect((getDocs as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
  })

  it('sin conexión no intenta nada', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false })
    const { getDocs } = await import('firebase/firestore')
    try {
      await autoRestore('uid-C')
    } finally {
      Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true })
    }
    expect((getDocs as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
    expect(localStorage.getItem('althea:autoSync:uid-C')).toBeNull()
  })

  it('localUserDataEmpty: true sin datos, false con perfil propio', async () => {
    await db.userProfile.clear().catch(() => null)
    expect(await localUserDataEmpty()).toBe(true)
    await db.userProfile.put({ id: 'me', onboardingDone: true } as never).catch(() => null)
    expect(await localUserDataEmpty()).toBe(false)
  })
})
