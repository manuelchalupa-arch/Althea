import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ATLAS_MODE,
  filterByRange,
  hasPriorHistory,
  intensityOf,
  metricUnitOf,
  metricValueOf,
  normalizeAtlasMode,
  resolveAtlasWindow,
  summarizeRows,
  ATLAS_MODES,
  type AtlasSetRow,
} from './atlasQuery'
import type { CycleConfig } from '@/utils/cycle'

// 2026-10-14 es MIÉRCOLES.
const TODAY = '2026-10-14'

/** Ciclo real de rutina: arranca en lunes. */
const CYCLE: CycleConfig = {
  startDate: '2026-10-05',
  trainingDays: [
    { n: 1, name: 'Pecho' },
    { n: 2, name: 'Espalda' },
    { n: 3, name: 'Piernas' },
  ],
  weekMap: [null, 1, 2, null, 3, null, null],
}

const row = (date: string, exerciseId: string, volume: number, reps = 10, sessionId = 's1'): AtlasSetRow => ({
  date, exerciseId, volume, externalKg: null, reps, sessionId,
})

describe('normalizeAtlasMode', () => {
  it('el identificador obsoleto `treinta` se normaliza al mes actual', () => {
    expect(normalizeAtlasMode('treinta')).toBe('mes')
    expect(resolveAtlasWindow('treinta', { today: TODAY }))
      .toEqual(resolveAtlasWindow('mes', { today: TODAY }))
  })

  it('conserva las modalidades vigentes y cae en `mes` ante valores desconocidos', () => {
    for (const m of ['semana', 'mes', 'rutina', 'personalizada'] as const) {
      expect(normalizeAtlasMode(m)).toBe(m)
    }
    expect(normalizeAtlasMode(null)).toBe('mes')
    expect(normalizeAtlasMode('legacy-raro')).toBe('mes')
  })

  it('la interfaz NO ofrece `treinta` y el valor por defecto es el mes', () => {
    expect(ATLAS_MODES.map((m) => m.id)).toEqual(['semana', 'mes', 'rutina', 'personalizada'])
    expect(DEFAULT_ATLAS_MODE).toBe('mes')
  })
})

