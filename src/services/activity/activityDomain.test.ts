import { describe, it, expect } from 'vitest'
import {
  calculateCalorieExpenditure,
  calculateSessionLoad,
  normalizeSessionRpe,
  describeSessionRpe,
  estimateMetCalories,
  estimateTreadmillCalories,
  supportsDistance,
  RPE_LEVELS,
  getDefaultVariant,
  getVariant,
  getIntensityFromMET,
} from './activityDomain'
import { activityCatalog, findVariant } from '@/data/activityCatalog'

describe('activityDomain — variantes MET', () => {
  it('tiene variantes documentadas con sourceCode para cada actividad', () => {
    for (const a of activityCatalog) {
      expect(a.variants.length, `actividad ${a.id} sin variantes`).toBeGreaterThan(0)
      for (const v of a.variants) {
        expect(v.sourceCode, `${a.id}/${v.id} sin sourceCode`).toMatch(/^\d{5}$/)
        expect(v.met, `${a.id}/${v.id} MET inválido`).toBeGreaterThan(0)
        expect(typeof v.estimated).toBe('boolean')
      }
    }
  })

  it('pádel usa proxy estimado basado en tenis (6.8 MET, code 15675)', () => {
    const padel = activityCatalog.find(a => a.id === 'padel')!
    const general = findVariant(padel, 'general')!
    expect(general.met).toBe(6.8)
    expect(general.sourceCode).toBe('15675')
    expect(general.estimated).toBe(true)
  })

  it('getDefaultVariant devuelve la variante más cercana al MET base', () => {
    const correr = activityCatalog.find(a => a.id === 'correr')!
    const def = getDefaultVariant(correr)
    expect(def.id).toBe('6mph')
    expect(def.met).toBe(9.8)
  })

  it('getVariant devuelve undefined si la variante no existe', () => {
    const correr = activityCatalog.find(a => a.id === 'correr')!
    expect(getVariant(correr, 'no_existe')).toBeUndefined()
  })

  it('getIntensityFromMET clasifica correctamente', () => {
    expect(getIntensityFromMET(2.5)).toBe('ligera')
    expect(getIntensityFromMET(4.0)).toBe('moderada')
    expect(getIntensityFromMET(8.0)).toBe('vigorosa')
  })
})

describe('activityDomain — calculateCalorieExpenditure', () => {
  const correr = activityCatalog.find(a => a.id === 'correr')!

  it('calcula kcal con la fórmula canónica MET × 3,5 × kg ÷ 200 × min', () => {
    const r = calculateCalorieExpenditure(correr, 30, 70, '6mph')
    // 9.8 × 3.5 × 70 / 200 × 30 = 360.15 → 360.2
    expect(r.calories).toBeCloseTo(360.2, 1)
    expect(r.met).toBe(9.8)
    expect(r.durationHours).toBeCloseTo(0.5, 2)
    expect(r.formula).toContain('9.8')
  })

  it('devuelve calories null cuando falta peso', () => {
    const r = calculateCalorieExpenditure(correr, 30, null, '6mph')
    expect(r.calories).toBeNull()
    expect(r.netCalories).toBeNull()
    expect(r.formula).toBeNull()
    expect(r.met).toBe(9.8)
  })

  it('devuelve calories null cuando duración es 0', () => {
    const r = calculateCalorieExpenditure(correr, 0, 70, '6mph')
    expect(r.calories).toBeNull()
  })

  it('una variante de mayor MET genera más calorías con igual peso y duración', () => {
    const suave = calculateCalorieExpenditure(correr, 30, 70, '5mph')!
    const rapido = calculateCalorieExpenditure(correr, 30, 70, '8mph')!
    expect(rapido.calories!).toBeGreaterThan(suave.calories!)
  })

  it('netCalories es siempre menor que calories', () => {
    const r = calculateCalorieExpenditure(correr, 45, 80, '7mph')!
    expect(r.netCalories!).toBeLessThan(r.calories!)
  })

  it('netKcal nunca es negativo', () => {
    const caminar = activityCatalog.find(a => a.id === 'caminar')!
    const r = calculateCalorieExpenditure(caminar, 10, 60, 'lento')!
    expect(r.netCalories!).toBeGreaterThanOrEqual(0)
  })
})

describe('activityDomain — calculateSessionLoad', () => {
  it('calcula RPE × duración', () => {
    expect(calculateSessionLoad(30, 5)).toBe(150)
    expect(calculateSessionLoad(45, 3)).toBe(135)
  })

  it('lanza Error sin RPE o con duración inválida', () => {
    expect(() => calculateSessionLoad(30, null)).toThrow()
    expect(() => calculateSessionLoad(30, undefined)).toThrow()
    expect(() => calculateSessionLoad(0, 5)).toThrow()
    expect(() => calculateSessionLoad(-5, 5)).toThrow()
  })

  it('rechaza RPE fuera de rango 1–5 (incluye 0 y 6–10)', () => {
    expect(() => calculateSessionLoad(30, 11)).toThrow()
    expect(() => calculateSessionLoad(30, -1)).toThrow()
    expect(() => calculateSessionLoad(30, 0)).toThrow()
    expect(() => calculateSessionLoad(30, 6)).toThrow()
    expect(() => calculateSessionLoad(30, 7)).toThrow()
    expect(() => calculateSessionLoad(30, 10)).toThrow()
    expect(() => calculateSessionLoad(30, 2.5)).toThrow()
  })

  it('mayor RPE con misma duración produce mayor carga', () => {
    expect(calculateSessionLoad(30, 5)!).toBeGreaterThan(calculateSessionLoad(30, 2)!)
  })
})

