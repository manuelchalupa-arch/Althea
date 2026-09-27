import { describe, it, expect } from 'vitest'
import { groupOfMuscle, groupLoadOf, weeklyGroupComparison, STABLE_THRESHOLD_PCT } from '@/services/training/muscleGroups'
import { DEFAULT_CYCLE } from '@/utils/cycle'
import type { CycleConfig } from '@/utils/cycle'

const map: Record<string, { primary: string; secondary: string[] }> = {
  press: { primary: 'pectorals', secondary: ['triceps', 'delts'] },
  row: { primary: 'lats', secondary: ['upper-back'] },
  squat: { primary: 'quads', secondary: ['glutes', 'hamstrings'] },
  curl: { primary: 'biceps', secondary: ['forearms'] },
  lateral: { primary: 'delts', secondary: [] },
  run: { primary: 'cardio', secondary: [] },
}
const muscleOf = (id: string) => map[id] ?? null

const cycle: CycleConfig = { ...DEFAULT_CYCLE, startDate: '2026-01-05' }

describe('groupOfMuscle', () => {
  it('mapea músculos API a los 5 grupos', () => {
    expect(groupOfMuscle('pectorals')).toBe('PECHO')
    expect(groupOfMuscle('lats')).toBe('ESPALDA')
    expect(groupOfMuscle('quads')).toBe('PIERNAS')
    expect(groupOfMuscle('hamstrings')).toBe('PIERNAS')
    expect(groupOfMuscle('biceps')).toBe('BRAZOS')
    expect(groupOfMuscle('triceps')).toBe('BRAZOS')
    expect(groupOfMuscle('delts')).toBe('HOMBROS')
  })
  it('devuelve null para músculos sin anatomía de grupo', () => {
    expect(groupOfMuscle('cardio')).toBeNull()
    expect(groupOfMuscle('abs')).toBeNull()
    expect(groupOfMuscle('inventado')).toBeNull()
  })
})

describe('groupLoadOf', () => {
  it('suma peso×reps con ponderación por rol y agrupa', () => {
    // press 100kg x10 = 1000 volumen → pecho 1000, triceps 500, delts 250
    const r = groupLoadOf([{ exerciseId: 'press', volume: 1000 }], muscleOf)
    expect(r.byGroup.PECHO).toBe(1000)
    expect(r.byGroup.BRAZOS).toBe(500)   // triceps secundario1
    expect(r.byGroup.HOMBROS).toBe(250)  // delts secundario2
  })
  it('acumula familia PIERNAS desde varios músculos', () => {
    const r = groupLoadOf([{ exerciseId: 'squat', volume: 900 }], muscleOf)
    expect(r.byGroup.PIERNAS).toBe(900 + 450 + 225)
  })
  it('descarta cardio del total de los 5 grupos y lo deja sin atribuir', () => {
    const r = groupLoadOf([{ exerciseId: 'run', volume: 500 }], muscleOf)
    expect(r.groups.find(g => g.group === 'PECHO')?.volume).toBe(0)
    expect(r.groups.every(g => g.volume === 0)).toBe(true)
  })
  it('cuenta volumen sin atribución aparte', () => {
    const r = groupLoadOf([{ exerciseId: 'desconocido', volume: 300 }], muscleOf)
    expect(r.unmappedVolume).toBe(300)
    expect(r.unmappedSets).toBe(1)
  })
  it('ordena grupos por volumen descendente', () => {
    const r = groupLoadOf([{ exerciseId: 'press', volume: 1000 }, { exerciseId: 'squat', volume: 100 }], muscleOf)
    expect(r.groups[0].group).toBe('PECHO')
  })
})

