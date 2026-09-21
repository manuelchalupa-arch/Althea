import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/services/storage/db'
import {
  saveDecision, getAllDecisions, saveAnswer, getAnswer,
  getPrefs, getLearningInsight, getRepeatedDecisions, defaultKindFor,
} from './coachMemory'
import { logDecision, getRecentDecisions } from './decisionLogger'
import { FallbackAIProvider } from './fallbackAIProvider'
import {
  getActiveConversation, saveMessage, getMessages, clearConversation,
} from './chatHistory'

const D = (d: Parameters<typeof saveDecision>[0]) => saveDecision(d)

describe('FASE 7 — Memoria Dexie sin localStorage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  it('decisiones y QA persisten solo en Dexie (localStorage vacío)', async () => {
    await D({ date: '2026-09-20', type: 'reject', exercise: 'press', motive: 'dolor', contextSnapshot: {} })
    await saveAnswer('pain:hombro', '¿Molesta?', 'Sí')
    expect(localStorage.getItem('coachMemory')).toBeNull()
    expect(localStorage.getItem('coachQA')).toBeNull()
    expect(localStorage.getItem('coachPrefs')).toBeNull()
    const all = await getAllDecisions()
    expect(all.length).toBe(1)
    expect(await getAnswer('pain:hombro')).not.toBeNull()
  })

  it('kind por defecto: decision vs hecho; recomendación nunca es hecho', async () => {
    expect(defaultKindFor('accept')).toBe('decision')
    expect(defaultKindFor('reject')).toBe('decision')
    expect(defaultKindFor('swap')).toBe('decision')
    expect(defaultKindFor('complete')).toBe('hecho')
    const r = await D({ date: '2026-09-20', type: 'accept', exercise: 'press', contextSnapshot: {} })
    expect(r.kind).toBe('decision')
    const h = await D({ date: '2026-09-20', type: 'complete', exercise: 'press', contextSnapshot: {} })
    expect(h.kind).toBe('hecho')
    const rec = await D({ date: '2026-09-20', type: 'accept', kind: 'recomendacion', exercise: 'x', contextSnapshot: {} })
    expect(rec.kind).toBe('recomendacion')
  })

  it('aceptar / modificar / rechazar se persisten diferenciados', async () => {
    const base = { type: 'recovery' as const, context: {}, decision: { what: 'W', why: 'Y', factors: [], confidence: 0.7 } }
    const a = await logDecision(base)
    await db.decisionLog.update(a.id, { outcome: { accepted: true } })
    const m = await logDecision(base)
    await db.decisionLog.update(m.id, { outcome: { accepted: true, modification: 'bajar a 3 series' } })
    const r = await logDecision(base)
    await db.decisionLog.update(r.id, { outcome: { accepted: false } })
    const recent = await getRecentDecisions('recovery', 10)
    expect(recent.find(x => x.id === a.id)?.outcome).toMatchObject({ accepted: true })
    expect(recent.find(x => x.id === m.id)?.outcome).toMatchObject({ accepted: true, modification: 'bajar a 3 series' })
    expect(recent.find(x => x.id === r.id)?.outcome).toMatchObject({ accepted: false })
  })

  it('rechazo repetido y sustitución repetida se detectan (contexto, no auto-acción)', async () => {
    await D({ date: '2026-09-18', type: 'reject', exercise: 'press', contextSnapshot: {} })
    await D({ date: '2026-09-19', type: 'reject', exercise: 'press', contextSnapshot: {} })
    await D({ date: '2026-09-19', type: 'swap', exercise: 'press', contextSnapshot: {} })
    await D({ date: '2026-09-20', type: 'swap', exercise: 'press', contextSnapshot: {} })
    const rep = await getRepeatedDecisions()
    expect(rep.find(x => x.type === 'reject' && x.exercise === 'press')?.count).toBe(2)
    expect(rep.find(x => x.type === 'swap' && x.exercise === 'press')?.count).toBe(2)
    // La rutina sigue intacta: decidir no modifica nada
    expect(await db.trainingSessions.count()).toBe(0)
    const insight = await getLearningInsight()
    expect(insight).toContain('press')
  })

  it('decidir no altera históricos de entrenamiento', async () => {
    await db.trainingSessions.put({
      id: 'ts', sessionId: 'ts', userId: 'me', routineId: 'r1',
      plannedDay: 1, actualDay: 1, calendarDate: '2026-09-10',
      sessionStatus: 'COMPLETED', createdAt: '2026-09-10T10:00:00Z', updatedAt: '2026-09-10T10:00:00Z',
    } as never)
    await D({ date: '2026-09-20', type: 'reject', exercise: 'press', contextSnapshot: {} })
    await logDecision({ type: 'training', context: {}, decision: { what: 'W', why: 'Y', factors: [], confidence: 0.5 } })
    const s = await db.trainingSessions.get('ts')
    expect(s?.sessionStatus).toBe('COMPLETED')
  })

  it('reload conserva memoria y prefs', async () => {
    await D({ date: '2026-09-18', type: 'reject', exercise: 'press', contextSnapshot: {} })
    await D({ date: '2026-09-19', type: 'reject', exercise: 'press', contextSnapshot: {} })
    await db.close()
    await db.open()
    expect(await getAllDecisions()).toHaveLength(2)
    expect(await getPrefs()).toMatchObject({ ejercicioEvitado: 'press' })
  })

  it('personalidad cambia tono, no datos ni acción', async () => {
    const provider = new FallbackAIProvider()
    const base = {
      objetivo: 'hipertrofia', dia: 'Día 1', ejercicio: 'Press',
      historial: [{ peso: 80, reps: 8 }, { peso: 80, reps: 9 }],
      insights: [], score: { score: 80, factors: [] },
    }
    const a = await provider.generateRecommendation({ ...base, personalidad: 'ARNOLD' } as never)
    const b = await provider.generateRecommendation({ ...base, personalidad: 'ABUELITOS' } as never)
    expect(a.action).toBe(b.action)
  })

  it('chat persiste sin duplicar; limpiar no toca entrenamiento', async () => {
    const conv = await getActiveConversation('Entrenamiento')
    await saveMessage({ conversationId: conv, role: 'user', content: 'hola', createdAt: new Date().toISOString() })
    await saveMessage({ conversationId: conv, role: 'assistant', content: 'hola!', createdAt: new Date().toISOString() })
    expect(await getMessages(conv)).toHaveLength(2)
    // Recarga: misma conversación del día, sin duplicados
    const conv2 = await getActiveConversation('Entrenamiento')
    expect(conv2).toBe(conv)
    expect(await getMessages(conv)).toHaveLength(2)
    await db.trainingSessions.put({
      id: 'ts', sessionId: 'ts', userId: 'me', routineId: 'r1',
      plannedDay: 1, actualDay: 1, calendarDate: '2026-09-10',
      sessionStatus: 'COMPLETED', createdAt: '2026-09-10T10:00:00Z', updatedAt: '2026-09-10T10:00:00Z',
    } as never)
    await clearConversation(conv)
    expect(await getMessages(conv)).toHaveLength(0)
    expect(await db.trainingSessions.count()).toBe(1)
  })

  it('sin modelo disponible: fallback determinístico offline, sin bloqueo', async () => {
    // El proveedor determinístico no necesita red ni modelo: el Coach
    // responde offline sin inventar y sin bloquear registro/historial
    const provider = new FallbackAIProvider()
    const rec = await provider.generateRecommendation({
      objetivo: 'hipertrofia', dia: 'Día 1', ejercicio: 'Press',
      historial: [], insights: [],
    } as never)
    expect(rec.reason).toContain('Todavía no tengo suficientes datos')
  })
})
