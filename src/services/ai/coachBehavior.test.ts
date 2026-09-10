import { describe, it, expect, beforeEach } from 'vitest'
import { FallbackAIProvider } from './fallbackAIProvider'
import { mapTone } from './systemPrompt'
import { computeGlobalScore } from './globalScore'
import { saveAnswer, getAnswer, getAllDecisions } from './coachMemory'
import type { AIContext } from './aiProvider'

beforeEach(() => {
  localStorage.clear()
})

const baseCtx = (over: Partial<AIContext> = {}): AIContext =>
  ({
    objetivo: 'hipertrofia',
    dia: 'Día N°1',
    ejercicio: 'Press banca',
    historial: [
      { peso: 80, reps: 8 },
      { peso: 80, reps: 8 },
      { peso: 80, reps: 8 },
    ],
    ...over,
  } as AIContext)

// §31 PRUEBA FUNDAMENTAL: mismos datos de entrada base, distinto historial/estado
// → la recomendación DEBE cambiar. Si responde igual, el sistema no está terminado.
describe('prueba fundamental §31: el comportamiento cambia con los datos', () => {
  it('progreso+recuperación buena vs caída+fatiga+dolor дают distinta salida', async () => {
    const provider = new FallbackAIProvider()
    const ctxA = baseCtx({
      historial: [
        { peso: 80, reps: 8 },
        { peso: 80, reps: 9 },
        { peso: 80, reps: 10 },
      ],
      insights: [],
      score: { score: 82, factors: [] },
    })
    const ctxB = baseCtx({
      historial: [
        { peso: 80, reps: 8 },
        { peso: 75, reps: 6 },
      ],
      fatiga: 'alta',
      dolor: 'hombro 6/10',
      insights: [
        { title: 'Dolor recurrente en hombro', detail: '2 registros', kind: 'pain', level: 'warn' },
        { title: 'Caída de rendimiento', detail: 'bajó 30%', kind: 'performance', level: 'warn' },
      ],
      score: { score: 38, factors: [] },
    })
    const recA = await provider.generateRecommendation(ctxA)
    const recB = await provider.generateRecommendation(ctxB)
    expect(recA.reason).not.toBe(recB.reason)
    expect(recB.reason).toContain('hombro')
    expect(recB.action).toBe('decrease_volume')
    expect(recA.action).toBe('increase_weight')
  })

  it('sin datos no inventa: mensaje honesto', async () => {
    const provider = new FallbackAIProvider()
    const rec = await provider.generateRecommendation(baseCtx({ historial: [], insights: [] }))
    expect(rec.reason).toContain('Todavía no tengo suficientes datos')
  })

  it('score bajo frena suba de carga', async () => {
    const provider = new FallbackAIProvider()
    const rec = await provider.generateRecommendation(
      baseCtx({ score: { score: 30, factors: [] }, insights: [] }),
    )
    expect(rec.action).not.toBe('increase_weight')
    expect(rec.reason).toContain('30/100')
  })
})

describe('tonos (§17) y score (§21)', () => {
  it('migra tonos legacy a los 4 perfiles', () => {
    expect(mapTone('motivacional')).toBe('PADELERO')
    expect(mapTone('profesional')).toBe('ABUELITOS')
    expect(mapTone('duro')).toBe('ARNOLD')
    expect(mapTone('extremo')).toBe('PSYCHO')
    expect(mapTone('psycho')).toBe('PSYCHO')
    expect(mapTone(null)).toBe('ABUELITOS')
  })

  it('score explica factores y es reproducible', () => {
    const input = {
      adherencePct: 90, recoveryLast: 80, hydrationMl: 2200,
      improvedRecently: true, regressedRecently: false,
      painMax7d: 1, proteinPctGoal: 90, gapDays: 1,
    }
    const a = computeGlobalScore(input)
    const b = computeGlobalScore(input)
    expect(a).toEqual(b)
    expect(a.score).toBe(50 + 15 + 10 + 5 + 10 + 0 + 5 + 3)
    expect(a.factors.find((f) => f.label === 'Adherencia')?.estado).toContain('positivo')
  })

  it('score clamp 0-100 ante extremos', () => {
    const worst = computeGlobalScore({
      adherencePct: 0, recoveryLast: 0, hydrationMl: 0,
      improvedRecently: false, regressedRecently: true,
      painMax7d: 10, proteinPctGoal: 0, gapDays: 30,
    })
    expect(worst.score).toBeGreaterThanOrEqual(0)
    const best = computeGlobalScore({
      adherencePct: 100, recoveryLast: 100, hydrationMl: 3000,
      improvedRecently: true, regressedRecently: false,
      painMax7d: 0, proteinPctGoal: 120, gapDays: 0,
    })
    expect(best.score).toBeLessThanOrEqual(100)
    expect(best.score).toBeGreaterThan(worst.score)
  })
})

describe('memoria Q&A persistente (§18, §26)', () => {
  it('pregunta→respuesta sobrevive (Dexie + espejo)', async () => {
    await saveAnswer('pain:hombro', '¿Sigue molestando?', 'Sí, al press')
    const got = await getAnswer('pain:hombro')
    expect(got?.answer).toBe('Sí, al press')
    expect(got?.question).toContain('molestando')
  })

  it('decisiones fusionan Dexie + local', async () => {
    const all = await getAllDecisions()
    expect(Array.isArray(all)).toBe(true)
  })
})
