import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Las tres reglas documentadas en feedbackService.ts:
//  1. NUNCA se informa un envío exitoso antes de que `commit()` resuelva.
//  2. Los ids de documento se generan en cliente: reintentar es sobrescribir
//     el mismo documento, nunca duplicar (outbox idempotente).
//  3. Sin conexión el mensaje se conserva localmente como "no enviado";
//     permission-denied u otros errores de negocio NO se reencolan a ciegas.

type CommitMode = 'ok' | 'reject-retryable' | 'reject-permission' | 'apply-then-timeout'
type GetDocsMode = 'ok' | 'reject-permission' | 'reject-network'

const fs = vi.hoisted(() => ({
  server: new Map<string, Record<string, unknown>>(),
  commitMode: 'ok' as CommitMode,
  batchSetCalls: 0,
  getDocsMode: 'ok' as GetDocsMode,
  getDocsCalls: 0,
  // Las reglas de Firestore deniegan leer un documento que no existe.
  denyMissingGets: false,
}))

vi.mock('firebase/firestore', () => {
  type Ref = { path: string }
  return {
    doc: (...parts: unknown[]): Ref => ({ path: parts.slice(1).join('/') }),
    getDoc: async (ref: Ref) => {
      if (fs.denyMissingGets && !fs.server.has(ref.path)) {
        throw { code: 'permission-denied', message: 'doc inexistente' }
      }
      return {
        exists: () => fs.server.has(ref.path),
        data: () => fs.server.get(ref.path),
      }
    },
    writeBatch: () => {
      const pending: Array<{ path: string; data: Record<string, unknown> }> = []
      const write = (ref: Ref, data: Record<string, unknown>) => {
        fs.batchSetCalls += 1
        pending.push({ path: ref.path, data })
      }
      return {
        set: write,
        update: write,
        commit: async () => {
          if (fs.commitMode === 'reject-retryable') {
            throw { code: 'unavailable', message: 'red caída' }
          }
          if (fs.commitMode === 'reject-permission') {
            throw { code: 'permission-denied', message: 'permiso' }
          }
          for (const p of pending) fs.server.set(p.path, p.data)
          if (fs.commitMode === 'apply-then-timeout') {
            throw { code: 'timeout', message: 'sin respuesta' }
          }
        },
      }
    },
    collection: () => ({}),
    query: () => ({}),
    where: () => ({}),
    limit: () => ({}),
    getDocs: async () => {
      fs.getDocsCalls += 1
      if (fs.getDocsMode === 'reject-permission') {
        throw { code: 'permission-denied', message: 'permiso' }
      }
      if (fs.getDocsMode === 'reject-network') {
        throw { code: 'unavailable', message: 'red caída' }
      }
      return { docs: [], empty: true, forEach: () => {} }
    },
  }
})

vi.mock('@/services/firebase/config', () => ({
  isFirebaseConfigured: () => true,
  firebaseDb: () => ({}),
}))

vi.mock('@/services/firebase/auth', () => ({
  currentUser: () => ({ uid: 'u-test' }),
}))

import { db } from '@/services/storage/db'
import {
  createThread,
  fetchIsFeedbackAdmin,
  flushOutbox,
  resetFeedbackAdminCache,
} from './feedbackService'

const onLineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'onLine')

