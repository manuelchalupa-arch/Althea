import { describe, it, expect } from 'vitest'
import {
  TRADITIONAL_SEEDS,
  TRADITIONAL_GROUPS,
  CUSTOM_FORM_MUSCLES,
  CUSTOM_FORM_EQUIPMENT,
  CUSTOM_FORM_CATEGORIES,
  buildTraditionalList,
  traditionalForGroup,
  traditionalItems,
  toggleGroupExcluded,
} from './traditionalCatalog'
import type { Exercise } from '@/services/exerciseGym'

const mkCatalog = (): Exercise[] =>
  TRADITIONAL_SEEDS.filter(s => s.gymId).map(s => ({
    id: s.gymId as string,
    slug: (s.gymId as string).split('/')[1],
    name: `${s.name} (catálogo)`,
    muscle: s.group,
    bodyPart: s.group,
    equipment: s.equipment,
    category: 'strength',
    secondaryMuscles: [],
    instructions: ['Paso 1'],
    file: '',
    gifUrl: `https://example.com/${s.id}.gif`,
  }))

describe('traditionalCatalog — síntesis de la Biblioteca', () => {
  it('la lista curada no tiene ids ni gymIds duplicados', () => {
    const ids = TRADITIONAL_SEEDS.map(s => s.id)
    const gymIds = TRADITIONAL_SEEDS.filter(s => s.gymId).map(s => s.gymId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(gymIds).size).toBe(gymIds.length)
  })

  it('todas las semillas pertenecen a uno de los 5 grupos de la cabecera', () => {
    const groupIds = new Set(TRADITIONAL_GROUPS.map(g => g.id))
    for (const s of TRADITIONAL_SEEDS) {
      expect(groupIds.has(s.group), `${s.id} con grupo desconocido`).toBe(true)
    }
  })

  it('con catálogo completo: las entradas con gymId matchean (GIF real)', () => {
    const list = buildTraditionalList(mkCatalog())
    expect(list.length).toBe(TRADITIONAL_SEEDS.length)
    const withGymId = list.filter(e => e.gymId)
    expect(withGymId.length).toBeGreaterThan(0)
    expect(withGymId.every(e => e.matched && e.exercise.gifUrl !== '')).toBe(true)
    // shortcut: hip thrust con barra no existe en ExerciseGymGifsDB (solo versión
    // con banda) — queda sin GIF hasta que el catálogo lo publique. Igual los
    // estiramientos/movilidad: sin gymId se sintetizan sin GIF.
    const unmatched = list.filter(e => !e.matched)
    expect(unmatched.map(e => e.id)).toEqual(TRADITIONAL_SEEDS.filter(s => !s.gymId).map(s => s.id))
  })

  it('con catálogo vacío: se sintetizan sin GIF y conservan el id propio', () => {
    const list = buildTraditionalList([])
    expect(list.length).toBe(TRADITIONAL_SEEDS.length)
    expect(list.every(e => !e.matched)).toBe(true)
    expect(list.every(e => e.exercise.id.startsWith('trad/'))).toBe(true)
  })

  it('cuando hay match se conserva el id del catálogo (favoritos/exclusiones previas)', () => {
    const list = buildTraditionalList(mkCatalog())
    const squat = list.find(e => e.id === 'trad/back-squat')
    expect(squat?.exercise.id).toBe('glutes/barbell-low-bar-squat')
  })

  it('traditionalForGroup filtra por grupo y __all__ devuelve todo', () => {
    const catalog = mkCatalog()
    const piernas = traditionalForGroup(catalog, 'piernas')
    expect(piernas.length).toBeGreaterThan(0)
    expect(piernas.every(e => e.group === 'piernas')).toBe(true)
    expect(traditionalForGroup(catalog, '__all__').length).toBe(TRADITIONAL_SEEDS.length)
  })

  it('las semillas tienen muscle y las opciones del form se derivan de ellas', () => {
    expect(TRADITIONAL_SEEDS.every(s => s.muscle !== '')).toBe(true)
    expect(CUSTOM_FORM_MUSCLES.length).toBeGreaterThan(0)
    expect(new Set(CUSTOM_FORM_MUSCLES).size).toBe(CUSTOM_FORM_MUSCLES.length)
    expect(CUSTOM_FORM_EQUIPMENT).toContain('barra')
    expect(CUSTOM_FORM_CATEGORIES).toContain('strength')
  })

  it('el ejercicio sintetizado usa muscle y bodyPart del grupo (no el id de grupo)', () => {
    const squat = buildTraditionalList([]).find(e => e.id === 'trad/back-squat')
    expect(squat?.exercise.muscle).toBe('quads')
    expect(squat?.exercise.bodyPart).toBe('legs')
  })

  it('traditionalForGroup separa por finalidad y no mezcla categorías', () => {
    const catalog = mkCatalog()
    const conventional = traditionalForGroup(catalog, '__all__', 'conventional')
    expect(conventional.length).toBeGreaterThan(0)
    expect(conventional.some(e => e.id.startsWith('trad/stretch') || e.id.startsWith('trad/warm'))).toBe(false)
    // Un grupo convencional (Piernas) no arrastra estiramientos ni calentamiento.
    expect(traditionalForGroup(catalog, 'piernas', 'conventional').some(e => e.purpose)).toBe(false)

    const stretch = traditionalForGroup(catalog, '__all__', 'stretch')
    expect(stretch.length).toBeGreaterThan(0)
    expect(stretch.every(e => e.purpose === 'stretch' && e.exercise.purpose === 'stretch')).toBe(true)
    expect(stretch.every(e => e.exercise.category === 'stretching')).toBe(true)

    const mobility = traditionalForGroup(catalog, '__all__', 'mobility')
    expect(mobility.length).toBeGreaterThan(0)
    expect(mobility.every(e => e.purpose === 'mobility')).toBe(true)

    const warmup = traditionalForGroup(catalog, '__all__', 'warmup')
    expect(warmup.length).toBeGreaterThan(0)
    expect(warmup.every(e => e.purpose === 'warmup')).toBe(true)
  })

  it('traditionalItems agrega el grupo a cada ejercicio', () => {    const items = traditionalItems(mkCatalog())
    expect(items.length).toBe(TRADITIONAL_SEEDS.length)
    expect(items.every(e => TRADITIONAL_GROUPS.some(g => g.id === e.group))).toBe(true)
  })

  it('toggleGroupExcluded excluye todo el grupo de una vez y luego lo quita', () => {
    const items = traditionalItems([])
    const coreIds = items.filter(e => e.group === 'core').map(e => e.id)
    expect(coreIds.length).toBeGreaterThan(1)

    const allEx = toggleGroupExcluded(items, 'core', [])
    expect(allEx).toEqual(expect.arrayContaining(coreIds))

    // parcial: solo agrega los que faltan (no duplica ni toca otros grupos)
    const partial = toggleGroupExcluded(items, 'core', [coreIds[0]!])
    expect(new Set(partial)).toEqual(new Set(allEx))

    // todo excluido → lo quita todo, sin tocar exclusiones de otros grupos
    const withOther = [...allEx, 'otro/id']
    expect(toggleGroupExcluded(items, 'core', withOther)).toEqual(['otro/id'])
    expect(toggleGroupExcluded(items, 'core', [])).toEqual(expect.arrayContaining(coreIds))
  })

  it('toggleGroupExcluded con grupo sin items devuelve la lista igual', () => {
    const items = traditionalItems([])
    expect(toggleGroupExcluded(items.filter(e => e.group !== 'core'), 'core', ['a'])).toEqual(['a'])
  })
})
