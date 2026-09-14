import { describe, it, expect } from 'vitest'
import { checkCompatibility, checkGroupCompatibility, getAdjustedVolume } from './compatibilityEngine'

describe('checkCompatibility', () => {
  it('strength + hypertrophy compatible with low interference', () => {
    const c = checkCompatibility('strength', 'hypertrophy')
    expect(c.compatible).toBe(true)
    expect(c.interference).toBe('low')
    expect(c.recoveryImpact).toBe('moderate')
  })

  it('strength + mobility compatible with no interference', () => {
    const c = checkCompatibility('strength', 'mobility')
    expect(c.compatible).toBe(true)
    expect(c.interference).toBe('none')
    expect(c.recoveryImpact).toBe('minimal')
  })

  it('hiit + power compatible but high interference', () => {
    const c = checkCompatibility('hiit', 'power')
    expect(c.compatible).toBe(true)
    expect(c.interference).toBe('high')
    expect(c.recoveryImpact).toBe('significant')
  })

  it('functional + mobility compatible with no interference', () => {
    const c = checkCompatibility('functional', 'mobility')
    expect(c.compatible).toBe(true)
    expect(c.interference).toBe('none')
  })

  it('returns default for unknown pairs', () => {
    const c = checkCompatibility('speed', 'balance_stability')
    expect(c.compatible).toBe(true)
  })

  it('symmetric compatibility', () => {
    const c1 = checkCompatibility('strength', 'hiit')
    const c2 = checkCompatibility('hiit', 'strength')
    expect(c1.compatible).toBe(c2.compatible)
    expect(c1.interference).toBe(c2.interference)
  })
})

describe('checkGroupCompatibility', () => {
  it('compatible group of 3 methods', () => {
    const r = checkGroupCompatibility(['strength', 'mobility', 'balance_stability'])
    expect(r.compatible).toBe(true)
    expect(r.totalInterference).toBeLessThan(0.5)
  })

  it('incompatible group detects high interference', () => {
    const r = checkGroupCompatibility(['strength', 'hiit', 'power'])
    expect(r.recommendations.length).toBeGreaterThan(0)
  })
})

describe('getAdjustedVolume', () => {
  it('strength + mobility gives full volume', () => {
    const v = getAdjustedVolume(['strength', 'mobility'], 20)
    expect(v).toBe(20)
  })

  it('strength + hiit reduces volume', () => {
    const v = getAdjustedVolume(['strength', 'hiit'], 20)
    expect(v).toBeLessThan(20)
  })
})
