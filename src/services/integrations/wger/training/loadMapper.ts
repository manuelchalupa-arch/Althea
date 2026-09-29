// wgerLoadMapper — Convierte unidades de carga WGER → modelo Althea.
// FASE 8: Modelo de carga/unidades interoperable.
// NUNCA inventar una conversión. Conservar siempre el valor original.

import type { Load, LoadType } from '@/services/training/loadModel'
import { kg, lb, plateCount, stackCount } from '@/services/training/loadModel'

// ─── Mapeo de unidades WGER → LoadType ───
const WGER_UNIT_MAP: Record<string, LoadType> = {
  'kg': 'KG',
  'kilogram': 'KG',
  'kilograms': 'KG',
  'lb': 'LB',
  'lbs': 'LB',
  'pound': 'LB',
  'pounds': 'LB',
  'plate': 'PLATE_COUNT',
  'plates': 'PLATE_COUNT',
  'placa': 'PLATE_COUNT',
  'placas': 'PLATE_COUNT',
  'stack': 'STACK_COUNT',
  'stacks': 'STACK_COUNT',
  'lingote': 'STACK_COUNT',
  'lingotes': 'STACK_COUNT',
  'bloque': 'STACK_COUNT',
  'bloques': 'STACK_COUNT',
  'unit': 'UNIT',
  'units': 'UNIT',
  'unidad': 'UNIT',
  'unidades': 'UNIT',
}

// ─── Convertir nombre de unidad WGER → LoadType ───
export function mapWgerUnitToLoadType(unitName: string): LoadType {
  const normalized = unitName.toLowerCase().trim()
  return WGER_UNIT_MAP[normalized] || 'KG'
}

// ─── Crear Load desde valores WGER ───
export function createLoadFromWger(
  value: number | null,
  unitName: string,
  conversionFactor?: number,
): Load | null {
  if (value === null) {return null}

  const unit = mapWgerUnitToLoadType(unitName)

  switch (unit) {
    case 'KG':
      return kg(value)
    case 'LB':
      return lb(value)
    case 'PLATE_COUNT':
      return plateCount(value, conversionFactor)
    case 'STACK_COUNT':
      return stackCount(value, conversionFactor)
    case 'UNIT':
      return { value, unit: 'UNIT' }
    default:
      return kg(value)
  }
}

// ─── Parsear string de carga WGER ───
export function parseWgerLoad(loadText: string): Load | null {
  const trimmed = loadText.trim()
  if (!trimmed) {return null}

  // Patrones comunes: "80 kg", "176 lb", "2 plates", "8 stacks"
  const match = trimmed.match(/^([\d.]+)\s*(kg|lb|lbs|plate|plates|stack|stacks|unit|units|placa|placas|lingote|lingotes|bloque|bloques|unidad|unidades)?/i)

  if (!match) {return null}

  const value = parseFloat(match[1])
  const unitStr = (match[2] || 'kg').toLowerCase()

  return createLoadFromWger(value, unitStr)
}

// ─── Convertir Load a formato WGER ───
export function loadToWgerFormat(load: Load): { value: number; unit: string } {
  switch (load.unit) {
    case 'KG':
      return { value: load.value, unit: 'kg' }
    case 'LB':
      return { value: load.value, unit: 'lb' }
    case 'PLATE_COUNT':
      return { value: load.value, unit: 'plates' }
    case 'STACK_COUNT':
      return { value: load.value, unit: 'stacks' }
    case 'UNIT':
      return { value: load.value, unit: 'units' }
    default:
      return { value: load.value, unit: 'kg' }
  }
}

// ─── Validar si una conversión es posible ───
export function canConvertWgerLoad(load: Load): boolean {
  switch (load.unit) {
    case 'KG':
    case 'LB':
      return true
    case 'PLATE_COUNT':
    case 'STACK_COUNT':
    case 'UNIT':
      return load.conversionFactor !== undefined && load.conversionFactor > 0
    default:
      return false
  }
}

// ─── Obtener factor de conversión conocido ───
export function getKnownConversionFactor(unit: LoadType): number | undefined {
  switch (unit) {
    case 'KG':
      return 1
    case 'LB':
      return 0.45359237
    default:
      return undefined
  }
}

// ─── Crear Load con conversión explícita ───
export function createLoadWithConversion(
  value: number,
  unit: LoadType,
  targetUnit: LoadType,
): Load | null {
  const sourceFactor = getKnownConversionFactor(unit)
  const targetFactor = getKnownConversionFactor(targetUnit)

  if (sourceFactor === undefined || targetFactor === undefined) {
    return null  // No hay conversión conocida
  }

  const convertedValue = (value * sourceFactor) / targetFactor

  return {
    value: convertedValue,
    unit: targetUnit,
    conversionFactor: targetFactor,
  }
}
