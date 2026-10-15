import { describe, it, expect } from 'vitest'
import { buildAtlasMuscleData } from './muscleAtlasData'
import { MUSCLE_REGIONS, ALL_REGION_IDS } from './muscleGeometry'
import { MUSCLE_CATALOG } from '@/services/training/muscleCatalog'
import type { ContributionResult, RegionContribution } from './muscleContributions'

const NO_CONTRIB: ContributionResult = { byRegion: {}, maxVolume: 0, totalSets: 0, unattributedSets: 0 }

const region = (volume: number, exercises: string[]): RegionContribution => ({
  volume,
  sets: Math.max(1, Math.round(volume / 10)),
  reps: Math.round(volume * 2),
  days: ['2026-03-10'],
  exercises,
})

// Contribuciones de prueba para músculos de espalda
const BACK_CONTRIBUTIONS: ContributionResult = {
  byRegion: {
    'latissimus-dorsi': region(100, ['Dominadas']),
    'trapezius': region(80, ['Encogimientos']),
    'rhomboids': region(60, ['Remo']),
    'spinal-erectors': region(70, ['Peso muerto']),
    'teres-major': region(50, ['Remo']),
    'infraspinatus': region(40, ['Face pull']),
    'levator-scapulae': region(30, ['Encogimientos']),
    'trapezius-lower': region(80, ['Remo']),
    'trapezius-middle': region(80, ['Remo']),
    'trapezius-upper': region(80, ['Encogimientos']),
  },
  maxVolume: 100,
  totalSets: 10,
  unattributedSets: 0,
}

// Ventana previa: mismo volumen salvo latissimus-dorsi, que baja.
const PREV_CONTRIBUTIONS: ContributionResult = {
  byRegion: {
    'latissimus-dorsi': region(40, ['Dominadas']),
    'trapezius': region(80, ['Encogimientos']),
    'rhomboids': region(60, ['Remo']),
    'spinal-erectors': region(70, ['Peso muerto']),
  },
  maxVolume: 80,
  totalSets: 4,
  unattributedSets: 0,
}

function sampleData(overrides: Partial<Parameters<typeof buildAtlasMuscleData>[0]> = {}) {
  return buildAtlasMuscleData({
    enabled: true,
    current: BACK_CONTRIBUTIONS,
    previous: null,
    metric: 'volumen',
    ...overrides,
  })
}

