import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/services/storage/db'
import {
  enqueueOp, pendingOps, pendingCount, opIdFor, type RemoteAdapter,
} from './opQueue'
import { processQueue } from './engine'
import { applyDownloadPolicy } from '@/services/firebase/sync'
import { updateRecoveryCheck } from '../recovery/recoveryService'
import { addDiaryEntry } from '../storage/diaryStore'
import { addHydration } from '../recovery/recoveryService'
import { createReadySession, transitionSession } from '../training/sessionStore'

class FakeRemote implements RemoteAdapter {
  docs = new Map<string, Record<string, unknown>>()
  failTables = new Set<string>()
  failAll = false
  async upload(table: string, docId: string, data: Record<string, unknown>): Promise<void> {
    if (this.failAll || this.failTables.has(table)) { throw new Error('remote down') }
    this.docs.set(`${table}/${docId}`, JSON.parse(JSON.stringify(data)))
  }
  count(table: string): number {
    return [...this.docs.keys()].filter(k => k.startsWith(table + '/')).length
  }
  get(table: string, docId: string): Record<string, unknown> | undefined {
    return this.docs.get(`${table}/${docId}`)
  }
}

const EXERCISES = [
  { exId: 'press', name: 'Press Banca', sets: 1, reps: 8, weight: 80, muscle: 'Pecho' },
]

async function finishSession(sessionId: string) {
  await transitionSession(sessionId, 'IN_PROGRESS')
  await transitionSession(sessionId, 'COMPLETING')
  await transitionSession(sessionId, 'COMPLETED')
}

// Los encolados son fire-and-forget (best-effort tras escritura local).
const flushEnqueue = () => new Promise(r => setTimeout(r, 30))

