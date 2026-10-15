import { describe, it, expect } from 'vitest'
import {
  binSeries,
  chartValueOf,
  dailySeries,
  filterByRange,
  hasPriorHistory,
  intensityOf,
  metricUnitOf,
  metricValueOf,
  resolveAtlasWindow,
  summarizeRows,
  type AtlasSetRow,
} from './atlasQuery'

const TODAY = '2026-10-14'

const row = (date: string, exerciseId: string, volume: number, reps = 10, sessionId = 's1'): AtlasSetRow => ({
  date, exerciseId, volume, reps, sessionId,
})

describe('resolveAtlasWindow', () => {
  it('semana: últimos 7 días calendario con previa equivalente', () => {
    const w = resolveAtlasWindow('semana', { today: TODAY })
    expect('error' in w).toBe(false)
    if ('error' in w) { return }
    expect(w.start).toBe('2026-10-08')
    expect(w.end).toBe('2026-10-14')
    expect(w.prevStart).toBe('2026-10-01')
    expect(w.prevEnd).toBe('2026-10-07')
    expect(w.days).toHaveLength(7)
    expect(w.days[0]).toBe('2026-10-08')
  })

  it('treinta y rutina: últimos 30 días con previa de 30', () => {
    for (const mode of ['treinta', 'rutina'] as const) {
      const w = resolveAtlasWindow(mode, { today: TODAY })
      expect('error' in w).toBe(false)
      if ('error' in w) { continue }
      expect(w.start).toBe('2026-09-15')
      expect(w.end).toBe('2026-10-14')
      expect(w.prevStart).toBe('2026-08-16')
      expect(w.prevEnd).toBe('2026-09-14')
      expect(w.days).toHaveLength(30)
    }
  })

  it('personalizada: respeta el rango exacto y calcula la previa equivalente', () => {
    const w = resolveAtlasWindow('personalizada', { customStart: '2026-09-01', customEnd: '2026-09-10', today: TODAY })
    expect('error' in w).toBe(false)
    if ('error' in w) { return }
    expect(w.start).toBe('2026-09-01')
    expect(w.end).toBe('2026-09-10')
    expect(w.prevStart).toBe('2026-08-22')
    expect(w.prevEnd).toBe('2026-08-31')
    expect(w.days).toHaveLength(10)
  })

  it('personalizada: rechaza rango invertido, fechas inválidas y futuro', () => {
    expect(resolveAtlasWindow('personalizada', { customStart: '2026-09-10', customEnd: '2026-09-01', today: TODAY })).toHaveProperty('error')
    expect(resolveAtlasWindow('personalizada', { customStart: '', customEnd: '', today: TODAY })).toHaveProperty('error')
    expect(resolveAtlasWindow('personalizada', { customStart: '2026-10-20', customEnd: '2026-10-25', today: TODAY })).toHaveProperty('error')
    expect(resolveAtlasWindow('personalizada', { customStart: 'no-fecha', customEnd: TODAY, today: TODAY })).toHaveProperty('error')
  })

  it('personalizada de un solo día: ventana previa de un día', () => {
    const w = resolveAtlasWindow('personalizada', { customStart: TODAY, customEnd: TODAY, today: TODAY })
    expect('error' in w).toBe(false)
    if ('error' in w) { return }
    expect(w.days).toEqual([TODAY])
    expect(w.prevStart).toBe('2026-10-13')
    expect(w.prevEnd).toBe('2026-10-13')
  })
})

describe('filterByRange + hasPriorHistory', () => {
  const rows = [row('2026-10-01', 'a', 100), row('2026-10-08', 'b', 200), row('2026-10-14', 'c', 300)]
  it('incluye bordes y excluye fuera de rango', () => {
    const out = filterByRange(rows, (r) => r.date, '2026-10-08', '2026-10-14')
    expect(out.map((r) => r.exerciseId)).toEqual(['b', 'c'])
  })

  it('detecta historial previo solo si alcanza la ventana previa', () => {
    expect(hasPriorHistory(['2026-09-20'], '2026-10-01')).toBe(false)
    expect(hasPriorHistory(['2026-10-01'], '2026-10-01')).toBe(true)
    expect(hasPriorHistory([], '2026-10-01')).toBe(false)
  })
})

