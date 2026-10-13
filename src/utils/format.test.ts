// Tests del contrato de normalización canónica de texto (stripAccents/normFold).
//
// IMPORTANTE: estas dos funciones son la ÚNICA fuente de verdad de normalización
// de la app (16 consumidores: búsqueda de ejercicios, filtro, matcher WGER,
// músculos, sinónimos IA, slug de ejercicios personalizados, etc.).
//
// El orden de operaciones es parte del contrato y NO se puede cambiar sin
// revisar todos los consumidores:
//   normFold = toLowerCase()  →  stripAccents(NFD + elimina diacríticos)
//
// No se trimea acá: el trim es responsabilidad de cada consumidor.

import { describe, it, expect } from 'vitest'
import { stripAccents, normFold, prettyExId } from '@/utils/format'
import { matchesQuery, exerciseMatches, getSynonyms, normalize } from '@/services/training/exerciseSearch'
import { normalizeToken, parseDayMuscles } from '@/utils/muscleMap'

describe('stripAccents', () => {
  it('quita los diacríticos de español', () => {
    expect(stripAccents('café')).toBe('cafe')
    expect(stripAccents('jalón al pecho')).toBe('jalon al pecho')
    expect(stripAccents('glúteos')).toBe('gluteos')
    expect(stripAccents('tríceps')).toBe('triceps')
  })

  it('quita la tilde de la ñ (se descompone en n + diacrítico)', () => {
    expect(stripAccents('español')).toBe('espanol')
  })

  it('resuelve también el ü (diéresis) y otras vocales', () => {
    expect(stripAccents('pingüino')).toBe('pinguino')
    expect(stripAccents('Ångström')).toBe('Angstrom')
    expect(stripAccents('crème brûlée')).toBe('creme brulee')
  })

  it('NO baja mayúsculas: sólo quita diacríticos', () => {
    expect(stripAccents('ÁÉÍÓÚ')).toBe('AEIOU')
    expect(stripAccents('Café')).toBe('Cafe')
  })

  it('deja intacto lo que no tiene diacríticos', () => {
    expect(stripAccents('press banca 45kg')).toBe('press banca 45kg')
    expect(stripAccents('')).toBe('')
    expect(stripAccents('🏋️ 123 !@#')).toBe('🏋️ 123 !@#')
  })

  it('trata igual la forma compuesta (NFC) que la descomposta (NFD)', () => {
    const COMBINING_ACUTE = String.fromCodePoint(0x301)   // ́
    const COMBINING_TILDE = String.fromCodePoint(0x303)   // ̃
    const eNFD = 'e' + COMBINING_ACUTE
    const nNFD = 'n' + COMBINING_TILDE

    expect(eNFD.length).toBe(2)
    expect(stripAccents(eNFD)).toBe('e')
    expect(stripAccents('é')).toBe('e')
    expect(stripAccents(nNFD)).toBe('n')
    expect(stripAccents('ñ')).toBe('n')
  })
})

describe('normFold', () => {
  it('aplica minúsculas y quita acentos en ese orden', () => {
    expect(normFold('Café')).toBe('cafe')
    expect(normFold('PESO MUERTO RUMANO')).toBe('peso muerto rumano')
    expect(normFold('BÍCEPS BRAQUIAL')).toBe('biceps braquial')
  })

  it('es idempotente (doblar el fold no cambia el resultado)', () => {
    expect(normFold(normFold('Jalón al Pecho'))).toBe(normFold('Jalón al Pecho'))
    expect(normFold('ÓPTIMO')).toBe('optimo')
    expect(normFold(normFold('ÓPTIMO'))).toBe('optimo')
  })

  it('NO trima espacios (responsabilidad del consumidor)', () => {
    expect(normFold('  café  ')).toBe('  cafe  ')
    expect(normalize('  café  ')).toBe('cafe')
  })

  it('colapsa sinónimos de acento: BÍCEPS y Biceps son la misma clave', () => {
    expect(normFold('Bíceps')).toBe(normFold('Biceps'))
    expect(normFold('Glúteos')).toBe(normFold('Gluteos'))
  })

  it('no rompe con dígitos ni emoji', () => {
    expect(normFold('Sentadilla 5x5 💪')).toBe('sentadilla 5x5 💪')
  })
})

