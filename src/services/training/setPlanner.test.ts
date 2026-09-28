import { describe, it, expect } from 'vitest'
import { generatePlannedSets, seriesTypeToSetType } from './setPlanner'

describe('generatePlannedSets', () => {
  it('genera series normales iguales', () => {
    const result = generatePlannedSets({
      sets: 3,
      baseWeight: 80,
      baseReps: 10,
      seriesType: 'Normal',
    })

    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ order: 1, reps: 10, weight: 80, setType: 'NORMAL' })
    expect(result[1]).toEqual({ order: 2, reps: 10, weight: 80, setType: 'NORMAL' })
    expect(result[2]).toEqual({ order: 3, reps: 10, weight: 80, setType: 'NORMAL' })
  })

  it('genera PYRAMID_DESCENDING con peso creciente y reps decrecientes', () => {
    const result = generatePlannedSets({
      sets: 4,
      baseWeight: 60,
      baseReps: 12,
      seriesType: 'Piramidal',
      weightStep: 5,
      repsStep: 2,
    })

    expect(result).toHaveLength(4)
    // S1 → 12 × 60
    expect(result[0]).toEqual({ order: 1, reps: 12, weight: 60, setType: 'PYRAMID_DESCENDING' })
    // S2 → 10 × 65
    expect(result[1]).toEqual({ order: 2, reps: 10, weight: 65, setType: 'PYRAMID_DESCENDING' })
    // S3 → 8 × 70
    expect(result[2]).toEqual({ order: 3, reps: 8, weight: 70, setType: 'PYRAMID_DESCENDING' })
    // S4 → 6 × 75
    expect(result[3]).toEqual({ order: 4, reps: 6, weight: 75, setType: 'PYRAMID_DESCENDING' })
  })

  it('genera ASCENDING con peso creciente y reps decrecientes', () => {
    const result = generatePlannedSets({
      sets: 3,
      baseWeight: 50,
      baseReps: 10,
      seriesType: 'Ascendente',
      weightStep: 5,
      repsStep: 2,
    })

    expect(result[0].weight).toBe(50)
    expect(result[1].weight).toBe(55)
    expect(result[2].weight).toBe(60)
    expect(result[0].reps).toBe(10)
    expect(result[1].reps).toBe(8)
    expect(result[2].reps).toBe(6)
    expect(result[0].setType).toBe('ASCENDING')
  })

  it('genera DESCENDING con peso decreciente y reps crecientes', () => {
    const result = generatePlannedSets({
      sets: 3,
      baseWeight: 70,
      baseReps: 6,
      seriesType: 'Descendente',
      weightStep: 5,
      repsStep: 2,
    })

    expect(result[0].weight).toBe(70)
    expect(result[1].weight).toBe(65)
    expect(result[2].weight).toBe(60)
    expect(result[0].reps).toBe(6)
    expect(result[1].reps).toBe(8)
    expect(result[2].reps).toBe(10)
    expect(result[0].setType).toBe('DESCENDING')
  })

  it('no permite reps menores a 1', () => {
    const result = generatePlannedSets({
      sets: 5,
      baseWeight: 100,
      baseReps: 4,
      seriesType: 'Piramidal',
      repsStep: 3,
    })

    for (const set of result) {
      expect(set.reps).toBeGreaterThanOrEqual(1)
    }
  })

  it('no permite peso negativo', () => {
    const result = generatePlannedSets({
      sets: 5,
      baseWeight: 10,
      baseReps: 10,
      seriesType: 'DropSet',
      weightStep: 5,
    })

    for (const set of result) {
      expect(set.weight).toBeGreaterThanOrEqual(0)
    }
  })

  it('genera DROP_SET con peso decreciente', () => {
    const result = generatePlannedSets({
      sets: 3,
      baseWeight: 80,
      baseReps: 10,
      seriesType: 'DropSet',
      weightStep: 10,
    })

    expect(result[0].weight).toBe(70) // 80 - 10*(0+1)
    expect(result[1].weight).toBe(60) // 80 - 10*(1+1)
    expect(result[2].weight).toBe(50) // 80 - 10*(2+1)
    expect(result[0].setType).toBe('DROP_SET')
  })

  it('genera PYRAMID_FULL subiendo y bajando', () => {
    const result = generatePlannedSets({
      sets: 5,
      baseWeight: 60,
      baseReps: 10,
      seriesType: 'PYRAMID_FULL',
      weightStep: 5,
      repsStep: 1,
    })

    // Sube: 60, 65, 70 | Baja: 65, 60
    expect(result[0].weight).toBe(60)
    expect(result[1].weight).toBe(65)
    expect(result[2].weight).toBe(70)
    expect(result[3].weight).toBe(65)
    expect(result[4].weight).toBe(60)
  })

  it('maneja seriesType vacío como NORMAL', () => {
    const result = generatePlannedSets({
      sets: 2,
      baseWeight: 50,
      baseReps: 10,
      seriesType: '',
    })

    expect(result[0].setType).toBe('NORMAL')
    expect(result[1].setType).toBe('NORMAL')
  })
})

describe('seriesTypeToSetType', () => {
  it('mapea labels del modal a SetType', () => {
    expect(seriesTypeToSetType('Normal')).toBe('NORMAL')
    expect(seriesTypeToSetType('Ascendente')).toBe('ASCENDING')
    expect(seriesTypeToSetType('Descendente')).toBe('DESCENDING')
    expect(seriesTypeToSetType('Piramidal')).toBe('PYRAMID_DESCENDING')
    expect(seriesTypeToSetType('DropSet')).toBe('DROP_SET')
    expect(seriesTypeToSetType('Otra')).toBe('CUSTOM')
    expect(seriesTypeToSetType('Desconocido')).toBe('NORMAL')
  })
})
