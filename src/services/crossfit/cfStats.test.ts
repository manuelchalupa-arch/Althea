import { describe, it, expect } from 'vitest'
import type { CfMark, CfModality, CfMovement, CfResult, CfWod } from './types'
import {
  avgRpe,
  bestMarkByMovement,
  modalityDistribution,
  prByBenchmark,
  resultsInRange,
  topMovements,
  totalReps,
  totalRounds,
  totalTimeSec,
  weeklyVolume,
} from './cfStats'

const now = '2026-11-01T10:00:00.000Z'

const res = (p: Partial<CfResult> & { id: string; date: string }): CfResult => ({
  wodName: 'WOD',
  format: 'FOR_TIME',
  level: 'rx',
  scoreText: '10:00',
  isBenchmark: false,
  createdAt: now,
  updatedAt: now,
  ...p,
})

const wod = (p: Partial<CfWod> & { id: string }): CfWod => ({
  name: 'WOD',
  format: 'FOR_TIME',
  objective: '',
  modalities: [],
  movements: [],
  equipment: [],
  instructions: [],
  level: 'intermedio',
  isTemplate: false,
  source: 'user',
  createdAt: now,
  updatedAt: now,
  ...p,
})

const mv = (name: string, modality: CfModality): CfMovement => ({ name, modality, order: 0 })

const mark = (p: Partial<CfMark> & { id: string; movement: string; reps: number; valueKg: number; date: string }): CfMark => ({
  createdAt: now,
  updatedAt: now,
  ...p,
})

describe('cfStats — totales y RPE', () => {
  const rs = [
    res({ id: '1', date: '2026-01-01', timeSec: 600, rounds: 5, reps: 12 }),
    res({ id: '2', date: '2026-01-02', timeSec: 300 }),
    res({ id: '3', date: '2026-01-03', reps: 20 }),
  ]

  it('totalTimeSec / totalRounds / totalReps suman lo que existe y cuentan 0 los ausentes', () => {
    expect(totalTimeSec(rs)).toBe(900)
    expect(totalRounds(rs)).toBe(5)
    expect(totalReps(rs)).toBe(32)
    expect(totalTimeSec([])).toBe(0)
    expect(totalRounds([])).toBe(0)
    expect(totalReps([])).toBe(0)
  })

  it('avgRpe devuelve null sin datos y promedia solo los resultados con RPE (1 decimal)', () => {
    expect(avgRpe([])).toBeNull()
    expect(avgRpe([res({ id: '1', date: '2026-01-01' })])).toBeNull()
    expect(avgRpe([res({ id: '1', date: '2026-01-01', rpe: 7 }), res({ id: '2', date: '2026-01-02', rpe: 8 })])).toBe(7.5)
    // Solo los que tienen RPE entran al promedio.
    expect(avgRpe([res({ id: '1', date: '2026-01-01', rpe: 8 }), res({ id: '2', date: '2026-01-02' })])).toBe(8)
    // 1 decimal: (7 + 8 + 8) / 3 = 7.666… → 7.7
    expect(avgRpe([
      res({ id: '1', date: '2026-01-01', rpe: 7 }),
      res({ id: '2', date: '2026-01-02', rpe: 8 }),
      res({ id: '3', date: '2026-01-03', rpe: 8 }),
    ])).toBe(7.7)
  })
})

