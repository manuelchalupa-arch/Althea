import { describe, it, expect } from 'vitest'
import { computeNextTargets, explainDecision, type ProgressionRule } from './progression'

const set = (reps: number, weight: number | null, order = 1): any => ({
  order, reps, weight, setType: 'NORMAL' as const,
})

describe('Progresión lineal', () => {
  const rule: ProgressionRule = { kind: 'linear', incrementKg: 2.5 }

  it('aumenta peso cuando todas las series se completan', () => {
    const prev = [set(8, 40), set(8, 40), set(8, 40)]
    const d = computeNextTargets(prev, rule)
    expect(d.increasedLoad).toBe(true)
    expect(d.nextSets.every((s) => s.weight === 42.5)).toBe(true)
    expect(d.reason).toContain('+2.5 kg')
  })

  it('mantiene peso cuando alguna serie no se completó (reps 0)', () => {
    const prev = [set(8, 40), set(0, 40), set(8, 40)]
    const d = computeNextTargets(prev, rule)
    expect(d.increasedLoad).toBe(false)
    expect(d.nextSets.every((s) => s.weight === 40)).toBe(true)
  })

  it('sin series previas devuelve vacío', () => {
    const d = computeNextTargets([], rule)
    expect(d.nextSets).toEqual([])
    expect(d.increasedLoad).toBe(false)
  })

  it('sin reps realizados no progresa', () => {
    const prev = [set(0, 40), set(0, 40)]
    const d = computeNextTargets(prev, rule)
    expect(d.increasedLoad).toBe(false)
  })
})

describe('Progresión Greyskull LP', () => {
  const rule: ProgressionRule = { kind: 'greyskull', amrapSetIndex: 2, incrementKg: 2.5, minRepsIncrease: 2 }

  it('aumenta peso cuando el set AMRAP supera el mínimo', () => {
    const prev = [set(8, 40), set(8, 40), set(12, 40)]
    const d = computeNextTargets(prev, rule)
    expect(d.increasedLoad).toBe(true)
    expect(d.nextSets[2]?.weight).toBe(42.5)
  })

  it('mantiene peso cuando el AMRAP no supera el mínimo', () => {
    const prev = [set(8, 40), set(8, 40), set(9, 40)]
    const d = computeNextTargets(prev, rule)
    expect(d.increasedLoad).toBe(false)
    expect(d.nextSets[2]?.weight).toBe(40)
  })
})

describe('Progresión doble (double progression)', () => {
  const rule: ProgressionRule = { kind: 'double', repRange: [8, 12], incrementKg: 2.5 }

  it('sube reps cuando no todas están en el tope', () => {
    const prev = [set(8, 40), set(9, 40), set(10, 40)]
    const d = computeNextTargets(prev, rule)
    expect(d.increasedLoad).toBe(false)
    expect(d.nextSets.every((s) => s.weight === 40)).toBe(true)
    expect(d.nextSets[0]?.reps).toBe(9)
  })

  it('aumenta peso y resetea reps cuando todas están en el tope', () => {
    const prev = [set(12, 40), set(12, 40), set(12, 40)]
    const d = computeNextTargets(prev, rule)
    expect(d.increasedLoad).toBe(true)
    expect(d.nextSets.every((s) => s.weight === 42.5)).toBe(true)
    expect(d.nextSets.every((s) => s.reps === 8)).toBe(true)
  })
})

describe('explainDecision', () => {
  it('devuelve la razón de la decisión', () => {
    const rule: ProgressionRule = { kind: 'linear', incrementKg: 2.5 }
    const d = computeNextTargets([set(8, 40), set(8, 40)], rule)
    expect(explainDecision(d)).toBe(d.reason)
  })
})
