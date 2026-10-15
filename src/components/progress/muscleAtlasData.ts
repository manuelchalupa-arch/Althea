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
  /** Agregado por región de la ventana ANALIZADA (misma que la gráfica). */
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

  const pointForRegion = (regionId: string, catalogId: string): MuscleDataPoint => {
    const stat: RegionContribution | undefined = current.byRegion[regionId]
    const value = currentMetricByRegion[regionId] ?? 0
    const prevValue = previousOf(previous, regionId, metric)
    const intensity = intensityOf(value, maxMetric)

    // TENDENCIA: misma región y misma métrica contra la ventana previa.
    // Sin trabajo actual o sin baseline previo → 'sin-base' (no apaga el color).
    let trend: MuscleTrend = 'sin-base'
    if (value > 0 && prevValue > 0) {
      trend = resolveTrend(value, prevValue).trend
    }

    return {
      muscleId: catalogId,
      current: Math.round(value * 10) / 10,
      previous: Math.round(prevValue * 10) / 10,
      trend,
      unit,
      exercises: stat?.exercises.slice(0, 4) ?? [],
      intensity,
      sets: stat?.sets ?? 0,
      reps: stat?.reps ?? 0,
      days: stat?.days ?? [],
      metric,
      metricValue: Math.round(value * 10) / 10,
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
