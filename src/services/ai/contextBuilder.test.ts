import { describe, it, expect, vi } from 'vitest'
import { buildMethodContext } from './systemPrompt'

describe('buildPrompt includes method context', () => {
  it('buildMethodContext returns string with method info', () => {
    const result = buildMethodContext('strength')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain('FUERZA MÁXIMA')
  })

  it('buildMethodContext returns empty for null', () => {
    expect(buildMethodContext(null)).toBe('')
  })

  it('buildMethodContext returns empty for unknown', () => {
    expect(buildMethodContext('nonexistent' as any)).toBe('')
  })

  it('strength method includes defaults and progression', () => {
    const result = buildMethodContext('strength')
    expect(result).toContain('Defaults:')
    expect(result).toContain('Progresión:')
    expect(result).toContain('Patrones de movimiento:')
  })

  it('hypertrophy method includes volume guidance', () => {
    const result = buildMethodContext('hypertrophy')
    expect(result).toContain('Defaults:')
    expect(result).toContain('HIPERTROFIA')
  })

  it('cardio_endurance method includes cardiovascular info', () => {
    const result = buildMethodContext('cardio_endurance')
    expect(result).toContain('Defaults:')
    expect(result).toContain('CARDIO')
  })

  it('all 13 methods produce valid context', () => {
    const methods = ['strength', 'hypertrophy', 'strength_endurance', 'power', 'cardio_endurance', 'hiit', 'functional', 'mobility', 'balance_stability', 'speed', 'full_body', 'torso_legs', 'weider_split']
    for (const m of methods) {
      const result = buildMethodContext(m as any)
      expect(result).toContain('MÉTODO DE ENTRENAMIENTO ACTIVO')
      expect(result).toContain('Defaults:')
    }
  })
})
