import { describe, it, expect } from 'vitest'
import { recoveryIndex } from './calc'

describe('índice de recuperación (§20, §40)', () => {
  const mid = { energy: 5, fatigue: 5, pain: 5, mood: 5, motivation: 5, perceivedExertion: 5, stress: 5 }
  it('todo medio -> 50', () => {
    // (5+5+5 + 6+6+6+6)/70 = 39/70 -> 56? no: (15+24)/70=55.7 -> 56
    expect(recoveryIndex(mid)).toBe(56)
  })
  it('todo óptimo -> 100', () => {
    expect(recoveryIndex({ energy: 10, fatigue: 1, pain: 1, mood: 10, motivation: 10, perceivedExertion: 1, stress: 1 })).toBe(100)
  })
  it('todo pésimo -> bajo', () => {
    expect(recoveryIndex({ energy: 1, fatigue: 10, pain: 10, mood: 1, motivation: 1, perceivedExertion: 10, stress: 10 })).toBeLessThanOrEqual(15)
  })
  it('más dolor/fatiga/estrés NUNCA sube el índice', () => {
    const base = { ...mid }
    const a = recoveryIndex(base)
    expect(recoveryIndex({ ...base, pain: 9 })).toBeLessThan(a)
    expect(recoveryIndex({ ...base, fatigue: 9 })).toBeLessThan(a)
    expect(recoveryIndex({ ...base, stress: 9 })).toBeLessThan(a)
    expect(recoveryIndex({ ...base, perceivedExertion: 9 })).toBeLessThan(a)
    expect(recoveryIndex({ ...base, energy: 9 })).toBeGreaterThan(a)
  })
  it('clamp fuera de rango', () => {
    const r = recoveryIndex({ energy: 99, fatigue: -5, pain: 5, mood: 5, motivation: 5, perceivedExertion: 5, stress: 5 })
    expect(r).toBeGreaterThanOrEqual(0)
    expect(r).toBeLessThanOrEqual(100)
  })
})
