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
type Attr = { primary: { name: string; pct?: number }; secondary: { name: string; pct?: number }[] }

const MAP: Record<string, Attr> = {
  press: { primary: { name: 'pectorals', pct: 100 }, secondary: [{ name: 'triceps', pct: 50 }, { name: 'delts', pct: 25 }] },
  run: { primary: { name: 'cardio', pct: 100 }, secondary: [] },
  crunch: { primary: { name: 'abs', pct: 100 }, secondary: [{ name: 'obliques-not-in-vocab', pct: 50 }] },
}
const muscleOf = (id: string) => MAP[id] ?? null
const nameOf = (id: string) => (id === 'press' ? 'Press de banca' : id === 'crunch' ? 'Crunch' : null)

const items = (list: Array<[string, string, number, number?]>): ContributionItem[] =>
  list.map(([date, exerciseId, externalKg, reps]) => ({ date, exerciseId, externalKg, reps: reps ?? 10 }))

describe('buildRegionContributions', () => {
  it('reparte el volumen por rol con los pesos del resto del repo', () => {
    const r = buildRegionContributions(items([['2026-01-05', 'press', 1000, 8]]), muscleOf, nameOf)
    // primary ×1
    expect(r.byRegion['pectoralis-major'].volume).toBe(1000)
    // secondary[0] ×0.5
    expect(r.byRegion['triceps-brachii'].volume).toBe(500)
    // secondary[1] ×0.25 — se reparte a las 3 regiones del deltoides
    expect(r.byRegion['anterior-deltoid'].volume).toBe(250)
    expect(r.byRegion['lateral-deltoid'].volume).toBe(250)
    expect(r.byRegion['posterior-deltoid'].volume).toBe(250)
    expect(r.maxVolume).toBe(1000)
    // sets/reps/days: conteo directo de la serie (sin ponderar)
    expect(r.byRegion['pectoralis-major'].sets).toBe(1)
    expect(r.byRegion['pectoralis-major'].reps).toBe(8)
    expect(r.byRegion['pectoralis-major'].days).toEqual(['2026-01-05'])
    expect(r.byRegion['anterior-deltoid'].sets).toBe(1)
    expect(r.byRegion['anterior-deltoid'].reps).toBe(8)
  })

  it('acumula sets, reps y días de varias series', () => {
    const r = buildRegionContributions(
      items([
        ['2026-01-05', 'press', 200, 8],
        ['2026-01-05', 'press', 200, 8],
        ['2026-01-06', 'press', 200, 10],
      ]),
      muscleOf, nameOf,
    )
    expect(r.byRegion['pectoralis-major'].sets).toBe(3)
    expect(r.byRegion['pectoralis-major'].reps).toBe(26)
    expect(r.byRegion['pectoralis-major'].days).toEqual(['2026-01-05', '2026-01-06'])
    expect(r.byRegion['pectoralis-major'].volume).toBe(600)
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
    expect(r.byRegion['pectoralis-major'].exercises.map((e) => e.name)).toEqual(['Press de banca'])
    expect(r.byRegion['rectus-abdominis'].volume).toBe(900)
    expect(r.byRegion['rectus-abdominis'].exercises.map((e) => e.name)).toEqual(['Crunch'])
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

  it('las series de peso corporal (externalKg 0 o null) cuentan como actividad, no se descartan', () => {
    const r = buildRegionContributions(
      items([
        ['2026-01-05', 'desconocido', 100], // sin atribución → excluida
        ['2026-01-05', 'press', 0], // peso corporal: externa 0, pero actividad válida
        ['2026-01-05', 'press', -50], // peso negativo: se trata como sin carga externa, actividad válida
      ]),
      muscleOf, nameOf,
    )
    // 'desconocido' no tiene atribución: no contribuye regiones.
    // 'press' con externalKg 0 y -50: ambas cuentan como peso corporal (externalKg=null).
    // Cada una aporta sets=1, reps=10 (default) a pectoralis-major, triceps-brachii, y los 3 deltoides.
    expect(r.byRegion['pectoralis-major'].sets).toBe(2)
    expect(r.byRegion['pectoralis-major'].reps).toBe(20) // 2 items × 10 reps
    expect(r.byRegion['pectoralis-major'].volume).toBe(0) // sin carga externa ni estimada
    expect(r.byRegion['triceps-brachii'].sets).toBe(2)
    expect(r.bodyweightSets).toBe(2)
    expect(r.unattributedSets).toBe(1) // 'desconocido' sin atribución
  })

  it('serie de peso corporal con repeticiones válidas cuenta sets y reps aunque sin kg', () => {
    const r = buildRegionContributions(
      items([['2026-01-05', 'press', 0, 12]]),
      muscleOf, nameOf,
    )
    expect(r.byRegion['pectoralis-major'].sets).toBe(1)
    expect(r.byRegion['pectoralis-major'].reps).toBe(12)
    expect(r.byRegion['pectoralis-major'].volume).toBe(0)
    expect(r.byRegion['pectoralis-major'].volumeMeasuredKg).toBe(0)
    expect(r.byRegion['pectoralis-major'].volumeEstimatedKg).toBe(0)
    expect(r.bodyweightSets).toBe(1)
  })

  it('serie con externalKg null (peso corporal sin carga registrada) cuenta como actividad', () => {
    const r = buildRegionContributions(
      [{ date: '2026-01-05', exerciseId: 'press', externalKg: null, reps: 15 }],
      muscleOf, nameOf,
    )
    expect(r.byRegion['pectoralis-major'].sets).toBe(1)
    expect(r.byRegion['pectoralis-major'].reps).toBe(15)
    expect(r.byRegion['pectoralis-major'].volume).toBe(0)
    expect(r.bodyweightSets).toBe(1)
  })

  it('nombres musculares con y sin tildes resuelven a las mismas regiones', () => {
    const muscleOfWithAccents = (id: string) => MAP[id] ?? null
    const r = buildRegionContributions(
      items([['2026-01-05', 'press', 100, 8]]),
      muscleOfWithAccents, nameOf,
    )
    // 'pectorals' → 'pectoralis-major' (alias sin acento)
    expect(r.byRegion['pectoralis-major'].volume).toBe(100)
    // 'delts' → 3 regiones del deltoides, cada una recibe 100 × 0.25 = 25
    expect(r.byRegion['anterior-deltoid'].volume).toBe(25)
    expect(r.byRegion['lateral-deltoid'].volume).toBe(25)
    expect(r.byRegion['posterior-deltoid'].volume).toBe(25)
  })

  it('capa deportiva: etiqueta actividad, minutos y fecha sin tocar volumen', () => {
    const r = buildRegionContributions([], muscleOf, nameOf, {}, [
      {
        date: '2026-01-05', activityId: 'futbol', activityName: 'Fútbol',
        durationMinutes: 60,
        regions: [{ regionId: 'quadriceps', precision: 'musculo', resistedFactor: 1 }],
      },
    ])
    const quad = r.byRegion['quadriceps']
    expect(quad).toBeDefined()
    expect(quad.volume).toBe(0)
    expect(quad.sets).toBe(0)
    expect(quad.exercises.map((e) => e.name)).toEqual(['Fútbol · 60 min · 2026-01-05 (actividad estimada)'])
    expect(r.audit.some((a) => a.kind === 'actividad' && a.admitted)).toBe(true)
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
