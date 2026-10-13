/**
 * SEXO DEL PERFIL — normalización del campo `UserProfile.sex`.
 *
 * El tipo canónico es `'M' | 'F' | 'X'` (src/types/index.ts). Durante un
 * tiempo el onboarding escribía `'masculino' | 'femenino' | 'otro'` en esa
 * misma columna (con un cast `as any`), así que en la base conviven ambos
 * vocabularios. Acá se resuelven a canónico SIN migrar datos destructivamente:
 * es normalización del lado de la lectura.
 *
 * No es un campo nuevo ni duplicado: es el MISMO `sex` de siempre, con una
 * lectura tolerante.
 */

export type SexCode = 'M' | 'F' | 'X'

/** Vocabulario legacy del onboarding. */
const LEGACY: Record<string, SexCode> = {
  masculino: 'M',
  male: 'M',
  hombre: 'M',
  femenino: 'F',
  female: 'F',
  mujer: 'F',
  otro: 'X',
  otrox: 'X',
  'no-binario': 'X',
  nobinario: 'X',
  'no especificado': 'X',
  unspecified: 'X',
}

/**
 * Normaliza cualquier valor guardado (o vacío) a un código canónico.
 * Devuelve `'X'` para todo lo no reconocido, incluido undefined/vacío:
 * `X` es la figura neutral y el valor por defecto del selector.
 */
export function normalizeSex(raw: unknown): SexCode {
  if (typeof raw !== 'string') { return 'X' }
  const key = raw.trim().toLowerCase()
  if (key === 'm') { return 'M' }
  if (key === 'f') { return 'F' }
  if (key === 'x') { return 'X' }
  return LEGACY[key] ?? 'X'
}

/** Etiqueta legible en español para mostrar en la UI. */
export const SEX_LABEL: Record<SexCode, string> = {
  M: 'Masculino',
  F: 'Femenino',
  X: 'No especificado',
}
