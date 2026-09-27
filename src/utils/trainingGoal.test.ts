import { describe, it, expect } from 'vitest'
import { resolveTrainingGoal, GOAL_TO_TRAINING_GOAL, isValidTrainingGoal } from './trainingGoal'
import type { Goal, UserProfile } from '@/types'

const EMPTY: Partial<UserProfile> = {}

describe('trainingGoal — fuente canónica del objetivo (~FASE 2-S2)', () => {
  it('C1: perfiles nuevos (trainingGoal canónico) se resuelven tal cual', () => {
    expect(resolveTrainingGoal({ trainingGoal: 'fat_loss' } as UserProfile)).toBe('fat_loss')
    expect(resolveTrainingGoal({ trainingGoal: 'strength' } as UserProfile)).toBe('strength')
    expect(resolveTrainingGoal({ trainingGoal: 'hypertrophy' } as UserProfile)).toBe('hypertrophy')
    expect(resolveTrainingGoal({ trainingGoal: 'mobility' } as UserProfile)).toBe('mobility')
    expect(resolveTrainingGoal({ trainingGoal: 'general_health' } as UserProfile)).toBe('general_health')
  })

  it('C2: trainingGoal tiene prioridad sobre legacy goal/goalPrimary', () => {
    expect(resolveTrainingGoal({ trainingGoal: 'strength', goal: 'hipertrofia', goalPrimary: 'bajar grasa' } as UserProfile)).toBe('strength')
    expect(resolveTrainingGoal({ trainingGoal: 'mobility' as UserProfile['trainingGoal'], goalPrimary: 'ganar masa' } as UserProfile)).toBe('mobility')
  })

  it('C3: legacy goal (español) se mapea de forma determinista', () => {
    expect(resolveTrainingGoal({ goal: 'hipertrofia' } as UserProfile)).toBe('hypertrophy')
    expect(resolveTrainingGoal({ goal: 'fuerza' } as UserProfile)).toBe('strength')
    expect(resolveTrainingGoal({ goal: 'perdida_peso' } as UserProfile)).toBe('fat_loss')
    expect(resolveTrainingGoal({ goal: 'movilidad' } as UserProfile)).toBe('mobility')
    expect(resolveTrainingGoal({ goal: 'resistencia' as Goal } as UserProfile)).toBe('general_health')
  })

  it('C4: goalPrimary libre (keywords) resuelve y nunca devuelve undefined para valores conocidos', () => {
    expect(resolveTrainingGoal({ goalPrimary: 'quiero bajar grasa y perder peso' } as UserProfile)).toBe('fat_loss')
    expect(resolveTrainingGoal({ goalPrimary: 'hipertrofia de piernas' } as UserProfile)).toBe('hypertrophy')
    expect(resolveTrainingGoal({ goalPrimary: 'enfocado en fuerza y potencia' } as UserProfile)).toBe('strength')
    expect(resolveTrainingGoal({ goalPrimary: 'movilidad y rango' } as UserProfile)).toBe('mobility')
    expect(resolveTrainingGoal({ goalPrimary: 'texto no relacionado' } as UserProfile)).toBeUndefined()
  })

  it('C5: sin ningún dato resoluble devuelve undefined (callers aplican su propio default)', () => {
    expect(resolveTrainingGoal(undefined)).toBeUndefined()
    expect(resolveTrainingGoal(EMPTY)).toBeUndefined()
    expect(resolveTrainingGoal({ goalPrimary: '' } as UserProfile)).toBeUndefined()
    expect(resolveTrainingGoal({ goal: 'personalizado' as Goal } as UserProfile)).toBe('general_health')
  })

  it('mapa legacy cubre todos los Goal conocidos sin dejar huecos', () => {
    const legacy: Array<{ g: Goal; tg?: string }> = [
      { g: 'hipertrofia', tg: 'hypertrophy' },
      { g: 'fuerza', tg: 'strength' },
      { g: 'perdida_peso', tg: 'fat_loss' },
      { g: 'movilidad', tg: 'mobility' },
      { g: 'resistencia', tg: 'general_health' },
      { g: 'recomposicion', tg: 'general_health' },
      { g: 'mantenimiento', tg: 'general_health' },
      { g: 'personalizado', tg: 'general_health' },
    ]
    for (const { g, tg } of legacy) expect(GOAL_TO_TRAINING_GOAL[g]).toBe(tg)
  })

  it('isValidTrainingGoal valida solo los valores canónicos English', () => {
    expect(isValidTrainingGoal('hypertrophy')).toBe(true)
    expect(isValidTrainingGoal('fat_loss')).toBe(true)
    expect(isValidTrainingGoal('strength')).toBe(true)
    expect(isValidTrainingGoal('mobility')).toBe(true)
    expect(isValidTrainingGoal('general_health')).toBe(true)
    expect(isValidTrainingGoal('hipertrofia')).toBe(false)
    expect(isValidTrainingGoal('')).toBe(false)
  })
})