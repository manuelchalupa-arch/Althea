import { describe, it, expect } from 'vitest'
import { cycleWeekIndexOf, cycleWeekRange, completedCycleWeeks, DEFAULT_CYCLE } from '@/utils/cycle'
import type { CycleConfig } from '@/utils/cycle'

const cycle: CycleConfig = { ...DEFAULT_CYCLE, startDate: '2026-01-05' } // lunes

describe('cycleWeekIndexOf', () => {
  it('devuelve 1 para cualquier día de la semana de inicio', () => {
    expect(cycleWeekIndexOf('2026-01-05', cycle)).toBe(1)
    expect(cycleWeekIndexOf('2026-01-11', cycle)).toBe(1) // domingo
  })
  it('incrementa de a 7 días', () => {
    expect(cycleWeekIndexOf('2026-01-12', cycle)).toBe(2)
    expect(cycleWeekIndexOf('2026-02-09', cycle)).toBe(6)
  })
  it('devuelve 0 para fechas previas al inicio', () => {
    expect(cycleWeekIndexOf('2025-12-29', cycle)).toBe(0)
  })
})

describe('cycleWeekRange', () => {
  it('devuelve lunes a domingo de la semana', () => {
    expect(cycleWeekRange(1, cycle)).toEqual({ start: '2026-01-05', end: '2026-01-11' })
    expect(cycleWeekRange(2, cycle)).toEqual({ start: '2026-01-12', end: '2026-01-18' })
  })
})

describe('completedCycleWeeks', () => {
  it('excluye la semana en curso', () => {
    const w = completedCycleWeeks(cycle, '2026-01-14') // semana 2 en curso
    expect(w.map(x => x.index)).toEqual([1])
  })
  it('acumula semanas completas hasta hoy', () => {
    const w = completedCycleWeeks(cycle, '2026-01-28')
    expect(w.map(x => x.index)).toEqual([1, 2, 3])
  })
  it('no devuelve semanas futuras', () => {
    const w = completedCycleWeeks(cycle, '2026-01-05') // inicio: nada completo
    expect(w).toEqual([])
  })
})
