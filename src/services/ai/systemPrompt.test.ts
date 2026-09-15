import { describe, it, expect } from 'vitest'
import { buildMethodContext, SYSTEM_PROMPT, TRAINING_GOAL_PROFILES, EXPERIENCE_INSTRUCTIONS, PERSONALITY_INSTRUCTION, mapTone } from './systemPrompt'

describe('buildMethodContext', () => {
  it('returns empty string for null/undefined', () => {
    expect(buildMethodContext(null)).toBe('')
    expect(buildMethodContext(undefined)).toBe('')
  })

  it('returns empty string for unknown method', () => {
    expect(buildMethodContext('unknown_method' as any)).toBe('')
  })

  it('returns rich context for strength method', () => {
    const ctx = buildMethodContext('strength')
    expect(ctx).toContain('FUERZA MÁXIMA')
    expect(ctx).toContain('Estructura:')
    expect(ctx).toContain('Defaults:')
    expect(ctx).toContain('Progresión:')
    expect(ctx).toContain('Patrones de movimiento:')
    expect(ctx).toContain('compound')
  })

  it('returns rich context for hypertrophy method', () => {
    const ctx = buildMethodContext('hypertrophy')
    expect(ctx).toContain('HIPERTROFIA')
    expect(ctx).toContain('MÉTODO DE ENTRENAMIENTO ACTIVO')
  })

  it('returns context for mobility method', () => {
    const ctx = buildMethodContext('mobility')
    expect(ctx).toContain('MOVILIDAD')
  })

  it('includes avoidExercises when present', () => {
    const ctx = buildMethodContext('power')
    expect(ctx).toContain('Evitar:')
  })

  it('omits Evitar when no avoidExercises', () => {
    const ctx = buildMethodContext('strength')
    expect(ctx).not.toContain('Evitar:')
  })

  it('mentions respetar método in instruction', () => {
    const ctx = buildMethodContext('strength')
    expect(ctx).toContain('respetá este método')
  })
})

describe('TRAINING_GOAL_PROFILES', () => {
  it('has all 5 goals', () => {
    expect(Object.keys(TRAINING_GOAL_PROFILES)).toHaveLength(5)
    expect(TRAINING_GOAL_PROFILES.strength).toContain('FUERZA')
    expect(TRAINING_GOAL_PROFILES.hypertrophy).toContain('HIPERTROFIA')
    expect(TRAINING_GOAL_PROFILES.fat_loss).toContain('PÉRDIDA')
    expect(TRAINING_GOAL_PROFILES.mobility).toContain('MOVILIDAD')
    expect(TRAINING_GOAL_PROFILES.general_health).toContain('SALUD')
  })
})

describe('EXPERIENCE_INSTRUCTIONS', () => {
  it('has all 3 levels', () => {
    expect(Object.keys(EXPERIENCE_INSTRUCTIONS)).toHaveLength(3)
    expect(EXPERIENCE_INSTRUCTIONS.beginner).toContain('PRINCIPIANTE')
    expect(EXPERIENCE_INSTRUCTIONS.intermediate).toContain('INTERMEDIO')
    expect(EXPERIENCE_INSTRUCTIONS.advanced).toContain('AVANZADO')
  })
})

describe('PERSONALITY_INSTRUCTION', () => {
  it('has all 4 official tones', () => {
    expect(Object.keys(PERSONALITY_INSTRUCTION)).toContain('PADELERO')
    expect(Object.keys(PERSONALITY_INSTRUCTION)).toContain('ABUELITOS')
    expect(Object.keys(PERSONALITY_INSTRUCTION)).toContain('ARNOLD')
    expect(Object.keys(PERSONALITY_INSTRUCTION)).toContain('PSYCHO')
  })
})

describe('mapTone', () => {
  it('maps legacy tones', () => {
    expect(mapTone('MOTIVACIONAL')).toBe('PADELERO')
    expect(mapTone('PROFESIONAL')).toBe('ABUELITOS')
    expect(mapTone('DURO')).toBe('ARNOLD')
    expect(mapTone('EXTREMO')).toBe('PSYCHO')
  })

  it('maps official tones as-is', () => {
    expect(mapTone('PADELERO')).toBe('PADELERO')
    expect(mapTone('ABUELITOS')).toBe('ABUELITOS')
    expect(mapTone('ARNOLD')).toBe('ARNOLD')
    expect(mapTone('PSYCHO')).toBe('PSYCHO')
  })

  it('defaults to ABUELITOS', () => {
    expect(mapTone(null)).toBe('ABUELITOS')
    expect(mapTone('')).toBe('ABUELITOS')
    expect(mapTone('unknown')).toBe('ABUELITOS')
  })
})

describe('SYSTEM_PROMPT', () => {
  it('contains exercise API reference', () => {
    expect(SYSTEM_PROMPT).toContain('ExerciseGymGifsDB')
  })

  it('contains nutrition API reference', () => {
    expect(SYSTEM_PROMPT).toContain('Codulia')
  })

  it('has JSON output format', () => {
    expect(SYSTEM_PROMPT).toContain('type')
    expect(SYSTEM_PROMPT).toContain('training_recommendation')
  })
})