describe('buildAtlasMuscleData — cobertura de regiones', () => {
  it('TODA región dibujada recibe un punto de dato (frente y espalda)', () => {
    const data = sampleData()
    for (const side of ['front', 'back'] as const) {
      for (const r of MUSCLE_REGIONS[side]) {
        expect(data[r.id], `sin dato en ${side}/${r.id}`).toBeDefined()
        expect(data[r.id]?.muscleId).toBeTruthy()
        expect(typeof data[r.id]?.current).toBe('number')
      }
    }
    // Puede haber más claves que regiones: una entrada de catálogo que no es
    // región (p. ej. triceps-brachii) también queda indexada.
    expect(Object.keys(data).length).toBeGreaterThanOrEqual(ALL_REGION_IDS.length)
  })

  it('las regiones de espalda con contribuciones salen de gris y tienen intensidad', () => {
    const data = sampleData()
    // Regresión: teres-major, infraspinatus y levator-scapulae no están en el
    // catálogo, así que nunca recibían punto y quedaban SIEMPRE en "Sin datos".
    // Usamos IDs de REGIONES del atlas (no IDs de catálogo padre como 'trapezius')
    for (const id of ['teres-major', 'infraspinatus', 'levator-scapulae', 'latissimus-dorsi', 'rhomboids', 'spinal-erectors', 'trapezius-upper', 'trapezius-middle', 'trapezius-lower']) {
      const p = data[id]
      expect(p, `falta ${id}`).toBeDefined()
      expect(p?.current, `${id} no recibe volumen`).toBeGreaterThan(0)
      expect(p?.intensity, `${id} no tiene intensidad`).toBeGreaterThan(0)
      // Sin ventana previa no hay comparación: 'sin-base' NO apaga el color,
      // que viene de la intensidad.
      expect(p?.trend).toBe('sin-base')
    }
  })

  it('con ventana previa la tendencia se resuelve contra la misma métrica', () => {
    const data = sampleData({ previous: PREV_CONTRIBUTIONS })

    // 100 → 40: decrease real, ya no 'sin-base'.
    expect(data['latissimus-dorsi']?.trend).not.toBe('sin-base')
    expect(data['latissimus-dorsi']?.previous).toBe(40)
    expect(data['latissimus-dorsi']?.current).toBe(100)

    // 70 → 70: estable.
    expect(data['spinal-erectors']?.trend).toBe('estable')

    // Región con trabajo actual pero SIN ventana previa: hay intensidad, pero no
    // comparación posible.
    expect(data['teres-major']?.current).toBe(50)
    expect(data['teres-major']?.intensity).toBeGreaterThan(0)
    expect(data['teres-major']?.previous).toBe(0)
    expect(data['teres-major']?.trend).toBe('sin-base')
  })

  it('la métrica elegida cambia el valor y la unidad, no la intensidad relativa', () => {
    const volumen = sampleData()
    const series = sampleData({ metric: 'series' })

    expect(volumen['latissimus-dorsi']?.unit).toBe('kg')
    expect(series['latissimus-dorsi']?.unit).toBe('series')
    expect(volumen['latissimus-dorsi']?.current).not.toBe(series['latissimus-dorsi']?.current)
    // Ambas métricas ordenan las regiones igual, así que la intensidad coincide.
    expect(volumen['latissimus-dorsi']?.intensity).toBe(series['latissimus-dorsi']?.intensity)
  })

  it('ninguna región con contribución queda sin intensidad', () => {
    const data = sampleData()
    for (const id of ALL_REGION_IDS) {
      const p = data[id]
      if (p?.current && p.current > 0) {
        expect(p?.intensity, `región ${id} con trabajo debería tener intensidad`).toBeGreaterThan(0)
      }
    }
  })

  it('los ids del catálogo siguen pintando a sus subdivisiones', () => {
    const data = sampleData()
    // Cada subdivisión recibe su propio punto, y además queda indexada la del
    // padre: no puede haber ambigüedad en lookup().
    for (const [sub, parent] of [
      ['pectoralis-major-sternal', 'pectoralis-major'],
      ['pectoralis-major-clavicular', 'pectoralis-major'],
      ['trapezius-lower', 'trapezius'],
      ['trapezius-upper', 'trapezius'],
      ['rectus-abdominis-upper', 'rectus-abdominis'],
      ['hamstrings-biceps-femoris', 'hamstrings'],
      ['gastrocnemius-medial', 'gastrocnemius'],
    ] as const) {
      expect(data[sub], `falta ${sub}`).toBeDefined()
      expect(data[parent], `falta ${parent}`).toBeDefined()
      expect(data[sub]?.trend).toBe(data[parent]?.trend)
    }
  })

  it('con enabled=false devuelve vacío (pantalla sin datos)', () => {
    expect(buildAtlasMuscleData({
      enabled: false,
      current: NO_CONTRIB,
      previous: null,
      metric: 'volumen',
    })).toEqual({})
  })

  it('todo el catálogo queda representado en alguna región', () => {
    const data = sampleData()
    const muscleIds = new Set(Object.values(data).map((p) => p.muscleId))
    for (const m of MUSCLE_CATALOG) {
      expect(muscleIds.has(m.id), `catálogo ${m.id} sin región`).toBe(true)
    }
  })

  it('regiones sin contribución quedan en idle (intensity 0)', () => {
    const data = sampleData()
    // Los músculos de piernas no tienen contribución en este test
    for (const id of ['quadriceps', 'hamstrings', 'gluteus-maximus', 'gastrocnemius']) {
      const p = data[id]
      if (p) {
        expect(p?.current).toBe(0)
        expect(p?.intensity).toBe(0)
        expect(p?.trend).toBe('sin-base')
      }
    }
  })

  it('dos músculos del mismo grupo tienen distinta intensidad si su carga difiere', () => {
    const data = sampleData()
    // latissimus-dorsi (100) vs levator-scapulae (30): mismo grupo ESPALDA,
    // intensidades distintas y ordenadas por carga.
    const lats = data['latissimus-dorsi']?.intensity ?? 0
    const levator = data['levator-scapulae']?.intensity ?? 0
    expect(lats).toBe(100)
    expect(levator).toBeLessThan(lats)
    expect(levator).toBeGreaterThan(0)
  })

  it('el detalle conserva sets, reps, días y ejercicios reales de la región', () => {
    const data = sampleData()
    const p = data['latissimus-dorsi']
    expect(p?.sets).toBeGreaterThan(0)
    expect(p?.reps).toBeGreaterThan(0)
    expect(p?.days).toEqual(['2026-03-10'])
    expect(p?.exercises).toEqual(['Dominadas'])
    expect(p?.metric).toBe('volumen')
  })
})

