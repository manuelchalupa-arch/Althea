// Genera el plan individual de series según el tipo de serie.
// Cada serie puede tener peso y reps diferentes (PYRAMID, ASCENDING, etc).
// No copia automáticamente los mismos valores a todas las series.

import type { SetType } from '@/services/training/domain'

export interface PlannedSetInput {
  order: number
  reps: number
  weight: number | null
  setType: SetType
}

interface GenerateOptions {
  sets: number
  baseWeight: number
  baseReps: number
  seriesType: string
  /** Incremento de peso por serie para tipos piramidales. Default: 5 */
  weightStep?: number
  /** Reducción de reps por serie para tipos piramidales. Default: 2 */
  repsStep?: number
}

/**
 * Genera un array de PlannedSetInput con valores individuales por serie.
 *
 * Tipos soportados:
 * - NORMAL: todas las series iguales
 * - ASCENDING / PYRAMID_ASCENDING: peso sube, reps bajan
 * - DESCENDING: peso baja, reps suben
 * - PYRAMID_DESCENDING: peso sube, reps bajan (ej: 12×60, 10×65, 8×70, 6×75)
 * - PYRAMID_FULL: sube y baja
 * - DROP_SET: peso baja en cada serie
 * - CUSTOM: todas iguales (el usuario puede editar después)
 */
export function generatePlannedSets(opts: GenerateOptions): PlannedSetInput[] {
  const { sets, baseWeight, baseReps, seriesType } = opts
  const weightStep = opts.weightStep ?? 5
  const repsStep = opts.repsStep ?? 2
  const type = (seriesType || 'NORMAL').toUpperCase().replace(/\s+/g, '_')

  const result: PlannedSetInput[] = []

  for (let i = 0; i < sets; i++) {
    let weight = baseWeight
    let reps = baseReps
    let setType: SetType = 'NORMAL'

    switch (type) {
      case 'ASCENDENTE':
      case 'ASCENDING':
      case 'PIRAMID_ASCENDING':
      case 'PYRAMID_ASCENDING':
        weight = baseWeight + weightStep * i
        reps = Math.max(1, baseReps - repsStep * i)
        setType = 'ASCENDING'
        break

      case 'DESCENDENTE':
      case 'DESCENDING':
        weight = Math.max(0, baseWeight - weightStep * i)
        reps = baseReps + repsStep * i
        setType = 'DESCENDING'
        break

      case 'PIRAMIDAL':
      case 'PYRAMID_DESCENDING':
        // Peso sube, reps bajan: S1=12×60, S2=10×65, S3=8×70, S4=6×75
        weight = baseWeight + weightStep * i
        reps = Math.max(1, baseReps - repsStep * i)
        setType = 'PYRAMID_DESCENDING'
        break

      case 'PIRAMID_FULL':
      case 'PYRAMID_FULL':
        // Sube y baja a la mitad
        const half = Math.floor(sets / 2)
        if (i <= half) {
          weight = baseWeight + weightStep * i
          reps = Math.max(1, baseReps - repsStep * i)
        } else {
          const back = sets - 1 - i
          weight = baseWeight + weightStep * back
          reps = Math.max(1, baseReps - repsStep * back)
        }
        setType = 'PYRAMID_FULL'
        break

      case 'DROPSET':
      case 'DROP_SET':
        weight = Math.max(0, baseWeight - weightStep * (i + 1))
        reps = baseReps
        setType = 'DROP_SET'
        break

      case 'NORMAL':
      case 'CUSTOM':
      case 'OTRA':
      default:
        weight = baseWeight
        reps = baseReps
        setType = 'NORMAL'
        break
    }

    result.push({
      order: i + 1,
      reps,
      weight,
      setType,
    })
  }

  return result
}

/**
 * Mapea el label del select del modal a SetType.
 */
export function seriesTypeToSetType(label: string): SetType {
  const map: Record<string, SetType> = {
    'normal': 'NORMAL',
    'ascendente': 'ASCENDING',
    'descendente': 'DESCENDING',
    'piramidal': 'PYRAMID_DESCENDING',
    'dropset': 'DROP_SET',
    'otra': 'CUSTOM',
  }
  return map[label.toLowerCase()] || 'NORMAL'
}

/**
 * Resuelve el tipo de serie planificado a partir de cualquier texto de la
 * rutina (label en español, token en mayúsculas o indefinido).
 * Único punto de conversión rutina → SetType: no duplicar el mapa.
 */
export function resolveSetType(seriesType?: string | null): SetType {
  if (!seriesType) { return 'NORMAL' }
  const t = seriesType.toUpperCase().replace(/\s+/g, '_')
  const known: Record<string, SetType> = {
    NORMAL: 'NORMAL',
    ASCENDING: 'ASCENDING', ASCENDENTE: 'ASCENDING',
    DESCENDING: 'DESCENDING', DESCENDENTE: 'DESCENDING',
    PYRAMID_ASCENDING: 'PYRAMID_ASCENDING', PIRAMID_ASCENDING: 'PYRAMID_ASCENDING', PIRAMIDE_ASCENDENTE: 'PYRAMID_ASCENDING',
    PYRAMID_DESCENDING: 'PYRAMID_DESCENDING', PIRAMID_DESCENDING: 'PYRAMID_DESCENDING', PIRAMIDAL: 'PYRAMID_DESCENDING',
    PYRAMID_FULL: 'PYRAMID_FULL', PIRAMID_FULL: 'PYRAMID_FULL', PIRAMIDAL_FULL: 'PYRAMID_FULL',
    DROPSET: 'DROP_SET', DROP_SET: 'DROP_SET',
    CUSTOM: 'CUSTOM', OTRA: 'CUSTOM',
  }
  return known[t] ?? seriesTypeToSetType(seriesType)
}
