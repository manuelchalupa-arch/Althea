// Tipos crudos de la API REST Wger /api/v2/ — mediciones corporales.
// Referencia: https://wger.de/api/v2/
// FASE 14: Progreso corporal.
//
// WGER permite almacenar métricas corporales con categoría, unidad y timestamp.
// Mapear cuando exista equivalencia real: peso, grasa corporal, perímetros, otras métricas compatibles.
// No importar datos médicos o métricas sin correspondencia clara.
// No sobrescribir mediciones locales existentes.
// En conflictos: ALTHEA LOCAL → conservar, WGER REMOTO → conservar separadamente, CONFLICTO → registrar para revisión.

import type { WgerListResponse } from '../wgerTypes'

export interface WgerMeasurementCategory {
  id: number
  name: string
  unit: string
}

export interface WgerMeasurement {
  id: number
  category: number
  category_name: string
  date: string
  value: number
  unit: string
  notes: string | null
}

export interface WgerMeasurementCategoryListResponse extends WgerListResponse<WgerMeasurementCategory> {}
export interface WgerMeasurementListResponse extends WgerListResponse<WgerMeasurement> {}