describe('buildAtlasMuscleData — escala de intensidad y estados vacíos', () => {
  it('la intensidad es relativa al período y ordena de baja a alta', () => {
    const data = sampleData()
    // Máximo del período = 100 (latissimus-dorsi).
    expect(data['latissimus-dorsi']?.intensity).toBe(100)
    expect(data['levator-scapulae']?.intensity).toBe(30)
    expect(data['infraspinatus']?.intensity).toBe(40)
    // Escalones de la escala usados por MuscleAtlas: 0 / 1-33 / 34-66 / 67-100.
    const nivel = (i: number) => (i === 0 ? 'idle' : i >= 67 ? 'high' : i >= 34 ? 'mid' : 'low')
    expect(nivel(data['levator-scapulae']?.intensity ?? 0)).toBe('low')
    expect(nivel(data['infraspinatus']?.intensity ?? 0)).toBe('mid')
    expect(nivel(data['latissimus-dorsi']?.intensity ?? 0)).toBe('high')
  })

  it('actividad actual SIN historial previo: coloreado por intensidad, tendencia sin base', () => {
    const data = sampleData({ previous: null })
    const p = data['latissimus-dorsi']
    expect(p?.current).toBeGreaterThan(0)
    expect(p?.intensity).toBe(100)
    expect(p?.trend).toBe('sin-base')
    // Tener trabajo nunca debe quedar en el mismo estado que no tener ninguno.
    expect(p?.emptyReason).toBe('ok')
  })

  it('SIN series en el período: absence de actividad (no falta de atribución)', () => {
    const data = buildAtlasMuscleData({
      enabled: true,
      current: { byRegion: {}, maxVolume: 0, totalSets: 0, unattributedSets: 0 },
      previous: null,
      metric: 'volumen',
    })
    for (const id of ALL_REGION_IDS) {
      expect(data[id]?.current).toBe(0)
      expect(data[id]?.intensity).toBe(0)
      expect(data[id]?.emptyReason).toBe('ok')
    }
  })

  it('CON series pero sin atribución: se distingue de "no entrenaste"', () => {
    const data = buildAtlasMuscleData({
      enabled: true,
      current: { byRegion: {}, maxVolume: 0, totalSets: 12, unattributedSets: 12 },
      previous: null,
      metric: 'volumen',
    })
    for (const id of ALL_REGION_IDS) {
      expect(data[id]?.intensity).toBe(0)
      expect(data[id]?.emptyReason).toBe('sin-atribucion')
    }
  })

  it('región sin volumen atribuible dentro de una ventana con trabajo: sin alcance', () => {
    const data = sampleData()
    // Hay trabajo en el período, pero esta región no recibió volumen.
    for (const id of ['quadriceps', 'gluteus-maximus']) {
      const p = data[id]
      if (p && p.current === 0) {
        expect(p.emptyReason).toBe('sin-alcance')
      }
    }
  })
})