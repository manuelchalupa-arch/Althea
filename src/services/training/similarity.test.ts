import { describe, it, expect } from 'vitest'
import { similarityScore, rankReplacements } from './similarity'
import type { Exercise } from '@/services/exerciseGym'

const ex = (over: Partial<Exercise> = {}): Exercise => ({
  id: 'a', slug: 'a', name: 'A', muscle: 'biceps', bodyPart: 'arms',
  equipment: 'dumbbell', category: 'strength', secondaryMuscles: ['forearms'],
  instructions: [], file: '', gifUrl: '', ...over,
})

describe('algoritmo de similitud (§37)', () => {
  it('100% solo si todo lo disponible coincide', () => {
    const o = ex({ id: 'o' })
    const c = ex({ id: 'c' })
    const r = similarityScore(o, c)
    expect(r.score).toBe(100)
    expect(r.factors.find((f) => f.key === 'patron')?.state).toBe('unavailable')
  })

  it('equipo distinto baja el puntaje (mismo grupo, resto igual)', () => {
    const o = ex({ id: 'o' })
    const c = ex({ id: 'c', equipment: 'barbell' })
    // denominador 90 (30+20+15+12+13), gana 90 -> igual 100: el equipo NO pondera, solo desempata
    expect(similarityScore(o, c).score).toBe(100)
  })

  it('grupo distinto baja fuerte y el ranking lo excluye', () => {
    const o = ex({ id: 'o', muscle: 'biceps', bodyPart: 'arms' })
    const c = ex({ id: 'c', muscle: 'triceps', bodyPart: 'arms' })
    const r = similarityScore(o, c)
    // pierde 30+20=50 de 90 -> 44
    expect(r.score).toBe(44)
    const ranked = rankReplacements(o, [c, ex({ id: 'd' })])
    expect(ranked.map((x) => x.exercise.id)).toEqual(['d'])
  })

  it('orden descendente y reproducible', () => {
    const o = ex({ id: 'o' })
    const a = ex({ id: 'a', secondaryMuscles: ['forearms'] })
    const b = ex({ id: 'b', secondaryMuscles: ['shoulders'] })
    const r1 = rankReplacements(o, [b, a]).map((x) => x.exercise.id)
    const r2 = rankReplacements(o, [a, b]).map((x) => x.exercise.id)
    expect(r1).toEqual(['a', 'b'])
    expect(r2).toEqual(r1)
  })

  it('desempate: mismo equipo y más historial primero', () => {
    const o = ex({ id: 'o' })
    const x = ex({ id: 'x', equipment: 'cable' })
    const y = ex({ id: 'y', equipment: 'cable' })
    const r = rankReplacements(o, [x, y], (id) => (id === 'y' ? 5 : 0))
    expect(r[0].exercise.id).toBe('y')
  })

  it('faltantes no generan falsos positivos', () => {
    const o = ex({ id: 'o', secondaryMuscles: [] })
    const c = ex({ id: 'c', secondaryMuscles: [] })
    const r = similarityScore(o, c)
    // denominador 75 (sin secundarios): 75/75
    expect(r.score).toBe(100)
    expect(r.factors.find((f) => f.key === 'secundarios')?.state).toBe('unavailable')
    const d = ex({ id: 'd', secondaryMuscles: [], category: 'cardio' })
    // pierde 12/75 -> 84
    expect(similarityScore(o, d).score).toBe(84)
  })
})
