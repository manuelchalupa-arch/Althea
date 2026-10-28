import { describe, it, expect } from 'vitest'
import { exercisePurpose, isStretchingExercise } from './stretching'

describe('exercisePurpose — finalidad de un ejercicio', () => {
  it('la categoría del catálogo separa estiramientos', () => {
    expect(exercisePurpose({ category: 'stretching', name: 'Estiramiento de gemelo' })).toBe('stretch')
  })

  it('no clasifica por equipamiento: fuerza con banda es convencional', () => {
    expect(exercisePurpose({ id: 'biceps/band-curl', name: 'Curl con banda', equipment: 'banda', category: 'strength' })).toBe('conventional')
  })

  it('movilidad y calentamiento salen del foco curado', () => {
    expect(exercisePurpose({ focus: 'Movilidad · cadera' })).toBe('mobility')
    expect(exercisePurpose({ focus: 'Calentamiento · cuerpo completo', category: 'strength' })).toBe('warmup')
  })

  it('el purpose explícito manda sobre la categoría', () => {
    expect(exercisePurpose({ purpose: 'warmup', category: 'stretching' })).toBe('warmup')
  })

  it('isStretchingExercise cubre estiramiento y movilidad', () => {
    expect(isStretchingExercise({ focus: 'Movilidad · columna' })).toBe(true)
    expect(isStretchingExercise({ category: 'strength', name: 'Sentadilla con barra' })).toBe(false)
  })
})
