import { describe, it, expect } from 'vitest'
import { wgerToAltheaExercise, buildProvenance } from './wgerMapper'
import type { WgerExerciseInfo, WgerTranslation } from './wgerTypes'

// Datos de prueba basados en la API real de Wger
const mockTranslation: WgerTranslation = {
  id: 345,
  uuid: 'c788d643-150a-4ac7-97ef-84643c6419bf',
  name: '2 Handed Kettlebell Swing',
  exercise: 9,
  description: '<p>Two Handed Russian Style Kettlebell swing</p>\n',
  description_source: 'Two Handed Russian Style Kettlebell swing',
  language: 2,
  aliases: [],
  notes: [],
}

const mockInfo: WgerExerciseInfo = {
  id: 9,
  uuid: '1b020b3a-3732-4c7e-92fd-a0cec90ed69b',
  created: '2023-08-06T10:17:17.422900+02:00',
  last_update: '2026-07-23T12:24:53.482746+02:00',
  category: { id: 10, name: 'Abs' },
  muscles: [
    { id: 11, name: 'Biceps femoris', name_en: 'Hamstrings', is_front: false, image_url_main: '', image_url_secondary: '' },
  ],
  muscles_secondary: [
    { id: 8, name: 'Gluteus maximus', name_en: 'Glutes', is_front: false, image_url_main: '', image_url_secondary: '' },
    { id: 10, name: 'Quadriceps femoris', name_en: 'Quads', is_front: true, image_url_main: '', image_url_secondary: '' },
  ],
  equipment: [{ id: 10, name: 'Kettlebell' }],
  license: { id: 2, full_name: 'Creative Commons Attribution Share Alike 4', short_name: 'CC-BY-SA 4', url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.en' },
  license_author: 'deusinvictus',
  images: [],
  translations: [mockTranslation],
  videos: [],
}

describe('wgerMapper', () => {
  it('convierte WgerExerciseInfo a Exercise de Althea', () => {
    const result = wgerToAltheaExercise(mockInfo)

    expect(result.id).toBe('wger-9')
    expect(result.slug).toBe('wger-9')
    expect(result.name).toBe('2 Handed Kettlebell Swing')
    expect(result.muscle).toBe('biceps femoris')
    expect(result.bodyPart).toBe('legs')
    expect(result.equipment).toBe('kettlebell')
    expect(result.category).toBe('abs')
    expect(result.origin).toBe('PRELOADED')
  })

  it('extrae instrucciones desde HTML', () => {
    const result = wgerToAltheaExercise(mockInfo)
    expect(result.instructions).toContain('Two Handed Russian Style Kettlebell swing')
    expect(result.instructions[0]).not.toContain('<p>')
  })

  it('mapea músculos secundarios', () => {
    const result = wgerToAltheaExercise(mockInfo)
    expect(result.secondaryMuscles).toContain('gluteus maximus')
    expect(result.secondaryMuscles).toContain('quadriceps femoris')
  })

  it('construye muscleBreakdown con roles correctos', () => {
    const result = wgerToAltheaExercise(mockInfo)
    expect(result.muscleBreakdown).toBeDefined()
    expect(result.muscleBreakdown![0].role).toBe('Principal')
    expect(result.muscleBreakdown![0].name).toBe('biceps femoris')
    // Los secundarios deben tener rol 'Secundario'
    const secondaries = result.muscleBreakdown!.filter(m => m.role === 'Secundario')
    expect(secondaries.length).toBe(2)
  })

  it('maneja ejercicio sin traducciones', () => {
    const infoWithoutTranslations = { ...mockInfo, translations: [] }
    const result = wgerToAltheaExercise(infoWithoutTranslations)
    expect(result.name).toBe('Wger exercise 9')
  })

  it('maneja ejercicio sin músculos', () => {
    const infoWithoutMuscles = { ...mockInfo, muscles: [], muscles_secondary: [] }
    const result = wgerToAltheaExercise(infoWithoutMuscles)
    expect(result.muscle).toBe('')
    expect(result.bodyPart).toBe('other')
  })

  it('prefiere español sobre inglés', () => {
    const withSpanish: WgerTranslation = {
      ...mockTranslation,
      language: 2,
      name: 'Balanceo de Kettlebell a Dos Manos',
    }
    const withEnglish: WgerTranslation = {
      ...mockTranslation,
      language: 1,
      name: 'Two Handed Kettlebell Swing',
    }
    const info = { ...mockInfo, translations: [withEnglish, withSpanish] }
    const result = wgerToAltheaExercise(info)
    expect(result.name).toBe('Balanceo de Kettlebell a Dos Manos')
  })
})

describe('buildProvenance', () => {
  it('construye metadatos de procedencia', () => {
    const provenance = buildProvenance(mockInfo)

    expect(provenance.altheaId).toBe('wger-9')
    expect(provenance.source).toBe('wger')
    expect(provenance.sourceId).toBe(9)
    expect(provenance.sourceUuid).toBe('1b020b3a-3732-4c7e-92fd-a0cec90ed69b')
    expect(provenance.license).toBe('Creative Commons Attribution Share Alike 4')
    expect(provenance.licenseUrl).toBe('https://creativecommons.org/licenses/by-sa/4.0/deed.en')
    expect(provenance.licenseAuthor).toBe('deusinvictus')
    expect(provenance.importedAt).toBeDefined()
  })
})
