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

import { firestoreRemote } from './sync'

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
