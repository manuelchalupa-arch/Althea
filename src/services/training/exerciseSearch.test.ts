import { describe, it, expect } from 'vitest'
import { normalize, matchesQuery, exerciseMatches, getSynonyms } from './exerciseSearch'

describe('normalize', () => {
  it('convierte a minúsculas', () => {
    expect(normalize('Press Banca')).toBe('press banca')
  })

  it('elimina acentos', () => {
    expect(normalize('sillón')).toBe('sillon')
    expect(normalize('cuádriceps')).toBe('cuadriceps')
    expect(normalize('extensión')).toBe('extension')
  })

  it('maneja ñ', () => {
    expect(normalize('jalón')).toBe('jalon')
  })
})

describe('matchesQuery', () => {
  it('coincidencia básica case-insensitive', () => {
    expect(matchesQuery('Press Banca', 'press')).toBe(true)
    expect(matchesQuery('Press Banca', 'PRESS')).toBe(true)
  })

  it('tolera acentos en query y texto', () => {
    expect(matchesQuery('sillón de cuádriceps', 'sillon')).toBe(true)
    expect(matchesQuery('sillon de cuadriceps', 'sillón')).toBe(true)
    expect(matchesQuery('extensión de pierna', 'extension')).toBe(true)
  })

  it('tolera singular/plural', () => {
    expect(matchesQuery('ejercicios', 'ejercicio')).toBe(true)
    expect(matchesQuery('ejercicio', 'ejercicios')).toBe(true)
    expect(matchesQuery('dominadas', 'dominada')).toBe(true)
  })

  it('query vacía siempre coincide', () => {
    expect(matchesQuery('cualquier cosa', '')).toBe(true)
  })

  it('no coincide cuando no hay relación', () => {
    expect(matchesQuery('press banca', 'sentadilla')).toBe(false)
  })
})

describe('getSynonyms', () => {
  it('encuentra sinónimos ES↔EN', () => {
    const syns = getSynonyms('sillón de cuádriceps')
    expect(syns).toContain('leg extension')
    expect(syns).toContain('quadriceps extension')
  })

  it('encuentra sinónimos inversos', () => {
    const syns = getSynonyms('leg extension')
    expect(syns).toContain('sillon de cuadriceps')
    expect(syns).toContain('extension de piernas')
  })

  it('retorna vacío para término desconocido', () => {
    expect(getSynonyms('término inexistente')).toEqual([])
  })
})

describe('exerciseMatches', () => {
  const exercise = {
    name: 'Leg Extension',
    muscle: 'quadriceps',
    bodyPart: 'legs',
    equipment: 'machine',
    category: 'strength',
    secondaryMuscles: [],
    instructions: ['Sit on the machine', 'Extend your legs'],
    muscleBreakdown: [{ name: 'quadriceps' }],
  }

  it('encuentra por nombre directo', () => {
    expect(exerciseMatches(exercise, 'leg extension')).toBe(true)
  })

  it('encuentra por sinónimo ES', () => {
    expect(exerciseMatches(exercise, 'sillón de cuádriceps')).toBe(true)
    expect(exerciseMatches(exercise, 'extensión de piernas')).toBe(true)
  })

  it('encuentra por músculo', () => {
    expect(exerciseMatches(exercise, 'cuadriceps')).toBe(true)
  })

  it('encuentra por equipamiento', () => {
    expect(exerciseMatches(exercise, 'machine')).toBe(true)
  })

  it('encuentra por instrucción', () => {
    expect(exerciseMatches(exercise, 'extend your legs')).toBe(true)
  })

  it('query vacía siempre coincide', () => {
    expect(exerciseMatches(exercise, '')).toBe(true)
  })

  it('no coincide con término irrelevante', () => {
    expect(exerciseMatches(exercise, 'yoga')).toBe(false)
  })

  it('funciona con ejercicio sin campos opcionales', () => {
    const minimal = { name: 'Sentadilla' }
    expect(exerciseMatches(minimal, 'squat')).toBe(true)
    expect(exerciseMatches(minimal, 'sentadilla')).toBe(true)
  })
})
