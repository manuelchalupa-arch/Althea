import type { Page } from '@playwright/test'
import { DEFAULT_CYCLE } from '../../src/utils/cycle'

/**
 * Siembra de datos LOCALES de prueba para specs Playwright.
 * Modo offline (`althea:offlineMode`) + escritura directa en IndexedDB
 * `trainPWA` (perfil + rutina [+ sesión]) — igual que un usuario con datos ya
 * cargados. NO usa cuentas reales, NO toca Firestore.
 */

export type SeedRows = { session?: boolean }

export async function seedBase(page: Page, opts: SeedRows = {}) {
  await page.addInitScript(() => localStorage.setItem('althea:offlineMode', '1'))
  // 1ª carga: la app crea el esquema Dexie (trainPWA v29) y cae en /onboarding.
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // 2ª paso: siembra en IndexedDB con reintentos hasta que el esquema exista.
  await page.evaluate(async ({ withSession, cycleSeed }) => {
    const open = () =>
      new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('trainPWA')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
    const pad = (n: number) => String(n).padStart(2, '0')
    const d = new Date()
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const now = new Date().toISOString()

    for (let i = 0; i < 40; i++) {
      let idb: IDBDatabase | null = null
      try {
        idb = await open()
        if (!idb.objectStoreNames.contains('userProfile')) {
          idb.close()
          idb = null
          await new Promise((r) => setTimeout(r, 250))
          continue
        }
        const stores = ['userProfile', 'routineStore']
        if (withSession) { stores.push('trainingSessions', 'sessionExercises', 'setRecords') }
        await new Promise<void>((res, rej) => {
          const tx = idb!.transaction(stores, 'readwrite')
          tx.objectStore('userProfile').put({
            id: 'me', displayName: 'Nico', onboardingDone: true,
            weightKg: 80, heightCm: 175, age: 30,
          })
          tx.objectStore('routineStore').put({
            id: 'qa-routine', name: 'QA Rutina',
            createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z',
            // Toda rutina real lleva `cycle` (la app lo asume al renderizar).
            cycle: cycleSeed, rotationDays: 30,
            dayExercises: { 1: [{ exId: 'press', name: 'Press banca', sets: 3, reps: 8, weight: 70 }] },
          })
          if (withSession) {
            tx.objectStore('trainingSessions').put({
              id: 'qa-s1', sessionId: 'qa-s1', userId: 'me',
              routineId: 'qa-routine', routineName: 'QA Rutina',
              plannedDay: 1, actualDay: 1, plannedDayName: 'Pecho', actualDayName: 'Pecho',
              calendarDate: today, sessionStatus: 'IN_PROGRESS', plannedSets: 4,
              startedAt: now, createdAt: now, updatedAt: now,
            })
            tx.objectStore('sessionExercises').put({
              sessionExerciseId: 'qa-se1', sessionId: 'qa-s1', exerciseId: 'press', order: 0,
              planned: true, completed: false, status: 'PENDING',
              plannedSetCount: 2, actualSetCount: 0,
              plannedSets: [{ reps: 8, weight: 70 }, { reps: 8, weight: 70 }],
              createdAt: now, updatedAt: now,
            })
            tx.objectStore('sessionExercises').put({
              sessionExerciseId: 'qa-se2', sessionId: 'qa-s1', exerciseId: 'remo', order: 1,
              planned: true, completed: false, status: 'PENDING',
              plannedSetCount: 2, actualSetCount: 0,
              plannedSets: [{ reps: 8, weight: 60 }, { reps: 8, weight: 60 }],
              createdAt: now, updatedAt: now,
            })
            const pendingSets = [
              { se: 'qa-se1', ex: 'press' },
              { se: 'qa-se1', ex: 'press' },
            ]
            for (const s of pendingSets) {
              tx.objectStore('setRecords').put({
                setRecordId: `qa-sr-${s.ex}-${Math.random().toString(36).slice(2, 7)}`,
                sessionId: 'qa-s1', sessionExerciseId: s.se, exerciseId: s.ex,
                order: 1, setType: 'NORMAL', plannedReps: 8, plannedWeight: 70,
                actualReps: null, actualWeight: null, status: 'PENDING',
                createdAt: now, updatedAt: now,
              })
            }
            localStorage.setItem('althea:session:activeId', 'qa-s1')
          }
          tx.oncomplete = () => res()
          tx.onerror = () => rej(tx.error)
        })
        idb.close()
        return
      } catch {
        if (idb) { idb.close() }
        await new Promise((r) => setTimeout(r, 250))
      }
    }
    throw new Error('No se pudo abrir/sembrar trainPWA')
  }, { withSession: opts.session === true, cycleSeed: DEFAULT_CYCLE })
}
