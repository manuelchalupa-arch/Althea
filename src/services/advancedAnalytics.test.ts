import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/services/storage/db'
import { projectProgress, loadFatigueBalance } from './training/metrics'
import { analyzeExercise, analyzeGlobal } from './ai/progressAnalyzer'
import { learnFromExposures, learnPatterns } from './ai/patternLearning'

async function seedSets(exerciseId: string, days: { date: string; weight: number; reps: number }[]) {
  for (let i = 0; i < days.length; i++) {
    const d = days[i]
    await db.setRecords.put({
      setRecordId: `s${i}:set:1`, sessionId: `s${i}`, sessionExerciseId: `se${i}`,
      exerciseId, order: 1, setType: 'NORMAL',
      plannedReps: d.reps, plannedWeight: d.weight, actualReps: d.reps, actualWeight: d.weight,
      status: 'COMPLETED', completedAt: `${d.date}T10:00:00Z`,
      createdAt: `${d.date}T10:00:00Z`, updatedAt: `${d.date}T10:00:00Z`,
    } as never)
  }
}

describe('ET15 — Analítica avanzada honesta', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('proyección: insuficiente con <4 puntos; etiquetada como estimación', () => {
    expect(projectProgress([{ value: 1 }, { value: 2 }, { value: 3 }])).toBeNull()
    const p = projectProgress([
      { date: '2026-09-01', value: 100 },
      { date: '2026-09-08', value: 110 },
      { date: '2026-09-15', value: 120 },
      { date: '2026-09-22', value: 130 },
    ])
    expect(p).not.toBeNull()
    expect(p!.kind).toBe('estimacion')
    expect(p!.basis).toMatch(/no es un hecho/)
    expect(p!.estimate).toBeGreaterThan(130)
  })

  it('meseta: sin evidencia suficiente no se afirma', async () => {
    await seedSets('ex-006', [
      { date: '2026-09-01', weight: 80, reps: 8 },
      { date: '2026-09-08', weight: 80, reps: 8 },
    ])
    const r = await analyzeExercise('ex-006')
    expect(r.sufficientData).toBe(false)
  })

  it('meseta: con evidencia suficiente se detecta', async () => {
    const days = ['2026-07-01', '2026-07-08', '2026-07-15', '2026-07-22', '2026-07-29', '2026-08-05', '2026-08-12', '2026-08-19']
    await seedSets('ex-006', days.map(date => ({ date, weight: 80, reps: 8 })))
    const r = await analyzeExercise('ex-006', 12)
    expect(r.sufficientData).toBe(true)
    expect(r.trend).toBe('plateau')
  })

  it('balance: carga calculada vs fatiga declarada, nunca estimada', () => {
    const empty = loadFatigueBalance({ volume7d: 0, sessions7d: 0 })
    expect(empty.balance).toBe('datos-insuficientes')
    expect(empty.reportedFatigue).toBeNull()
    const ok = loadFatigueBalance({ volume7d: 5000, sessions7d: 3, fatigueAvg: 4, sleepAvg: 7.5 })
    expect(ok.load).toBe('moderado')
    expect(ok.balance).toBe('ok')
    expect(ok.basis).toMatch(/Fatiga declarada/)
    const over = loadFatigueBalance({ volume7d: 15000, sessions7d: 6, fatigueAvg: 8, sleepAvg: 5.5 })
    expect(over.balance).toBe('sobrecarga-posible')
    // Sin fatiga declarada no se inventa: se informa la carencia
    const noDecl = loadFatigueBalance({ volume7d: 15000, sessions7d: 6 })
    expect(noDecl.reportedFatigue).toBeNull()
    expect(noDecl.basis).toMatch(/Sin fatiga declarada/)
  })

  it('global sin sesiones suficientes no afirma', async () => {
    const r = await analyzeGlobal()
    expect(r.sufficientData).toBe(false)
  })
})

describe('ET16 — Aprendizaje observacional por niveles', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('hecho/patrón/hipótesis/recomendación con evidencia, sin causalidad', async () => {
    await seedSets('ex-006', [
      { date: '2026-06-01', weight: 70, reps: 8 },
      { date: '2026-06-08', weight: 72, reps: 8 },
      { date: '2026-06-15', weight: 75, reps: 8 },
      { date: '2026-06-22', weight: 77, reps: 8 },
      { date: '2026-06-29', weight: 80, reps: 8 },
    ])
    await db.recoveryChecks.put({
      id: '2026-06-22', localDate: '2026-06-22', energy: 8, fatigue: 2, stress: 3,
      motivation: 8, score: 80, color: 'green', sleepHours: 8,
    } as never)
    const patterns = await learnPatterns()
    const kinds = new Set(patterns.map(p => p.kind))
    expect(kinds.has('hecho')).toBe(true)
    expect(kinds.has('patron')).toBe(true)
    expect(kinds.has('recomendacion')).toBe(true)
    for (const p of patterns) {
      expect(p.evidence.length).toBeGreaterThan(0)
      expect(p.statement).not.toMatch(/causa|demostrado|comprobado/i)
    }
  })

  it('pocos datos → sin patrones; regresión detectada como patrón', () => {
    const few = learnFromExposures(new Map([
      ['ex-1', [
        { exerciseId: 'ex-1', date: '2026-09-01', bestWeight: 80, bestReps: 8, volume: 640 },
        { exerciseId: 'ex-1', date: '2026-09-08', bestWeight: 80, bestReps: 8, volume: 640 },
      ]],
    ]))
    expect(few).toEqual([])
    const reg = learnFromExposures(new Map([
      ['ex-2', [
        { exerciseId: 'ex-2', date: '2026-06-01', bestWeight: 100, bestReps: 5, volume: 500 },
        { exerciseId: 'ex-2', date: '2026-06-08', bestWeight: 100, bestReps: 5, volume: 500 },
        { exerciseId: 'ex-2', date: '2026-06-15', bestWeight: 90, bestReps: 5, volume: 450 },
        { exerciseId: 'ex-2', date: '2026-06-22', bestWeight: 85, bestReps: 5, volume: 425 },
      ]],
    ]))
    expect(reg.some(p => p.kind === 'patron' && p.statement.includes('regresión'))).toBe(true)
    expect(reg.some(p => p.kind === 'recomendacion')).toBe(true)
  })

  it('vacío → sin patrones (no se inventa)', async () => {
    expect(await learnPatterns()).toEqual([])
  })
})