describe('weeklyGroupComparison', () => {
  const items = (date: string, exerciseId: string, volume: number) => ({ date, exerciseId, volume })

  it('marca la primera semana completa como BASE', () => {
    const { weeks } = weeklyGroupComparison(
      [items('2026-01-06', 'press', 1000), items('2026-01-07', 'row', 800)],
      muscleOf, cycle, '2026-01-28',
    )
    expect(weeks[0].week).toBe(1)
    expect(weeks[0].isBase).toBe(true)
    expect(weeks[0].trend.PECHO).toBe('sin-base')
  })

  it('excluye la semana en curso de la comparación', () => {
    const { weeks } = weeklyGroupComparison(
      [items('2026-01-06', 'press', 1000)],
      muscleOf, cycle, '2026-01-14', // semana 2 en curso
    )
    expect(weeks.map(w => w.week)).toEqual([1])
  })

  it('compara semana 2 contra semana 1 con trend y variación', () => {
    const { weeks } = weeklyGroupComparison(
      [
        items('2026-01-06', 'press', 1000),
        items('2026-01-13', 'press', 2000), // +100%
      ],
      muscleOf, cycle, '2026-01-28',
    )
    expect(weeks).toHaveLength(3)
    expect(weeks[1].week).toBe(2)
    expect(weeks[1].isBase).toBe(false)
    expect(weeks[1].trend.PECHO).toBe('aumento')
    expect(weeks[1].delta.PECHO).toBe(1000)
    expect(weeks[1].deltaPct.PECHO).toBe(100)
  })

  it('marca descenso y estable', () => {
    const { weeks } = weeklyGroupComparison(
      [
        items('2026-01-06', 'press', 1000),
        items('2026-01-13', 'press', 500),  // -50% → descenso
        items('2026-01-20', 'press', 510),  // +2% → estable
      ],
      muscleOf, cycle, '2026-02-04',
    )
    expect(weeks[1].trend.PECHO).toBe('descenso')
    expect(weeks[2].trend.PECHO).toBe('estable')
  })

  it('usa sin-base cuando la semana previa no tuvo trabajo del grupo', () => {
    const { weeks } = weeklyGroupComparison(
      [
        items('2026-01-06', 'press', 1000), // semana 1 solo pecho
        items('2026-01-13', 'squat', 1000), // semana 2 solo piernas
      ],
      muscleOf, cycle, '2026-01-28',
    )
    // piernas pasaron de 0 → no hay base: variación relativa indefinida
    expect(weeks[1].trend.PIERNAS).toBe('sin-base')
    expect(weeks[1].deltaPct.PIERNAS).toBeNull()
    // pecho pasó de 1000 → 0: sí hay base, es un descenso real
    expect(weeks[1].trend.PECHO).toBe('descenso')
    expect(weeks[1].deltaPct.PECHO).toBe(-100)
  })

  it('calcula aumento cuando el grupo grows desde una base real', () => {
    const { weeks } = weeklyGroupComparison(
      [
        items('2026-01-06', 'squat', 1000),
        items('2026-01-13', 'squat', 2000),
      ],
      muscleOf, cycle, '2026-01-28',
    )
    expect(weeks[1].trend.PIERNAS).toBe('aumento')
    expect(weeks[1].deltaPct.PIERNAS).toBe(100)
  })

  it('expone la semana en curso como current sin alterar las comparaciones', () => {
    const { weeks, current } = weeklyGroupComparison(
      [items('2026-01-06', 'press', 1000), items('2026-01-26', 'press', 400)],
      muscleOf, cycle, '2026-01-28',
    )
    expect(weeks.map(w => w.week)).toEqual([1, 2, 3])
    expect(current?.week).toBe(4)
    expect(current?.byGroup.PECHO).toBe(400)
  })

  it('sin datos devuelve weeks vacío y current en cero', () => {
    const { weeks, current } = weeklyGroupComparison([], muscleOf, cycle, '2026-01-28')
    expect(weeks).toHaveLength(3)
    expect(weeks.every(w => w.total === 0)).toBe(true)
    expect(current?.total).toBe(0)
  })
})

describe('STABLE_THRESHOLD_PCT', () => {
  it('es 5%', () => { expect(STABLE_THRESHOLD_PCT).toBe(5) })
})