describe('cfStats — resultsInRange', () => {
  const rs = [
    res({ id: 'a', date: '2026-03-10' }),
    res({ id: 'b', date: '2026-03-15' }),
    res({ id: 'c', date: '2026-03-20' }),
    res({ id: 'd', date: '2026-03-05' }),
  ]

  it('incluye los bordes from y to', () => {
    expect(resultsInRange(rs, '2026-03-10', '2026-03-20').map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('excluye lo que queda afuera y devuelve vacío si no hay coincidencias', () => {
    expect(resultsInRange(rs, '2026-03-11', '2026-03-19').map((r) => r.id)).toEqual(['b'])
    expect(resultsInRange(rs, '2026-04-01', '2026-04-30')).toEqual([])
  })
})

describe('cfStats — modalityDistribution', () => {
  const wods = [
    wod({ id: 'w1', modalities: ['G', 'W'] }),
    wod({ id: 'w2', modalities: ['M'] }),
  ]
  const rs = [
    res({ id: '1', date: '2026-01-01', wodId: 'w1' }),
    res({ id: '2', date: '2026-01-02', wodId: 'w2' }),
    res({ id: '3', date: '2026-01-03', wodId: 'w1' }),
    res({ id: '4', date: '2026-01-04' }), // sin wodId
  ]

  it('cuenta las modalidades de los WODs ejecutados', () => {
    expect(modalityDistribution(wods, rs)).toEqual({ G: 2, M: 1, W: 2 })
  })

  it('ignora resultados sin wod resoluble y arranca en cero', () => {
    expect(modalityDistribution(wods, [res({ id: 'x', date: '2026-01-01', wodId: 'nope' })])).toEqual({ G: 0, M: 0, W: 0 })
    expect(modalityDistribution([], [])).toEqual({ G: 0, M: 0, W: 0 })
  })
})

describe('cfStats — topMovements', () => {
  const wods = [
    wod({ id: 'w1', movements: [mv('Thruster', 'W'), mv('Pull-Ups', 'G')] }),
    wod({ id: 'w2', movements: [mv('Thruster', 'W'), mv('Rowing', 'M')] }),
  ]
  const rs = [
    res({ id: '1', date: '2026-01-01', wodId: 'w1' }),
    res({ id: '2', date: '2026-01-02', wodId: 'w2' }),
    res({ id: '3', date: '2026-01-03', wodId: 'w2' }),
  ]

  it('ordena por frecuencia descendente', () => {
    expect(topMovements(wods, rs, 10)).toEqual([
      { name: 'Thruster', count: 3 },
      { name: 'Rowing', count: 2 },
      { name: 'Pull-Ups', count: 1 },
    ])
  })

  it('respeta el límite', () => {
    expect(topMovements(wods, rs, 2)).toEqual([
      { name: 'Thruster', count: 3 },
      { name: 'Rowing', count: 2 },
    ])
  })

  it('ignora resultados sin wod resoluble', () => {
    expect(topMovements(wods, [res({ id: 'x', date: '2026-01-01', wodId: 'nope' })], 5)).toEqual([])
  })
})

describe('cfStats — bestMarkByMovement', () => {
  const marks = [
    mark({ id: '1', movement: 'Back Squat', reps: 1, valueKg: 100, date: '2026-01-01' }),
    mark({ id: '2', movement: 'Back Squat', reps: 1, valueKg: 120, date: '2026-02-01' }),
    // Empate 120 kg con la anterior: gana la fecha más reciente.
    mark({ id: '3', movement: 'Back Squat', reps: 5, valueKg: 120, date: '2026-03-01' }),
    mark({ id: '4', movement: 'Snatch', reps: 1, valueKg: 80, date: '2026-01-15' }),
  ]

  it('mejor valueKg por movimiento y empate por date más reciente', () => {
    const best = bestMarkByMovement(marks)
    expect(best.get('Back Squat')?.id).toBe('3')
    expect(best.get('Snatch')?.id).toBe('4')
    expect(best.size).toBe(2)
  })

  it('no depende del orden de entrada', () => {
    expect(bestMarkByMovement([...marks].reverse()).get('Back Squat')?.id).toBe('3')
  })
})

describe('cfStats — prByBenchmark', () => {
  const rs = [
    res({ id: 'a', date: '2026-01-01', benchmarkId: 'fran', timeSec: 600 }),
    res({ id: 'b', date: '2026-02-01', benchmarkId: 'fran', timeSec: 540 }),
    res({ id: 'c', date: '2026-03-01', benchmarkId: 'fran', timeSec: 570 }),
    res({ id: 'd', date: '2026-01-05', benchmarkId: 'amrap12', rounds: 8, reps: 12 }),
    res({ id: 'e', date: '2026-02-05', benchmarkId: 'amrap12', rounds: 9 }),
    // Empate en rondas y reps con 'e': gana la fecha más reciente.
    res({ id: 'f', date: '2026-03-05', benchmarkId: 'amrap12', rounds: 9 }),
    res({ id: 'g', date: '2026-01-01', benchmarkId: 'chipper', rounds: 3, reps: 10 }),
    res({ id: 'j', date: '2026-02-01', benchmarkId: 'chipper', rounds: 3, reps: 30 }),
    // Sin timeSec el resultado con tiempo le gana.
    res({ id: 'h', date: '2026-04-01', benchmarkId: 'mixed', timeSec: 400 }),
    res({ id: 'i', date: '2026-05-01', benchmarkId: 'mixed', rounds: 20 }),
    // Sin benchmarkId no entra.
    res({ id: 'k', date: '2026-06-01' }),
  ]

  it('menor timeSec gana entre resultados con tiempo', () => {
    expect(prByBenchmark(rs).get('fran')?.id).toBe('b')
  })

  it('sin tiempo manda mayor rounds y después mayor reps', () => {
    expect(prByBenchmark(rs).get('amrap12')?.id).toBe('f')
    expect(prByBenchmark(rs).get('chipper')?.id).toBe('j')
  })

  it('un resultado con tiempo le gana a uno sin tiempo', () => {
    expect(prByBenchmark(rs).get('mixed')?.id).toBe('h')
  })

  it('ignora resultados sin benchmarkId', () => {
    const prs = prByBenchmark(rs)
    expect(prs.has('')).toBe(false)
    expect([...prs.keys()].sort()).toEqual(['amrap12', 'chipper', 'fran', 'mixed'])
  })
})

describe('cfStats — weeklyVolume', () => {
  const rs = [
    res({ id: '1', date: '2026-11-08', timeSec: 300 }), // semana anterior
    res({ id: '2', date: '2026-11-09', timeSec: 600, rounds: 5 }),
    res({ id: '3', date: '2026-11-09', timeSec: 120 }), // mismo día: cuenta 1 día
    res({ id: '4', date: '2026-11-15', rounds: 3 }), // último día de la semana (borde)
    res({ id: '5', date: '2026-11-16', timeSec: 999 }), // semana siguiente
    res({ id: '6', date: '2026-11-12', timeSec: 60 }), // tercer día dentro de la semana
  ]

  it('cuenta días distintos con resultado y suma tiempo/rondas de la semana', () => {
    expect(weeklyVolume(rs, '2026-11-09')).toEqual({ daysWithResult: 3, totalTimeSec: 780, totalRounds: 8 })
  })

  it('devuelve cero con la semana vacía', () => {
    expect(weeklyVolume([], '2026-11-09')).toEqual({ daysWithResult: 0, totalTimeSec: 0, totalRounds: 0 })
  })
})
