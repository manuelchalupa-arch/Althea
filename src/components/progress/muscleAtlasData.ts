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
 *
 * Separa dos conceptos independientes:
 * - intensity (COLOR): volumen de la región en la ventana actual, relativo al
 *   máximo de la consulta y en la métrica elegida (volumen / series / reps).
 *   Un músculo con trabajo registrado SIEMPRE tiene intensidad > 0.
 * - trend (COMPARACIÓN): misma región y misma métrica contra la ventana
 *   previa de igual duración. Sin baseline previo real → 'sin-base', que NO
 *   apaga el color: solo informa que no hay comparación.
 */
import type { MuscleDataPoint } from './MuscleAtlas'
import type { ContributionResult, RegionContribution } from './muscleContributions'
import { resolveMuscleIds } from './muscleVocabulary'
import { MUSCLE_REGIONS } from './muscleGeometry'
import { MUSCLE_CATALOG } from '@/services/training/muscleCatalog'
import { resolveTrend, type MuscleTrend } from '@/services/training/muscleGroups'
import { intensityOf, metricUnitOf, metricValueOf, type AtlasMetric } from './atlasQuery'

export interface AtlasDataInput {
  /** false → sin datos de entrenamiento, devuelve {}. */
  enabled: boolean
  /** Agregado por región de la ventana ANALIZADA. */
  current: ContributionResult
  /** Agregado por región de la ventana PREVIA comparable, o null si no hay. */
  previous: ContributionResult | null
  /** Métrica que colorea el mapa. */
  metric: AtlasMetric
}

function previousOf(previous: ContributionResult | null, regionId: string, metric: AtlasMetric): number {
  if (!previous) { return 0 }
  const stat = previous.byRegion[regionId]
  if (!stat) { return 0 }
  return metricValueOf(stat, metric)
}

export function buildAtlasMuscleData(input: AtlasDataInput): Record<string, MuscleDataPoint> {
  const { enabled, current, previous, metric } = input
  if (!enabled) { return {} }

  const unit = metricUnitOf(metric)

  // Máximo de la métrica elegida entre las regiones con trabajo: base de la
  // normalización (relativa a ESTA consulta, documentada en la leyenda).
  let maxMetric = 0
  const currentMetricByRegion: Record<string, number> = {}
  for (const [id, stat] of Object.entries(current.byRegion)) {
    const v = metricValueOf(stat, metric)
    currentMetricByRegion[id] = v
    if (v > maxMetric) { maxMetric = v }
  }

  // Series de la ventana: sin ninguna, un músculo gris es "sin actividad".
  const windowSets = current.totalSets ?? 0
  const noAttributionAtAll = windowSets > 0 && maxMetric === 0

  /** Resuelve el dato para una región, heredando del padre si es subdivisión y no tiene dato directo. */
  const pointForRegion = (regionId: string, catalogId: string): MuscleDataPoint => {
    const stat: RegionContribution | undefined = current.byRegion[regionId]

    // Si es subdivisión y no tiene dato directo, heredar del padre.
    let inheritedFrom: string | undefined
    let effectiveStat = stat
    if (!stat && regionId !== catalogId) {
      const parentStat = current.byRegion[catalogId]
      if (parentStat) {
        effectiveStat = parentStat
        inheritedFrom = catalogId
      }
    }

    const value = currentMetricByRegion[regionId] ?? 0
    // Si heredamos del padre, usar el valor del padre para la métrica.
    const effectiveValue = inheritedFrom ? (currentMetricByRegion[catalogId] ?? 0) : value
    const prevValue = previousOf(previous, regionId, metric)
    const intensity = intensityOf(effectiveValue, maxMetric)

    // TENDENCIA: misma región y misma métrica contra la ventana previa.
    let trend: MuscleTrend = 'sin-base'
    if (effectiveValue > 0 && prevValue > 0) {
      trend = resolveTrend(effectiveValue, prevValue).trend
    }

    return {
      muscleId: catalogId,
      current: Math.round(effectiveValue * 10) / 10,
      previous: Math.round(prevValue * 10) / 10,
      trend,
      unit,
      exercises: effectiveStat?.exercises.slice(0, 4).map((e) => e.name) ?? [],
      intensity,
      sets: effectiveStat?.sets ?? 0,
      reps: effectiveStat?.reps ?? 0,
      days: effectiveStat?.days ?? [],
      metric,
      metricValue: Math.round(effectiveValue * 10) / 10,
      emptyReason:
        effectiveValue > 0
          ? 'ok'
          : noAttributionAtAll
            ? 'sin-atribucion'
            : windowSets > 0
              ? 'sin-alcance'
              : 'ok',
    }
  }

  const out: Record<string, MuscleDataPoint> = {}

  // 1) Catálogo: una entrada puede pintar varias regiones (subdivisiones).
  for (const m of MUSCLE_CATALOG) {
    const regionIds = resolveMuscleIds(m.id)
    if (regionIds.length === 0) { continue }
    for (const rid of regionIds) {
      out[rid] = pointForRegion(rid, m.id)
    }
  }

  // 2) Cobertura completa: toda región dibujada recibe SU punto, aunque no
  //    exista en el catálogo y aunque su padre sí tenga entrada.
  for (const side of ['front', 'back'] as const) {
    for (const r of MUSCLE_REGIONS[side]) {
      if (out[r.id]) { continue }
      out[r.id] = pointForRegion(r.id, r.parent ?? r.id)
    }
  }

  return out
}
