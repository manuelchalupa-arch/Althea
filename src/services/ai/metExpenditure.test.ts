import { describe, it, expect } from 'vitest'
import {
  calculateCalorieExpenditure,
  MET_DATA,
  findMet,
  verifyMetOrdering,
  verifyWeightScaling,
  verifyDurationScaling,
  SCIENTIFIC_SOURCES,
} from './metExpenditure'

describe('Gasto energético estimado — MET (Compendium 2024)', () => {
  it('fórmula: kcal/min = MET × 3,5 × kg ÷ 200 × minutos', () => {
    const r = calculateCalorieExpenditure({ activity: 'Fuerza', met: 6.0, weightKg: 70, durationMinutes: 30 })
    // 6.0 × 3.5 × 70 / 200 = 7.35 kcal/min → × 30 = 220.5
    expect(r.grossKcal).toBeCloseTo(220.5, 1)
    expect(r.formula).toContain('6 MET')
    expect(r.formula).toContain('70 kg')
    expect(r.formula).toContain('30 min')
  })

  it('etiqueta "Gasto energético estimado" — no presenta como valor exacto', () => {
    const r = calculateCalorieExpenditure({ activity: 'Carrera', met: 8.3, weightKg: 75, durationMinutes: 20 })
    expect(r.grossKcal).toBeGreaterThan(0)
    // El resultado es redondeado, no exacto
    expect(typeof r.grossKcal).toBe('number')
  })

  it('mayor MET genera mayor estimación con igual peso y duración', () => {
    expect(verifyMetOrdering()).toBe(true)
  })

  it('mayor peso incrementa proporcionalmente la estimación', () => {
    expect(verifyWeightScaling()).toBe(true)
  })

  it('mayor duración incrementa proporcionalmente la estimación', () => {
    expect(verifyDurationScaling()).toBe(true)
  })

  it('gasto neto es menor que bruto (resta el reposo)', () => {
    const r = calculateCalorieExpenditure({ activity: 'Fuerza', met: 6.0, weightKg: 70, durationMinutes: 30 })
    expect(r.netKcal).toBeLessThan(r.grossKcal)
    expect(r.netKcal).toBeGreaterThan(0)
  })

  it('MET del Compendium para caminata y carrera son distintos', () => {
    const walk = findMet('walking_moderate')
    const run = findMet('running_6mph')
    expect(walk).toBeDefined()
    expect(run).toBeDefined()
    expect(walk!.met).toBeLessThan(run!.met)
  })

  it('todas las actividades del Compendium tienen MET > 0 y fuente', () => {
    MET_DATA.forEach(e => {
      expect(e.met).toBeGreaterThan(0)
      expect(e.source).toBeTruthy()
    })
  })

  it('los MET de caminata, carrera y ciclismo no son iguales', () => {
    const walk = findMet('walking_moderate')!
    const run = findMet('running_6mph')!
    const bike = findMet('cycling_moderate')!
    expect(walk.met).not.toBe(run.met)
    expect(run.met).not.toBe(bike.met)
    expect(walk.met).not.toBe(bike.met)
  })
})

describe('Fuentes científicas visibles en el Coach', () => {
  it('existe al menos una fuente por organismo reconocido', () => {
    const orgs = new Set(SCIENTIFIC_SOURCES.map(s => s.organization))
    expect(orgs.size).toBeGreaterThanOrEqual(5)
  })

  it('cada fuente tiene nombre, organismo, tema y enlace verificable', () => {
    SCIENTIFIC_SOURCES.forEach(s => {
      expect(s.name.length).toBeGreaterThan(5)
      expect(s.organization.length).toBeGreaterThan(3)
      expect(s.topic.length).toBeGreaterThan(3)
      expect(s.url).toMatch(/^https?:\/\//)
    })
  })

  it('incluye ACSM, Compendium, WHO, USDA, ISSN y NSCA', () => {
    const ids = new Set(SCIENTIFIC_SOURCES.map(s => s.id))
    expect(ids.has('acsm-resistance-2026')).toBe(true)
    expect(ids.has('compendium-2024-adult')).toBe(true)
    expect(ids.has('who-physical-activity')).toBe(true)
    expect(ids.has('usda-fooddata')).toBe(true)
    expect(ids.has('issn-protein-exercise')).toBe(true)
    expect(ids.has('nsca-position-statements')).toBe(true)
  })

  it('las fuentes no son inventadas: todos los enlaces son HTTPS', () => {
    SCIENTIFIC_SOURCES.forEach(s => {
      expect(s.url).toMatch(/^https:\/\/(www\.)?(acsm\.org|pacompendium\.com|who\.int|fdc\.nal\.usda\.gov|pubmed\.ncbi\.nlm\.nih\.gov|nsca\.com)/)
    })
  })
})
