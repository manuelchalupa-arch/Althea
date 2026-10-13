import { describe, it, expect } from 'vitest'
import {
  buildRegionContributions,
  relativeActivation,
  type ContributionItem,
} from '@/components/progress/muscleContributions'

/**
 * La ponderación es la MISMA que usa muscleLoadOf (primary ×1,
 * secondary[0] ×0.5, secondary[1] ×0.25). Son estimaciones del registro de
 * entrenamiento, no mediciones fisiológicas exactas.
 */
type Attr = { primary: string; secondary: string[] }

const MAP: Record<string, Attr> = {
  press: { primary: 'pectorals', secondary: ['triceps', 'delts'] },
  run: { primary: 'cardio', secondary: [] },
  crunch: { primary: 'abs', secondary: ['obliques-not-in-vocab'] },
}
const muscleOf = (id: string) => MAP[id] ?? null
const nameOf = (id: string) => (id === 'press' ? 'Press de banca' : id === 'crunch' ? 'Crunch' : null)

const items = (list: Array<[string, string, number]>): ContributionItem[] =>
  list.map(([date, exerciseId, volume]) => ({ date, exerciseId, volume }))

describe('buildRegionContributions', () => {
  it('reparte el volumen por rol con los pesos del resto del repo', () => {
    const r = buildRegionContributions(items([['2026-01-05', 'press', 1000]]), muscleOf, nameOf)
    // primary ×1
    expect(r.byRegion['pectoralis-major'].volume).toBe(1000)
    // secondary[0] ×0.5
    expect(r.byRegion['triceps-brachii'].volume).toBe(500)
    // secondary[1] ×0.25 — se reparte a las 3 regiones del deltoides
    expect(r.byRegion['anterior-deltoid'].volume).toBe(250)
    expect(r.byRegion['lateral-deltoid'].volume).toBe(250)
    expect(r.byRegion['posterior-deltoid'].volume).toBe(250)
    expect(r.maxVolume).toBe(1000)
  })

  it('lista los ejercicios por volumen desc', () => {
    const r = buildRegionContributions(
      items([
        ['2026-01-05', 'press', 200],
        ['2026-01-06', 'crunch', 900],
      ]),
      muscleOf, nameOf,
    )
    // Crunch (900) va a ABS, no a pectorals; Press (200) sí va a pectorals.
    expect(r.byRegion['pectoralis-major'].exercises).toEqual(['Press de banca'])
    expect(r.byRegion['rectus-abdominis'].volume).toBe(900)
    expect(r.byRegion['rectus-abdominis'].exercises).toEqual(['Crunch'])
  })

  it('no inventa regiones para músculos no anatómicos (cardio)', () => {
    const r = buildRegionContributions(items([['2026-01-05', 'run', 5000]]), muscleOf, nameOf)
    expect(r.byRegion).toEqual({})
    expect(r.maxVolume).toBe(0)
  })

  it('ignora el ejercicio si el nombre es desconocido (no se inventa)', () => {
    // nameOf devuelve null para 'run' y para ids desconocidos.
    const r = buildRegionContributions(items([['2026-01-05', 'run', 100]]), muscleOf, () => null)
    expect(r.byRegion).toEqual({})
  })

  it('no muestra nombre inventado aunque haya volumen', () => {
    const r = buildRegionContributions(
      items([['2026-01-05', 'press', 100]]),
      muscleOf,
      () => null, // sin nombre conocido
    )
    expect(r.byRegion['pectoralis-major'].volume).toBe(100)
    expect(r.byRegion['pectoralis-major'].exercises).toEqual([])
  })

  it('descarta ejercicios sin atribución y volumen no positivo', () => {
    const r = buildRegionContributions(
      items([
        ['2026-01-05', 'desconocido', 100],
        ['2026-01-05', 'press', 0],
        ['2026-01-05', 'press', -50],
      ]),
      muscleOf, nameOf,
    )
    expect(r.byRegion).toEqual({})
  })
})

describe('relativeActivation', () => {
  it('escala 0–100 contra el máximo', () => {
    expect(relativeActivation(1000, 1000)).toBe(100)
    expect(relativeActivation(500, 1000)).toBe(50)
    expect(relativeActivation(250, 1000)).toBe(25)
  })

  it('sin máximo o sin volumen devuelve 0', () => {
    expect(relativeActivation(100, 0)).toBe(0)
    expect(relativeActivation(0, 100)).toBe(0)
    expect(relativeActivation(-10, 100)).toBe(0)
  })

  it('recorta a 0–100 aunque el cálculo se desborde', () => {
    expect(relativeActivation(200, 100)).toBe(100)
    expect(relativeActivation(10, 100)).toBe(10)
  })
})
