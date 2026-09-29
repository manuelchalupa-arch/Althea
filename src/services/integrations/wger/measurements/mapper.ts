// wgerMeasurementMapper — Convierte mediciones WGER → modelo Althea.
// FASE 14: Progreso corporal.
//
// Mapear cuando exista equivalencia real: peso, grasa corporal, perímetros, otras métricas compatibles.
// No importar datos médicos o métricas sin correspondencia clara.
// No sobrescribir mediciones locales existentes.
// En conflictos: ALTHEA LOCAL → conservar, WGER REMOTO → conservar separadamente, CONFLICTO → registrar para revisión.

import type { BodyMeasurement } from '@/types'
import type { WgerMeasurement, WgerMeasurementCategory } from './types'

// ─── Mapeo de categorías WGER → campos BodyMeasurement ───
// Solo mapear cuando exista equivalencia real.
const CATEGORY_FIELD_MAP: Record<string, keyof BodyMeasurement> = {
  'weight': 'weightKg',
  'body fat': 'bodyFatPct',
  'body-fat': 'bodyFatPct',
  'muscle mass': 'muscleMassKg',
  'muscle-mass': 'muscleMassKg',
  'chest': 'chestCm',
  'waist': 'waistCm',
  'hip': 'hipCm',
  'height': 'heightCm',
}

// ─── Normalizar nombre de categoría ───
function normalizeCategoryName(name: string): string {
  return name.toLowerCase().trim()
}

// ─── Obtener campo BodyMeasurement desde categoría WGER ───
export function getBodyMeasurementField(categoryName: string): keyof BodyMeasurement | null {
  const normalized = normalizeCategoryName(categoryName)
  return CATEGORY_FIELD_MAP[normalized] || null
}

// ─── Verificar si una categoría WGER es compatible ───
export function isCompatibleCategory(categoryName: string): boolean {
  return getBodyMeasurementField(categoryName) !== null
}

// ─── Mapear WgerMeasurement → BodyMeasurement ───
// Solo mapear si la categoría es compatible.
// No sobrescribir mediciones locales existentes.
export function mapWgerMeasurementToAlthea(
  measurement: WgerMeasurement,
  existingLocal?: BodyMeasurement,
): BodyMeasurement | null {
  const field = getBodyMeasurementField(measurement.category_name)

  if (!field) {
    // Categoría no compatible: no importar
    return null
  }

  // Si existe una medición local, conservarla (no sobrescribir)
  if (existingLocal) {
    return existingLocal
  }

  // Crear nueva medición desde WGER
  const result: BodyMeasurement = {
    id: `wger-measurement-${measurement.id}`,
    localDate: measurement.date,
    createdAt: new Date().toISOString(),
  }

  // Asignar valor al campo correspondiente
  switch (field) {
    case 'weightKg':
      result.weightKg = measurement.value
      break
    case 'bodyFatPct':
      result.bodyFatPct = measurement.value
      break
    case 'muscleMassKg':
      result.muscleMassKg = measurement.value
      break
    case 'chestCm':
      result.chestCm = measurement.value
      break
    case 'waistCm':
      result.waistCm = measurement.value
      break
    case 'hipCm':
      result.hipCm = measurement.value
      break
    case 'heightCm':
      result.heightCm = measurement.value
      break
  }

  return result
}

// ─── Mapear lista de mediciones ───
export function mapWgerMeasurementsToAlthea(
  measurements: WgerMeasurement[],
  existingLocals: BodyMeasurement[] = [],
): BodyMeasurement[] {
  const result: BodyMeasurement[] = []

  for (const measurement of measurements) {
    // Buscar medición local existente para la misma fecha
    const existing = existingLocals.find((local) => local.localDate === measurement.date)

    const mapped = mapWgerMeasurementToAlthea(measurement, existing)
    if (mapped) {
      result.push(mapped)
    }
  }

  return result
}

// ─── Detectar conflictos entre mediciones locales y WGER ───
export interface MeasurementConflict {
  date: string
  field: keyof BodyMeasurement
  localValue: number
  wgerValue: number
  difference: number
}

export function detectConflicts(
  local: BodyMeasurement[],
  wger: WgerMeasurement[],
): MeasurementConflict[] {
  const conflicts: MeasurementConflict[] = []

  for (const wgerMeasurement of wger) {
    const field = getBodyMeasurementField(wgerMeasurement.category_name)
    if (!field) {continue}

    const localMeasurement = local.find((l) => l.localDate === wgerMeasurement.date)
    if (!localMeasurement) {continue}

    const localValue = localMeasurement[field]
    if (typeof localValue !== 'number') {continue}

    const wgerValue = wgerMeasurement.value
    const difference = Math.abs(localValue - wgerValue)

    // Considerar conflicto si la diferencia es significativa (> 0.1 para peso, > 0.5 para porcentajes)
    const threshold = field === 'bodyFatPct' ? 0.5 : 0.1

    if (difference > threshold) {
      conflicts.push({
        date: wgerMeasurement.date,
        field,
        localValue,
        wgerValue,
        difference,
      })
    }
  }

  return conflicts
}

// ─── Obtener categorías compatibles ───
export function getCompatibleCategories(
  categories: WgerMeasurementCategory[],
): WgerMeasurementCategory[] {
  return categories.filter((c) => isCompatibleCategory(c.name))
}

// ─── Obtener categorías no compatibles ───
export function getIncompatibleCategories(
  categories: WgerMeasurementCategory[],
): WgerMeasurementCategory[] {
  return categories.filter((c) => !isCompatibleCategory(c.name))
}
