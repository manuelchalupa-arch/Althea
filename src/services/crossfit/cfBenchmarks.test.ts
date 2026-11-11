import { describe, it, expect } from 'vitest'
import { CF_BENCHMARKS, getBenchmark, isBetterResult, parseClockToSec } from './cfBenchmarks'

describe('cfBenchmarks — catálogo y helpers puros', () => {
  it('getBenchmark encuentra uno existente y devuelve undefined para otro', () => {
    expect(getBenchmark('fran')?.name).toBe('Fran')
    expect(getBenchmark('murph')?.category).toBe('hero')
    expect(getBenchmark('no-existe')).toBeUndefined()
  })

  it('catálogo: Girls y Heroes cubiertos, todos con movimientos y scoreType', () => {
    // Mínimos (no conteos exactos): la categorización se corrige por precisión
    // histórica sin romper este guard.
    expect(CF_BENCHMARKS.filter((b) => b.category === 'girl').length).toBeGreaterThanOrEqual(10)
    expect(CF_BENCHMARKS.filter((b) => b.category === 'hero').length).toBeGreaterThanOrEqual(6)
    expect(CF_BENCHMARKS.every((b) => b.movements.length > 0)).toBe(true)
    expect(CF_BENCHMARKS.every((b) => b.scoreType === 'time' || b.scoreType === 'volume')).toBe(true)
    expect(new Set(CF_BENCHMARKS.map((b) => b.id)).size).toBe(CF_BENCHMARKS.length)
  })

  it('isBetterResult en "time": menor gana, empate false, sin tiempo no mejora', () => {
    expect(isBetterResult('time', { timeSec: 500 }, { timeSec: 462 })).toBe(true)
    expect(isBetterResult('time', { timeSec: 462 }, { timeSec: 500 })).toBe(false)
    expect(isBetterResult('time', { timeSec: 462 }, { timeSec: 462 })).toBe(false)
    expect(isBetterResult('time', { timeSec: 462 }, { rounds: 8 })).toBe(false)
    expect(isBetterResult('time', { rounds: 8 }, { timeSec: 462 })).toBe(true)
  })

  it('isBetterResult en "volume": mayor gana, empate false', () => {
    expect(isBetterResult('volume', { rounds: 8, reps: 12 }, { rounds: 9, reps: 0 })).toBe(true)
    expect(isBetterResult('volume', { rounds: 9 }, { rounds: 8 })).toBe(false)
    expect(isBetterResult('volume', { rounds: 8, reps: 10 }, { rounds: 8, reps: 12 })).toBe(true)
    expect(isBetterResult('volume', { rounds: 8, reps: 12 }, { rounds: 8, reps: 12 })).toBe(false)
  })

  it('isBetterResult con prev null es true (primer resultado)', () => {
    expect(isBetterResult('time', null, { timeSec: 462 })).toBe(true)
    expect(isBetterResult('volume', null, { rounds: 1 })).toBe(true)
  })

  it('parseClockToSec: reloj m:ss y h:mm:ss, segundos planos e inválidos', () => {
    expect(parseClockToSec('7:42')).toBe(462)
    expect(parseClockToSec('1:05:00')).toBe(3900)
    expect(parseClockToSec('90')).toBe(90)
    expect(parseClockToSec('2250')).toBe(2250)
    expect(parseClockToSec(' 7:42 ')).toBe(462)
    expect(parseClockToSec('7:99')).toBeNull()
    expect(parseClockToSec('1:65:30')).toBeNull()
    expect(parseClockToSec('abc')).toBeNull()
    expect(parseClockToSec('')).toBeNull()
    expect(parseClockToSec('7:42:00:00')).toBeNull()
  })
})