describe('FASE 8 — Offline-first y sync idempotente', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('escritura offline encola; la cola sobrevive al reload', async () => {
    await updateRecoveryCheck({ energy: 8, fatigue: 2, stress: 3, motivation: 8, score: 80, color: 'green' })
    await addDiaryEntry({
      id: 'd1', date: '2026-09-20', name: 'Pollo', mealType: 'almuerzo',
      servingLabel: '100g', amount: 100, unit: 'g',
      macros: { calories: 165, proteins: 31, carbs: 0, fats: 3.6 },
      addedAt: '2026-09-20T13:00:00Z',
    })
    await addHydration(250)
    await flushEnqueue()
    expect(await pendingCount()).toBe(3)
    await db.close()
    await db.open()
    expect(await pendingCount()).toBe(3)
    const ops = await pendingOps()
    expect(ops.map(o => o.table).sort()).toEqual(['hydrationLogs', 'nutritionDiary', 'recoveryChecks'])
    expect(ops.find(o => o.table === 'recoveryChecks')?.key).toBe(new Date().toISOString().slice(0, 10))
    expect(ops.find(o => o.table === 'nutritionDiary')?.key).toBe('d1')
  })

  it('reencolar no duplica operaciones', async () => {
    await enqueueOp('recoveryChecks', '2026-09-20')
    await enqueueOp('recoveryChecks', '2026-09-20')
    expect(await pendingCount()).toBe(1)
  })

  it('sesión offline → sync → un único registro histórico correcto', async () => {
    const s = await createReadySession({
      calendarDate: '2026-09-10', routineId: 'r1', routineName: 'R',
      plannedDay: 1, plannedDayName: 'P', actualDay: 1, actualDayName: 'P',
      exercises: EXERCISES,
    })
    await finishSession(s.sessionId)
    await flushEnqueue()
    const remote = new FakeRemote()
    const summary = await processQueue('uid', remote)
    expect(summary.failed).toHaveLength(0)
    expect(await pendingCount()).toBe(0)
    // Un único documento de sesión + sus sets, contenido íntegro
    expect(remote.count('trainingSessions')).toBe(1)
    expect(remote.count('setRecords')).toBe(1)
    const local = await db.trainingSessions.get(s.sessionId)
    expect(local?.sessionStatus).toBe('COMPLETED')
  })

  it('doble sync no duplica; reintento tras error conserva y completa', async () => {
    await updateRecoveryCheck({ energy: 8, fatigue: 2, stress: 3, motivation: 8, score: 80, color: 'green' })
    await flushEnqueue()
    const remote = new FakeRemote()
    await processQueue('uid', remote)
    expect(remote.count('recoveryChecks')).toBe(1)
    // Reprocesar (p. ej. tras reconexión): nada pendiente, mismo doc
    await enqueueOp('recoveryChecks', new Date().toISOString().slice(0, 10))
    await processQueue('uid', remote)
    expect(remote.count('recoveryChecks')).toBe(1)

    // Error remoto: la operación queda recuperable
    remote.failAll = true
    await addHydration(250)
    await flushEnqueue()
    const fail = await processQueue('uid', remote)
    expect(fail.failed.length).toBe(1)
    expect(await pendingCount()).toBe(1)
    remote.failAll = false
    const retry = await processQueue('uid', remote)
    expect(retry.failed).toHaveLength(0)
    expect(await pendingCount()).toBe(0)
    expect(remote.count('hydrationLogs')).toBe(1)
  })

  it('sync parcial: un fallo no bloquea el resto', async () => {
    await updateRecoveryCheck({ energy: 8, fatigue: 2, stress: 3, motivation: 8, score: 80, color: 'green' })
    await addHydration(250)
    await flushEnqueue()
    const remote = new FakeRemote()
    remote.failTables.add('hydrationLogs')
    const summary = await processQueue('uid', remote)
    expect(summary.done.length).toBe(1)
    expect(summary.failed.length).toBe(1)
    expect(remote.count('recoveryChecks')).toBe(1)
    expect(await pendingCount()).toBe(1)
  })

  it('conflictos: remoto viejo no pisa, empate conserva local, faltante se agrega', () => {
    const local = [{ id: 'a', updatedAt: '2026-09-10T10:00:00Z' }]
    const byId = new Map(local.map((r: { id: string }) => [r.id, r]))
    // Remoto más viejo en tabla histórica → preservado, conflicto registrado
    const old = applyDownloadPolicy('trainingSessions', [{ id: 'a', updatedAt: '2026-09-01T10:00:00Z' }], byId)
    expect(old.toPut).toHaveLength(0)
    expect(old.conflicts).toEqual([{ table: 'trainingSessions', id: 'a', reason: 'history-preserved' }])
    // Empate en editable → local + conflicto
    const tie = applyDownloadPolicy('userProfile', [{ id: 'me', updatedAt: '2026-09-10T10:00:00Z' }], new Map([['me', { id: 'me', updatedAt: '2026-09-10T10:00:00Z' }]]))
    expect(tie.toPut).toHaveLength(0)
    expect(tie.conflicts[0].reason).toBe('tie-keep-local')
    // Remoto más nuevo en editable → aplica
    const newer = applyDownloadPolicy('userProfile', [{ id: 'me', updatedAt: '2026-09-11T10:00:00Z' }], new Map([['me', { id: 'me', updatedAt: '2026-09-10T10:00:00Z' }]]))
    expect(newer.toPut).toHaveLength(1)
    expect(newer.conflicts).toHaveLength(0)
    // Id faltante → se agrega
    const missing = applyDownloadPolicy('trainingSessions', [{ id: 'b', updatedAt: '2026-09-01T10:00:00Z' }], byId)
    expect(missing.toPut).toHaveLength(1)
  })

  it('dos dispositivos: cada lado conserva lo suyo sin pérdida', () => {
    const localById = new Map<string, { id: string; updatedAt: string }>([
      ['me', { id: 'me', updatedAt: '2026-09-12T10:00:00Z' }],
    ])
    // Remoto trae perfil más nuevo (otro dispositivo) → aplica
    const r1 = applyDownloadPolicy('userProfile', [{ id: 'me', updatedAt: '2026-09-13T10:00:00Z' }], localById)
    expect(r1.toPut).toHaveLength(1)
    // Y sesión histórica local nunca se pisa aunque remoto sea más nuevo
    const r2 = applyDownloadPolicy('trainingSessions', [{ id: 's1', updatedAt: '2026-09-13T10:00:00Z' }], new Map([['s1', { id: 's1', updatedAt: '2026-09-10T10:00:00Z' }]]))
    expect(r2.toPut).toHaveLength(0)
    expect(r2.conflicts[0].reason).toBe('history-preserved')
  })

  it('demo excluido de la subida; legacy convive sin fusionarse', async () => {
    await db.setRecords.put({
      setRecordId: 'demo:set:1', sessionId: 'ds', sessionExerciseId: 'dse',
      exerciseId: 'ex-006', order: 1, setType: 'NORMAL',
      plannedReps: 10, plannedWeight: 200, actualReps: 10, actualWeight: 200,
      status: 'COMPLETED', completedAt: '2026-09-10T10:00:00Z',
      createdAt: '2026-09-10T10:00:00Z', updatedAt: '2026-09-10T10:00:00Z',
      isDemo: true,
    } as never)
    await db.setLogs.put({
      id: 'legacy-1', sessionId: 'ds', exerciseId: 'ex-006', setNumber: 1,
      weight: 200, reps: 10, completed: true,
      createdAt: '2026-09-10T10:00:00Z', updatedAt: '2026-09-10T10:00:00Z',
    } as never)
    await enqueueOp('trainingSessions', 'ds')
    await flushEnqueue()
    const remote = new FakeRemote()
    await processQueue('uid', remote)
    expect(remote.count('setRecords')).toBe(0)
    // Legacy intacto localmente (la migración/dedupe lo maneja en lectura)
    expect(await db.setLogs.count()).toBe(1)
  })

  it('nutrición y recovery no se duplican al re-sincronizar', async () => {
    await addDiaryEntry({
      id: 'd1', date: '2026-09-20', name: 'Pollo', mealType: 'almuerzo',
      servingLabel: '100g', amount: 100, unit: 'g',
      macros: { calories: 165, proteins: 31, carbs: 0, fats: 3.6 },
      addedAt: '2026-09-20T13:00:00Z',
    })
    await updateRecoveryCheck({ energy: 8, fatigue: 2, stress: 3, motivation: 8, score: 80, color: 'green' })
    await flushEnqueue()
    const remote = new FakeRemote()
    await processQueue('uid', remote)
    await processQueue('uid', remote)
    expect(remote.count('nutritionDiary')).toBe(1)
    expect(remote.count('recoveryChecks')).toBe(1)
  })

  it('Firebase caído: lo local sigue intacto y operaciones pendientes', async () => {
    const s = await createReadySession({
      calendarDate: '2026-09-10', routineId: 'r1', routineName: 'R',
      plannedDay: 1, plannedDayName: 'P', actualDay: 1, actualDayName: 'P',
      exercises: EXERCISES,
    })
    await finishSession(s.sessionId)
    await flushEnqueue()
    const remote = new FakeRemote()
    remote.failAll = true
    const summary = await processQueue('uid', remote)
    expect(summary.failed.length).toBe(1)
    expect((await db.trainingSessions.get(s.sessionId))?.sessionStatus).toBe('COMPLETED')
    expect(await pendingCount()).toBe(1)
  })
})
