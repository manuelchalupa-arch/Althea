// Modelo de carga — FASE 9.
// No asumir que toda carga se representa en kg.
// Conserva SIEMPRE el valor original y su unidad.
// Convierte a kg solo cuando existe equivalencia válida.

/**
 * Tipos de carga soportados.
 * - KG: kilogramos
 * - LB: libras
 * - PLATE_COUNT: número de placas (ej: 2 = 2 placas por lado)
 * - STACK_COUNT: número de lingotes/bloques de máquina
 * - UNIT: unidad genérica (ej: 8 repeticiones de lastre)
 */
export type LoadType = 'KG' | 'LB' | 'PLATE_COUNT' | 'STACK_COUNT' | 'UNIT'

/**
 * Representación completa de una carga.
 * `value` + `unit` es el dato original NUNCA se destruye.
 * `conversionFactor` es opcional: si se conoce, permite calcular kg.
 */
export interface Load {
  value: number
  unit: LoadType
  /** kg por 1 unidad. Solo si se conoce la equivalencia. */
  conversionFactor?: number
}

/** Equivalencia conocida: 1 lb = 0.45359237 kg */
const LB_TO_KG = 0.45359237

/**
 * Crea una carga KG.
 */
export function kg(value: number): Load {
  return { value, unit: 'KG' }
}

/**
 * Crea una carga LB.
 */
export function lb(value: number): Load {
  return { value, unit: 'LB' }
}

/**
 * Crea una carga en lingotes de máquina (STACK_COUNT).
 * Si se conoce la equivalencia (kg por lingote), se incluye conversionFactor.
 */
export function stackCount(value: number, kgPerUnit?: number): Load {
  return { value, unit: 'STACK_COUNT', conversionFactor: kgPerUnit }
}

/**
 * Crea una carga en placas (PLATE_COUNT).
 * `kgPerPlate` es el peso de CADA placa (no total).
 */
export function plateCount(value: number, kgPerPlate?: number): Load {
  return { value, unit: 'PLATE_COUNT', conversionFactor: kgPerPlate }
}

/**
 * Intenta convertir una carga a kg.
 *
 * Reglas:
 * - KG → kg directo
 * - LB → kg si se conoce la equivalencia (siempre conocida)
 * - STACK_COUNT/PLATE_COUNT/UNIT → kg SOLO si conversionFactor existe
 * - Si no hay equivalencia → retorna null (NO inventa)
 *
 * El valor original NUNCA se modifica.
 */
export function toKg(load: Load): number | null {
  switch (load.unit) {
    case 'KG':
      return load.value
    case 'LB':
      return load.value * LB_TO_KG
    case 'STACK_COUNT':
    case 'PLATE_COUNT':
    case 'UNIT':
      if (load.conversionFactor !== undefined && load.conversionFactor > 0) {
        return load.value * load.conversionFactor
      }
      return null
    default:
      return null
  }
}

/**
 * Verifica si una carga puede convertirse a kg.
 */
export function canConvertToKg(load: Load): boolean {
  return toKg(load) !== null
}

/**
 * Formatea una carga para mostrar al usuario.
 * Siempre muestra el valor original con su unidad.
 * Agrega equivalencia en kg solo si es convertible.
 */
export function formatLoad(load: Load): string {
  const base = `${load.value} ${load.unit}`
  const kgValue = toKg(load)
  if (kgValue !== null && load.unit !== 'KG') {
    return `${base} (~${Math.round(kgValue * 10) / 10} kg)`
  }
  if (kgValue === null) {
    return `${base} (sin equivalencia kg)`
  }
  return base
}

/**
 * Parsea un string de carga. Ejemplos:
 * - "80 KG" → { value: 80, unit: 'KG' }
 * - "176 LB" → { value: 176, unit: 'LB' }
 * - "8 lingotes" → { value: 8, unit: 'STACK_COUNT' }
 * - "80" → { value: 80, unit: 'KG' } (default)
 */
export function parseLoad(input: string | number): Load {
  if (typeof input === 'number') {
    return kg(input)
  }
  const s = input.trim().toUpperCase()
  const match = s.match(/^([\d.]+)\s*(KG|KILOGRAMOS?|LB|LBS|LIBRAS?|PLATE|PLACAS?|STACK|LINGOTES?|BLOQUES?|UNITS?|UNIDADES?)?/)
  if (!match) {return kg(0)}
  const value = parseFloat(match[1])
  const unitStr = match[2] || 'KG'

  if (unitStr.startsWith('KG') || unitStr.startsWith('KILO')) {return kg(value)}
  if (unitStr.startsWith('LB') || unitStr.startsWith('LIBRA')) {return lb(value)}
  if (unitStr.startsWith('PLATE') || unitStr.startsWith('PLACA')) {return plateCount(value)}
  if (unitStr.startsWith('STACK') || unitStr.startsWith('LINGOTE') || unitStr.startsWith('BLOQUE')) {return stackCount(value)}
  if (unitStr.startsWith('UNIT') || unitStr.startsWith('UNIDAD')) {return { value, unit: 'UNIT' }}
  return kg(value)
}