describe('activityDomain — escala RPE 1–5', () => {
  it('RPE_LEVELS tiene exactamente los valores 1, 2, 3, 4 y 5', () => {
    expect(RPE_LEVELS.map((l) => l.value)).toEqual([1, 2, 3, 4, 5])
  })

  it('el valor 1 es verde y el 5 es rojo', () => {
    expect(RPE_LEVELS[0].color).toContain('green')
    expect(RPE_LEVELS[4].color).toContain('red')
  })

  it('normalizeSessionRpe acepta enteros 1–5 y rechaza el resto', () => {
    expect(normalizeSessionRpe(1)).toBe(1)
    expect(normalizeSessionRpe(5)).toBe(5)
    expect(normalizeSessionRpe(0)).toBeNull()
    expect(normalizeSessionRpe(6)).toBeNull()
    expect(normalizeSessionRpe(10)).toBeNull()
    expect(normalizeSessionRpe(-1)).toBeNull()
    expect(normalizeSessionRpe(2.5)).toBeNull()
    expect(normalizeSessionRpe(null)).toBeNull()
    expect(normalizeSessionRpe(undefined)).toBeNull()
  })

  it('describeSessionRpe conserva el significado de valores legacy (0, 6–10)', () => {
    expect(describeSessionRpe(3)).toBe('Moderado')
    expect(describeSessionRpe(0)).toContain('anterior')
    expect(describeSessionRpe(8)).toContain('8/10')
    expect(describeSessionRpe(null)).toBeNull()
  })
})

describe('activityDomain — estimateMetCalories', () => {
  it('calcula brutas y activas con método MET', () => {
    const r = estimateMetCalories(9.8, 70, 30)
    expect(r.grossKcal).toBe(360)
    expect(r.activeKcal).toBe(323)
    expect(r.method).toBe('MET')
    expect(r.estimated).toBe(true)
  })

  it('lanza Error sin peso o MET inválido', () => {
    expect(() => estimateMetCalories(0, 70, 30)).toThrow()
    expect(() => estimateMetCalories(8, 0, 30)).toThrow()
    expect(() => estimateMetCalories(8, 70, 0)).toThrow()
  })
})

describe('activityDomain — estimateTreadmillCalories (ACSM)', () => {
  it('caminata en rango válido usa ACSM_WALK', () => {
    // 4 km en 60 min = 66.7 m/min, pendiente 0
    const r = estimateTreadmillCalories({ weightKg: 70, durationMinutes: 60, distanceKm: 4, inclinePercent: 0, mode: 'walk' })
    expect(r).not.toBeNull()
    expect(r!.method).toBe('ACSM_WALK')
    expect(r!.grossKcal).toBeGreaterThan(r!.activeKcal)
    expect(r!.activeKcal).toBeGreaterThan(0)
  })

  it('carrera en rango válido usa ACSM_RUN', () => {
    // 10 km en 60 min = 166.7 m/min
    const r = estimateTreadmillCalories({ weightKg: 70, durationMinutes: 60, distanceKm: 10, inclinePercent: 1, mode: 'run' })
    expect(r).not.toBeNull()
    expect(r!.method).toBe('ACSM_RUN')
    expect(r!.grossKcal).toBeGreaterThan(0)
  })

  it('devuelve null fuera de rango (usar MET)', () => {
    // 7 km en 60 min = 116.7 m/min: ni caminata ni carrera
    expect(estimateTreadmillCalories({ weightKg: 70, durationMinutes: 60, distanceKm: 7, mode: 'walk' })).toBeNull()
    expect(estimateTreadmillCalories({ weightKg: 70, durationMinutes: 60, distanceKm: 7, mode: 'run' })).toBeNull()
    expect(estimateTreadmillCalories({ weightKg: 70, durationMinutes: 60, distanceKm: 0, mode: 'walk' })).toBeNull()
  })
})

describe('activityDomain — supportsDistance', () => {
  it('acepta desplazamiento y máquinas con distancia', () => {
    for (const id of ['caminar', 'trotar', 'correr', 'cinta_correr', 'bicicleta_exterior', 'bicicleta_fija', 'eliptica', 'escaladora', 'remo']) {
      expect(supportsDistance(id)).toBe(true)
    }
  })

  it('rechaza deportes sin distancia', () => {
    expect(supportsDistance('futbol')).toBe(false)
    expect(supportsDistance('padel')).toBe(false)
    expect(supportsDistance('natacion')).toBe(false)
  })
})