describe('summarizeRows', () => {
  it('totales desde series únicas (sin doble conteo por músculo)', () => {
    const t = summarizeRows(
      [row('2026-10-10', 'press', 800, 8), row('2026-10-11', 'press', 800, 8), row('2026-10-11', 'remo', 500, 10)],
      (id) => (id === 'press' ? 'Press' : id === 'remo' ? 'Remo' : null),
    )
    expect(t.sets).toBe(3)
    expect(t.reps).toBe(26)
    expect(t.volume).toBe(2100)
    expect(t.exercises).toBe(2)
    expect(t.days).toBe(2)
    expect(t.exerciseNames).toEqual(['Press', 'Remo'])
  })

  it('ignora filas sin ejercicio y no inventa nombres', () => {
    const t = summarizeRows([row('2026-10-10', '', 100, 5)], () => null)
    expect(t.sets).toBe(1)
    expect(t.exercises).toBe(0)
    expect(t.exerciseNames).toEqual([])
  })
})

describe('dailySeries + binSeries', () => {
  it('marca días cero explícitos sin inventar sesiones', () => {
    const s = dailySeries([row('2026-10-08', 'a', 100, 5)], ['2026-10-08', '2026-10-09', '2026-10-10'])
    expect(s).toHaveLength(3)
    expect(s[0]).toMatchObject({ hasWork: true, sets: 1, volume: 100, reps: 5 })
    expect(s[1]).toMatchObject({ hasWork: false, sets: 0, volume: 0 })
    expect(s[2].hasWork).toBe(false)
  })

  it('≤31 días se mantiene día a día; más días se agrupan por semana', () => {
    const days: string[] = []
    let d = '2026-09-15'
    for (let i = 0; i < 30; i++) {
      days.push(d)
      const [y, m, day] = d.split('-').map(Number)
      const next = new Date(Date.UTC(y, m - 1, day + 1))
      d = next.toISOString().slice(0, 10)
    }
    const daily = binSeries(dailySeries([row(days[0], 'a', 100, 5)], days))
    expect(daily).toHaveLength(30)

    const long: string[] = []
    let l = '2026-08-16'
    for (let i = 0; i < 60; i++) {
      long.push(l)
      const [y, m, day] = l.split('-').map(Number)
      const next = new Date(Date.UTC(y, m - 1, day + 1))
      l = next.toISOString().slice(0, 10)
    }
    const binned = binSeries(dailySeries([row(long[0], 'a', 100, 5)], long))
    expect(binned.length).toBeLessThanOrEqual(Math.ceil(60 / 7) + 1)
    // Los totales se conservan al agrupar.
    expect(binned.reduce((a, p) => a + p.sets, 0)).toBe(1)
    expect(binned.reduce((a, p) => a + p.volume, 0)).toBe(100)
  })

  it('chartValueOf respeta la métrica elegida', () => {
    const p = { volume: 100, sets: 2, reps: 16 }
    expect(chartValueOf(p, 'volumen')).toBe(100)
    expect(chartValueOf(p, 'series')).toBe(2)
    expect(chartValueOf(p, 'reps')).toBe(16)
  })
})

describe('métrica e intensidad', () => {
  it('metricValueOf extrae volumen/series/reps', () => {
    const stat = { volume: 100, sets: 4, reps: 32 }
    expect(metricValueOf(stat, 'volumen')).toBe(100)
    expect(metricValueOf(stat, 'series')).toBe(4)
    expect(metricValueOf(stat, 'reps')).toBe(32)
  })

  it('metricUnitOf conserva unidades reales', () => {
    expect(metricUnitOf('volumen')).toBe('kg')
    expect(metricUnitOf('series')).toBe('series')
    expect(metricUnitOf('reps')).toBe('reps')
  })

  it('intensityOf: relativa al máximo, sin trabajo → 0', () => {
    expect(intensityOf(100, 100)).toBe(100)
    expect(intensityOf(50, 100)).toBe(50)
    expect(intensityOf(0, 100)).toBe(0)
    expect(intensityOf(100, 0)).toBe(0)
    expect(intensityOf(1, 1000)).toBe(1)
  })
})
