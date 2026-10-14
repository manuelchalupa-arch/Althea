/**
 * DATO DEL ATLAS MUSCULAR — construye el `Record<muscleId, MuscleDataPoint>`
 * que recibe `MuscleAtlas`.
 *
 * Garantiza que TODA región dibujada tenga dato. Antes se iteraba sólo
 * `MUSCLE_CATALOG`, así que las regiones sin entrada en el catálogo
 * (teres-major, infraspinatus, levator-scapulae, soleus, brachioradialis,
 * tensor-fasciae-latae, gluteus-medius) no recibían ningún punto y
 * `lookup(region, data)` devolvía undefined: la región quedaba SIEMPRE en
 * gris aunque hubiera trabajo registrado.
 */
import type { MuscleDataPoint } from './MuscleAtlas'
import type { ContributionResult } from './muscleContributions'
import { relativeActivation } from './muscleContributions'
import { resolveMuscleIds } from './muscleVocabulary'
import { MUSCLE_REGIONS } from './muscleGeometry'
import { MUSCLE_CATALOG } from '@/services/training/muscleCatalog'
import { resolveTrend } from '@/services/training/muscleGroups'

export interface AtlasDataInput {
  /** false → sin datos de entrenamiento, devuelve {}. */
  enabled: boolean
  /** Volumen por grupo de la ventana actual (byGroup de weeklyGroupComparison). */
  currentByGroup: Record<string, number>
  /** Volumen por grupo de la última semana COMPLETA (la base de comparación). */
  previousByGroup: Record<string, number>
  /** Contribuciones por región de la MISMA ventana que `currentByGroup`. */
  contributions: ContributionResult
}

export function buildAtlasMuscleData(input: AtlasDataInput): Record<string, MuscleDataPoint> {
  const { enabled, currentByGroup, previousByGroup, contributions } = input
  if (!enabled) { return {} }

  const out: Record<string, MuscleDataPoint> = {}
  const catalogGroup = new Map(MUSCLE_CATALOG.map((m) => [m.id, m.group]))

  const pointFor = (group: string, regionId: string, catalogId: string): MuscleDataPoint => {
    const current = currentByGroup[group] ?? 0
    const previous = previousByGroup[group] ?? 0
    // Fuente ÚNICA de tendencia: mismo umbral ±5% que la tabla de semanas.
    const { trend } = resolveTrend(current, previous)
    const contribution = contributions.byRegion[regionId]
    return {
      muscleId: catalogId,
      current,
      previous,
      trend,
      unit: 'kg',
      exercises: contribution?.exercises.slice(0, 4),
      activation: contribution
        ? relativeActivation(contribution.volume, contributions.maxVolume)
        : undefined,
    }
  }

  // 1) Catálogo: una entrada puede pintar varias regiones (subdivisiones).
  for (const m of MUSCLE_CATALOG) {
    const regionIds = resolveMuscleIds(m.id)
    if (regionIds.length === 0) { continue }
    for (const rid of regionIds) {
      out[rid] = pointFor(m.group, rid, m.id)
    }
  }

  // 2) Cobertura completa: toda región dibujada recibe SU punto, aunque no
  //    exista en el catálogo y aunque su padre sí tenga entrada. Esto además
  //    hace visible el detalle de las subdivisiones (rectus-abdominis-upper,
  //    pectoralis-major-sternal, ...): sus contribuciones vienen claveadas por
  //    id de región y antes se perdían al quedarse sólo la clave del padre.
  for (const side of ['front', 'back'] as const) {
    for (const r of MUSCLE_REGIONS[side]) {
      if (out[r.id]) { continue }
      const group = (r.parent ? catalogGroup.get(r.parent) : undefined)
        ?? catalogGroup.get(r.id)
        ?? r.group.toUpperCase()
      out[r.id] = pointFor(group, r.id, r.parent ?? r.id)
    }
  }

  return out
}
