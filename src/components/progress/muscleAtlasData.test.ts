import { describe, it, expect } from 'vitest'
import { buildAtlasMuscleData } from './muscleAtlasData'
import { MUSCLE_REGIONS, ALL_REGION_IDS } from './muscleGeometry'
import { MUSCLE_CATALOG } from '@/services/training/muscleCatalog'
import { MUSCLE_GROUPS } from '@/services/training/muscleGroups'
import type { ContributionResult } from './muscleContributions'

const NO_CONTRIB: ContributionResult = { byRegion: {}, maxVolume: 0 }

const ALL_GROUPS_CURRENT = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 100])) as Record<string, number>
const ALL_GROUPS_PREVIOUS = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 50])) as Record<string, number>

function sampleData(overrides: Partial<Parameters<typeof buildAtlasMuscleData>[0]> = {}) {
  return buildAtlasMuscleData({
    enabled: true,
    currentByGroup: ALL_GROUPS_CURRENT,
    previousByGroup: ALL_GROUPS_PREVIOUS,
    contributions: NO_CONTRIB,
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

  it('las regiones de espalda salen de gris cuando hay volumen ESPALDA', () => {
    const data = sampleData()
    // Regresión: teres-major, infraspinatus y levator-scapulae no están en el
    // catálogo, así que nunca recibían punto y quedaban SIEMPRE en "Sin datos".
    for (const id of ['teres-major', 'infraspinatus', 'levator-scapulae', 'latissimus-dorsi', 'trapezius', 'rhomboids', 'spinal-erectors']) {
      const p = data[id]
      expect(p, `falta ${id}`).toBeDefined()
      expect(p?.current, `${id} no recibe volumen`).toBe(100)
      expect(p?.trend, `${id} sigue sin tendencia`).toBe('aumento')
    }
  })

  it('ninguna región queda con tendencia sin-base cuando todos los grupos suben', () => {
    const data = sampleData()
    for (const id of ALL_REGION_IDS) {
      expect(data[id]?.trend, `región ${id}`).toBe('aumento')
    }
  })

  it('los ids del catálogo siguen pintando a sus subdivisiones', () => {
    const data = sampleData()
    // Cada subdivisión recibe su propio punto con el volumen de su grupo, y
    // además hereda el del padre: no puede haber ambigüedad en lookup().
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
      expect(data[sub]?.current).toBe(data[parent]?.current)
      expect(data[sub]?.trend).toBe(data[parent]?.trend)
    }
  })

  it('con enabled=false devuelve vacío (pantalla sin datos)', () => {
    expect(buildAtlasMuscleData({
      enabled: false,
      currentByGroup: ALL_GROUPS_CURRENT,
      previousByGroup: ALL_GROUPS_PREVIOUS,
      contributions: NO_CONTRIB,
    })).toEqual({})
  })

  it('todo el catálogo queda representado en alguna región', () => {
    const data = sampleData()
    const muscleIds = new Set(Object.values(data).map((p) => p.muscleId))
    for (const m of MUSCLE_CATALOG) {
      expect(muscleIds.has(m.id), `catálogo ${m.id} sin región`).toBe(true)
    }
  })
})