describe('feedbackService — reglas del outbox', () => {
  beforeEach(async () => {
    fs.server.clear()
    fs.commitMode = 'ok'
    fs.batchSetCalls = 0
    fs.getDocsMode = 'ok'
    fs.getDocsCalls = 0
    fs.denyMissingGets = false
    resetFeedbackAdminCache()
    await db.delete()
    await db.open()
  })

  afterEach(() => {
    if (onLineDescriptor) {
      Object.defineProperty(window.navigator, 'onLine', onLineDescriptor)
    } else {
      delete (window.navigator as { onLine?: boolean }).onLine
    }
  })

  it('regla 1: si commit() no resuelve, nunca se informa enviado', async () => {
    fs.commitMode = 'reject-retryable'
    const res = await createThread({ category: 'duda', subject: 'S', text: 'hola' })

    expect(res.delivery).toBe('pending')
    expect(res.reason).toBeTruthy()

    const entries = await db.feedbackOutbox.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0].status).toBe('pending')
    expect(entries[0].attempts).toBe(1)

    const msgs = await db.feedbackMessages.toArray()
    expect(msgs).toHaveLength(1)
    expect(msgs[0].syncStatus).toBe('pending')
  })

  it('regla 3: permission-denied queda como error y no se reencola a ciegas', async () => {
    fs.commitMode = 'reject-permission'
    const res = await createThread({ category: 'error', subject: 'Permiso', text: 'x' })

    expect(res.delivery).toBe('error')
    expect(res.error).toMatch(/permiso/i)

    let entries = await db.feedbackOutbox.toArray()
    expect(entries[0].status).toBe('error')
    const attemptsAfterFailure = entries[0].attempts

    // Sin includeErrors la cola NO toca las entradas en error.
    const auto = await flushOutbox()
    expect(auto).toEqual({ sent: 0, pending: 0, errors: 0 })
    entries = await db.feedbackOutbox.toArray()
    expect(entries[0].status).toBe('error')
    expect(entries[0].attempts).toBe(attemptsAfterFailure)

    // El reintento es sólo por acción explícita del usuario.
    const manual = await flushOutbox({ includeErrors: true })
    expect(manual.errors).toBe(1)
    entries = await db.feedbackOutbox.toArray()
    expect(entries[0].attempts).toBe(attemptsAfterFailure + 1)
  })

  it('regla 2: que las reglas denieguen leer un doc inexistente no bloquea el envío', async () => {
    // Producción 2026-10-26: el pre-chequeo de idempotencia recibía 403 en cada
    // primer envío y ningún reporte llegaba a Firestore.
    fs.denyMissingGets = true
    const res = await createThread({ category: 'duda', subject: 'Reglas', text: 'hola' })

    expect(res.delivery).toBe('sent')
    expect([...fs.server.keys()].some((k) => k.includes('/messages/'))).toBe(true)
    expect(await db.feedbackOutbox.toArray()).toHaveLength(0)
  })

  it('regla 2: reintentar tras un ack perdido sobrescribe sin duplicar', async () => {
    fs.commitMode = 'apply-then-timeout'
    const first = await createThread({ category: 'propuesta', subject: 'Idea', text: 'texto' })

    // El servidor ya lo recibió, pero el cliente no lo supo: no informa enviado.
    expect(first.delivery).toBe('pending')
    const setsAfterFirst = fs.batchSetCalls
    expect(setsAfterFirst).toBe(2) // hilo + mensaje, escritos una sola vez
    expect(await db.feedbackOutbox.toArray()).toHaveLength(1)

    fs.commitMode = 'ok'
    const report = await flushOutbox()
    expect(report).toEqual({ sent: 1, pending: 0, errors: 0 })

    // El segundo intento detecta el documento en el servidor y NO vuelve a escribir.
    expect(fs.batchSetCalls).toBe(setsAfterFirst)
    expect(await db.feedbackOutbox.toArray()).toHaveLength(0)

    const threadDocs = [...fs.server.keys()].filter(
      (k) => k.startsWith('feedbackThreads/') && !k.includes('/messages/'),
    )
    const messageDocs = [...fs.server.keys()].filter((k) => k.includes('/messages/'))
    expect(threadDocs).toHaveLength(1)
    expect(messageDocs).toHaveLength(1)

    const msgs = await db.feedbackMessages.toArray()
    expect(msgs[0].syncStatus).toBe('synced')
  })

  it('regla 3 (offline): sin conexión queda guardado como no enviado, sin tocar el servidor', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
    const res = await createThread({ category: 'duda', subject: 'Sin red', text: 'offline' })

    expect(res.delivery).toBe('pending')
    expect(fs.batchSetCalls).toBe(0)

    const entries = await db.feedbackOutbox.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0].status).toBe('pending')

    const msgs = await db.feedbackMessages.toArray()
    expect(msgs[0].syncStatus).toBe('pending')

    // flushOutbox en offline tampoco escribe: sólo cuenta lo pendiente.
    const report = await flushOutbox()
    expect(report.sent).toBe(0)
    expect(fs.batchSetCalls).toBe(0)
  })

  it('sonda admin (005): listado sin filtro con éxito ⇒ admin, cacheado 60 s', async () => {
    fs.getDocsMode = 'ok'
    expect(await fetchIsFeedbackAdmin(true)).toBe(true)

    const callsAfterProbe = fs.getDocsCalls
    expect(await fetchIsFeedbackAdmin()).toBe(true)
    expect(fs.getDocsCalls).toBe(callsAfterProbe)
  })

  it('sonda admin (005): permission-denied ⇒ false y cacheado (sin reintentos ciegos)', async () => {
    fs.getDocsMode = 'reject-permission'
    expect(await fetchIsFeedbackAdmin(true)).toBe(false)

    const callsAfterProbe = fs.getDocsCalls
    fs.getDocsMode = 'ok'
    expect(await fetchIsFeedbackAdmin()).toBe(false)
    expect(fs.getDocsCalls).toBe(callsAfterProbe)
  })

  it('sonda admin (005): error de red ⇒ false SIN cachear (el próximo montaje reintenta)', async () => {
    fs.getDocsMode = 'reject-network'
    expect(await fetchIsFeedbackAdmin(true)).toBe(false)

    const callsAfterProbe = fs.getDocsCalls
    fs.getDocsMode = 'ok'
    expect(await fetchIsFeedbackAdmin()).toBe(true)
    expect(fs.getDocsCalls).toBeGreaterThan(callsAfterProbe)
  })

  it('denormaliza ownerName/ownerEmail del perfil en el documento del hilo', async () => {
    await db.userProfile.put({ id: 'me', displayName: 'Nico', email: 'nico@test.com' } as never)

    const res = await createThread({ category: 'duda', subject: 'S', text: 'hola' })
    expect(res.delivery).toBe('sent')

    const threadDoc = fs.server.get(`feedbackThreads/${res.threadId}`)
    expect(threadDoc?.ownerName).toBe('Nico')
    expect(threadDoc?.ownerEmail).toBe('nico@test.com')
  })
})