describe('resolveAtlasWindow', () => {
  it('semana: LUNES a DOMINGO de la semana calendario, no últimos 7 días', () => {
    const w = resolveAtlasWindow('semana', { today: TODAY })
    expect('error' in w).toBe(false)
    if ('error' in w) { return }
    // 2026-10-12 es lunes; 2026-10-18 es domingo.
    expect(w.start).toBe('2026-10-12')
    expect(w.end).toBe('2026-10-18')
    expect(w.days).toHaveLength(7)
    expect(w.days[0]).toBe('2026-10-12')
    expect(w.days[6]).toBe('2026-10-18')
    // Ventana previa = semana calendario anterior.
    expect(w.prevStart).toBe('2026-10-05')
    expect(w.prevEnd).toBe('2026-10-11')
  })

  it('semana es estable los siete días de la misma semana calendario', () => {
    for (const day of ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-18']) {
      const w = resolveAtlasWindow('semana', { today: day })
      if ('error' in w) { throw new Error('no debe fallar') }
      expect(w.start).toBe('2026-10-12')
      expect(w.end).toBe('2026-10-18')
    }
    // La semana siguiente corre de lunes a domingo también.
    const next = resolveAtlasWindow('semana', { today: '2026-10-19' })
    if ('error' in next) { throw new Error('no debe fallar') }
    expect(next.start).toBe('2026-10-19')
    expect(next.end).toBe('2026-10-25')
  })

  it('mes: del día 1 al último día del mes en curso (NO 30 días móviles)', () => {
    const w = resolveAtlasWindow('mes', { today: TODAY })
    expect('error' in w).toBe(false)
    if ('error' in w) { return }
    expect(w.start).toBe('2026-10-01')
    expect(w.end).toBe('2026-10-31')
    expect(w.days).toHaveLength(31)
    // Previa = mes calendario anterior COMPLETO (no una ventana de 31 días).
    expect(w.prevStart).toBe('2026-09-01')
    expect(w.prevEnd).toBe('2026-09-30')
  })

  it('mes respeta la longitud real de cada mes (febrero bisiesto y 30 días)', () => {
    const feb = resolveAtlasWindow('mes', { today: '2028-02-10' })
    if ('error' in feb) { throw new Error('no debe fallar') }
    expect(feb.start).toBe('2028-02-01')
    expect(feb.end).toBe('2028-02-29')
    expect(feb.days).toHaveLength(29)

    const abr = resolveAtlasWindow('mes', { today: '2026-04-17' })
    if ('error' in abr) { throw new Error('no debe fallar') }
    expect(abr.end).toBe('2026-04-30')
    expect(abr.days).toHaveLength(30)
    expect(abr.prevStart).toBe('2026-03-01')
    expect(abr.prevEnd).toBe('2026-03-31')
  })

  it('rutina: usa la semana del CICLO real, no una ventana de 30 días', () => {
    const w = resolveAtlasWindow('rutina', { today: TODAY, cycle: CYCLE })
    expect('error' in w).toBe(false)
    if ('error' in w) { return }
    // cycle.startDate = lunes 2026-10-05 → esta es la semana 2 del ciclo.
    expect(w.start).toBe('2026-10-12')
    expect(w.end).toBe('2026-10-18')
    expect(w.days).toHaveLength(7)
    // Previa = semana de ciclo anterior (no "los 30 días previos").
    expect(w.prevStart).toBe('2026-10-05')
    expect(w.prevEnd).toBe('2026-10-11')
    expect(w.label).toContain('ciclo')
  })

  it('rutina: primera semana de ciclo usa la semana calendario previa', () => {
    const w = resolveAtlasWindow('rutina', { today: '2026-10-06', cycle: CYCLE })
    if ('error' in w) { throw new Error('no debe fallar') }
    expect(w.start).toBe('2026-10-05')
    expect(w.end).toBe('2026-10-11')
    expect(w.prevStart).toBe('2026-09-28')
    expect(w.prevEnd).toBe('2026-10-04')
  })

  it('rutina sin ciclo, o con ciclo sin fecha de inicio: error explícito, NUNCA 30 días', () => {
    const sinCiclo = resolveAtlasWindow('rutina', { today: TODAY })
    expect(sinCiclo).toHaveProperty('error')
    expect(String((sinCiclo as { error: string }).error)).toContain('ciclo')

    const sinFecha = resolveAtlasWindow('rutina', { today: TODAY, cycle: { ...CYCLE, startDate: '' } })
    expect(sinFecha).toHaveProperty('error')
  })

  it('rutina con ciclo que todavía no empieza: error explícito', () => {
    const futuro = resolveAtlasWindow('rutina', { today: TODAY, cycle: { ...CYCLE, startDate: '2026-12-01' } })
    expect(futuro).toHaveProperty('error')
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

  it('personalizada incluye ambos extremos y excluye lo que cae fuera', () => {
    const w = resolveAtlasWindow('personalizada', { customStart: '2026-09-01', customEnd: '2026-09-10', today: TODAY })
    if ('error' in w) { throw new Error('no debe fallar') }
    const rows = [
      row('2026-08-31', 'fuera-izq', 100),
      row('2026-09-01', 'borde-izq', 100),
      row('2026-09-10', 'borde-der', 100),
      row('2026-09-11', 'fuera-der', 100),
    ]
    const dentro = filterByRange(rows, (r) => r.date, w.start, w.end)
    expect(dentro.map((r) => r.exerciseId)).toEqual(['borde-izq', 'borde-der'])
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

describe('el atlas no expone series ni gráfica', () => {
  it('el módulo NO exporta ninguna función de gráfica temporal', async () => {
    const mod = await import('./atlasQuery') as Record<string, unknown>
    for (const dead of ['dailySeries', 'binSeries', 'chartValueOf', 'BinnedPoint', 'DayPoint']) {
      expect(Object.keys(mod)).not.toContain(dead)
    }
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