describe('prettyExId (nombres legibles)', () => {
  it('convierte slugs en texto', () => {
    expect(prettyExId('biceps-curl')).toBe('biceps curl')
  })

  it('toma el último segmento de ids con ruta', () => {
    expect(prettyExId('custom/mi-press-inclinado')).toBe('mi press inclinado')
  })

  it('acepta ids numéricos y vacíos sin romper', () => {
    expect(prettyExId(42)).toBe('42')
    expect(prettyExId('')).toBe('')
  })
})

describe('búsqueda de ejercicios (consumidor real del fold)', () => {
  it('ignora mayúsculas y acentos en la query', () => {
    expect(exerciseMatches({ name: 'Jalón al pecho con barra' }, 'JALON AL PECHO')).toBe(true)
    expect(exerciseMatches({ name: 'Curl de bíceps' }, 'curl de biceps')).toBe(true)
  })

  it('tolera singular/plural ligero', () => {
    expect(matchesQuery('Flexiones', 'flexion')).toBe(true)
    expect(matchesQuery('Flexiones', 'flexiones')).toBe(true)
  })

  it('resuelve sinónimos español ↔ inglés', () => {
    expect(exerciseMatches({ name: 'Sentadilla con barra' }, 'squat')).toBe(true)
    expect(exerciseMatches({ name: 'Romanian Deadlift' }, 'peso muerto rumano')).toBe(true)
    expect(exerciseMatches({ name: 'Lat Pulldown' }, 'jalón al pecho')).toBe(true)
    expect(exerciseMatches({ name: 'Hip Thrust' }, 'puente de glúteos')).toBe(true)
  })

  it('busca en campos secundarios (músculo, equipamiento, alias)', () => {
    expect(exerciseMatches({ name: 'Ejercicio X', muscle: 'cuádriceps' }, 'quadriceps')).toBe(true)
    expect(exerciseMatches({ name: 'Ejercicio Y', equipment: 'Mancuerna' }, 'dumbbell')).toBe(true)
  })

  it('busca dentro de ejercicios personalizados del usuario (nombre libre)', () => {
    const custom = { name: 'Press inclinado con mancuernas 30°' }
    expect(exerciseMatches(custom, 'INCLINADO')).toBe(true)
    expect(exerciseMatches(custom, 'mancuerna')).toBe(true)
    expect(exerciseMatches(custom, 'press inclinado con mancuernas')).toBe(true)
  })

  it('no matchea términos ajenos (el fold no puede inventar coincidencias)', () => {
    expect(exerciseMatches({ name: 'Prensa de piernas' }, 'sentadilla')).toBe(false)
    expect(matchesQuery('curl de bíceps', 'dominadas')).toBe(false)
  })

  it('exponé sinónimos ya normalizados (sin acentos)', () => {
    // Devuelve los OTROS términos del grupo, en su forma fold.
    expect(getSynonyms('jalón al pecho')).toEqual(['lat pulldown'])
    expect(getSynonyms('JALÓN AL PECHO')).toEqual(['lat pulldown'])
    expect(getSynonyms('cuádriceps')).toEqual(
      expect.arrayContaining(['quadriceps', 'quads', 'cuadriceps femoris']),
    )
    expect(getSynonyms('término inexistente')).toEqual([])
  })
})

describe('músculos (consumidor real del fold)', () => {
  it('normaliza tokens acentuados a la forma de la API', () => {
    expect(normalizeToken('Bíceps')).toBe('biceps')
    expect(normalizeToken(' glúteos ')).toBe('glutes')
    expect(normalizeToken('Cuádriceps')).toBe('quads')
    expect(normalizeToken('ISQUIOS')).toBe('hamstrings')
  })

  it('devuelve null para grupos desconocidos (no inventa)', () => {
    expect(normalizeToken('tobillo')).toBeNull()
  })

  it('interpreta una descripción de día con acentos y separadores', () => {
    const muscles = parseDayMuscles('Día de pecho y tríceps')
    expect(muscles).toContain('pectorals')
    expect(muscles).toContain('triceps')

    const legs = parseDayMuscles('piernas')
    expect(legs).toContain('quads')
    expect(legs).toContain('hamstrings')
    expect(legs).toContain('glutes')
  })
})
