import { describe, it, expect } from 'vitest'
import {
  estimateNeurons,
  utcDayKey,
  secondsUntilUtcMidnight,
  reserveDailyNeurons,
} from '../src/quota.js'

function kvStore() {
  const store = new Map<string, string>()
  return {
    store,
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => { store.set(k, v) },
  }
}

describe('presupuesto diario de neuronas', () => {
  it('estima consumo con Margen conservador', () => {
    const cost = estimateNeurons([{ content: 'x'.repeat(3000) }], 512)
    expect(cost).toBeGreaterThan(0)
    expect(cost).toBeLessThan(30)
  })

  it('la clave del día es UTC', () => {
    expect(utcDayKey(Date.UTC(2026, 10, 26, 23, 59))).toBe('2026-11-26')
    expect(utcDayKey(Date.UTC(2026, 10, 27, 0, 1))).toBe('2026-11-27')
    expect(secondsUntilUtcMidnight(Date.UTC(2026, 10, 26, 23, 59))).toBe(60)
  })

  it('reserva y bloquea al superar el presupuesto', async () => {
    const kv = kvStore()
    const env = { RATE_LIMIT: kv, AI_DAILY_NEURON_BUDGET: '10' }
    const first = await reserveDailyNeurons(env as any, 6)
    expect(first.ok).toBe(true)
    expect(first.remaining).toBe(4)
    const second = await reserveDailyNeurons(env as any, 5)
    expect(second.ok).toBe(false)
    expect([...kv.store.values()]).toEqual(['6'])
  })

  it('sin KV permite pero marca degradado', async () => {
    const out = await reserveDailyNeurons({} as any, 5)
    expect(out.ok).toBe(true)
    expect(out.degraded).toBe(true)
  })
})
