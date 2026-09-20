import { describe, it, expect } from 'vitest'
import {
  epley1RM, brzycki1RM, lander1RM, lombardi1RM, mayhew1RM, oConner1RM, wathan1RM,
  calculate1RM, calculateAll1RM, consensus1RM,
  calculateExercisePRs, toUnifiedSets,
  aggregateVolumeLandmarks, buildExerciseHistory,
} from './prs'

describe('PR Service — 1RM Formulas', () => {
  // Caso de referencia: 100kg x 5 reps → ~116kg (Epley), ~112kg (Brzycki)
  const weight = 100
  const reps = 5

  it('Epley: 1RM = w * (1 + r/30)', () => {
    expect(epley1RM(weight, reps)).toBeCloseTo(116.67, 1)
  })

  it('Brzycki: 1RM = w * 36 / (37 - r)', () => {
    expect(brzycki1RM(weight, reps)).toBeCloseTo(112.5, 1)
  })

  it('Lander', () => {
    expect(lander1RM(weight, reps)).toBeCloseTo(113.7, 1)
  })

  it('Lombardi', () => {
    expect(lombardi1RM(weight, reps)).toBeCloseTo(117.5, 1)
  })

  it('Mayhew', () => {
    expect(mayhew1RM(weight, reps)).toBeCloseTo(119.0, 1)
  })

  it("O'Conner", () => {
    expect(oConner1RM(weight, reps)).toBeCloseTo(112.5, 1)
  })

  it('Wathan', () => {
    expect(wathan1RM(weight, reps)).toBeCloseTo(116.6, 1)
  })

  it('calculate1RM devuelve resultado con fórmula y valores originales', () => {
    const r = calculate1RM('epley', weight, reps)
    expect(r.formula).toBe('epley')
    expect(r.weight).toBe(weight)
    expect(r.reps).toBe(reps)
    expect(r.estimated1RM).toBeCloseTo(116.67, 1)
  })

  it('calculateAll1RM devuelve todas las fórmulas', () => {
    const all = calculateAll1RM(weight, reps)
    expect(Object.keys(all).length).toBe(7)
    for (const f of ['epley','brzycki','lander','lombardi','mayhew','oConner','wathan'] as const) {
      expect(all[f].formula).toBe(f)
    }
  })

  it('consensus1RM = media de Epley + Brzycki', () => {
    expect(consensus1RM(weight, reps)).toBeCloseTo((116.67 + 112.5) / 2, 1)
  })

  it('1 rep → 1RM ≈ peso', () => {
    expect(epley1RM(100, 1)).toBeCloseTo(103.3, 1)
    expect(brzycki1RM(100, 1)).toBeCloseTo(100, 1)
    expect(consensus1RM(100, 1)).toBeCloseTo(101.7, 1)
  })

  it('0 reps → devuelve peso (edge case)', () => {
    expect(epley1RM(100, 0)).toBe(100)
    expect(brzycki1RM(100, 0)).toBeCloseTo(97.3, 1)
  })
})

describe('PR Service — Exercise PRs', () => {
  const unifiedSets = [
    { weight: 100, reps: 5, date: '2026-01-15', setRecordId: 's1' },
    { weight: 110, reps: 3, date: '2026-02-10', setRecordId: 's2' },
    { weight: 90, reps: 8, date: '2026-03-01', setRecordId: 's3' },
    { weight: 120, reps: 1, date: '2026-03-20', setRecordId: 's4' },
    { weight: 95, reps: 6, date: '2026-04-05', setRecordId: 's5' },
  ]

  it('calculateExercisePRs encuentra max weight/reps/volume/1RM', () => {
    const prs = calculateExercisePRs(unifiedSets)
    expect(prs.maxWeight).toEqual({ weight: 120, reps: 1, date: '2026-03-20', setRecordId: 's4' })
    expect(prs.maxReps).toEqual({ weight: 90, reps: 8, date: '2026-03-01', setRecordId: 's3' })
    expect(prs.maxVolume).toEqual({ weight: 90, reps: 8, volume: 720, date: '2026-03-01', setRecordId: 's3' })
    expect(prs.maxEstimated1RM).not.toBeNull()
    expect(prs.maxEstimated1RM!.estimated1RM).toBeGreaterThan(120)
  })

  it('PRs con array vacío devuelve nulls', () => {
    const prs = calculateExercisePRs([])
    expect(prs.maxWeight).toBeNull()
    expect(prs.maxReps).toBeNull()
    expect(prs.maxVolume).toBeNull()
    expect(prs.maxEstimated1RM).toBeNull()
  })
})

describe('PR Service — Volume Landmarks', () => {
  const sets = [
    { weight: 100, reps: 5, date: '2026-01-05' }, // Mon week 1
    { weight: 100, reps: 5, date: '2026-01-07' }, // Wed week 1
    { weight: 110, reps: 3, date: '2026-01-12' }, // Mon week 2
    { weight: 90, reps: 8, date: '2026-02-02' },  // Mon week 5 (Feb)
  ]

  it('aggregateVolumeLandmarks weekly agrupa por semana (lunes)', () => {
    const weekly = aggregateVolumeLandmarks(sets, 'weekly')
    expect(weekly.length).toBe(3) // 3 semanas distintas
    expect(weekly[0].date).toBe('2026-01-05')
    expect(weekly[0].totalVolume).toBe(1000) // 500 + 500
    expect(weekly[0].totalSets).toBe(2)
    expect(weekly[1].date).toBe('2026-01-12')
    expect(weekly[1].totalVolume).toBe(330)
  })

  it('aggregateVolumeLandmarks monthly agrupa por mes', () => {
    const monthly = aggregateVolumeLandmarks(sets, 'monthly')
    expect(monthly.length).toBe(2) // Ene + Feb
    expect(monthly[0].date).toBe('2026-01-01')
    expect(monthly[0].totalVolume).toBe(1330)
    expect(monthly[1].date).toBe('2026-02-01')
    expect(monthly[1].totalVolume).toBe(720)
  })
})

describe('PR Service — Exercise History', () => {
  const sets = [
    { weight: 100, reps: 5, date: '2026-01-15', setRecordId: 's1', order: 1 },
    { weight: 105, reps: 5, date: '2026-01-22', setRecordId: 's2', order: 1 },
    { weight: 110, reps: 3, date: '2026-02-10', setRecordId: 's3', order: 1 },
  ]

  it('buildExerciseHistory ordena cronológicamente y calcula volumen/1RM', () => {
    const hist = buildExerciseHistory(sets)
    expect(hist.length).toBe(3)
    expect(hist[0].date).toBe('2026-01-15')
    expect(hist[0].volume).toBe(500)
    expect(hist[0].estimated1RM).toBeCloseTo(consensus1RM(100, 5), 1)
    expect(hist[2].date).toBe('2026-02-10')
  })
})