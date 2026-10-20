/**
 * CARGA EQUIVALENTE — EJERCICIOS CON PESO CORPORAL
 *
 * Separate en tres magnitudes que NUNCA deben mezclarse en un solo número:
 *
 *   1. CARGA EXTERNA REAL   (`externalKg`)  — lo que se pasó por la barra o
 *      las mancuernas. Es una MEDICIÓN del registro de la serie.
 *   2. PESO CORPORAL        (`bodyweightKg`) — medición de la persona en la
 *      FECHA del entrenamiento, con procedencia explícita.
 *   3. CARGA EQUIVALENTE    (`equivalentKg`) — ESTIMACIÓN calculada con un
 *      modelo documentado. Es `null` cuando no existe un coeficiente
 *      suficientemente justificado para esa variante.
 *
 * Reglas innegociables:
 *   - Nunca se convierte "carga desconocida" en 0: se devuelve `null`.
 *   - Un ejercicio sin coeficiente NO pierde su actividad: devuelve
 *     `equivalentKg: null` y la serie sigue contando como registrada.
 *   - Ningún coeficiente se aplica a una variante para la que no se estudió.
 *   - Cada coeficiente declara su fuente y su limitación.
 *
 * Fuentes:
 *   - Flexiones: Suprak, Dawes & Stephenson (2010), "The effect of grip and
 *     push-up position on the percent body weight supported during push-ups",
 *     J Strength Cond Res / PubMed 20179649. Posiciones ESTÁTICAS de las manos;
 *     no miden la fuerza generada por cada músculo.
 *     https://pubmed.ncbi.nlm.nih.gov/20179649/
 *   - Dominadas: el propio peso corporal es la resistencia. Ver
 *     https://pubmed.ncbi.nlm.nih.gov/19387371/
 *   - Sentadilla: NO se aplica un porcentaje fijo al peso corporal. Las fuerzas
 *     articulares dependen de la variante, la técnica y la carga externa.
 *     https://pubmed.ncbi.nlm.nih.gov/32569122/
 */

export type LoadProvenance = 'measured' | 'estimated' | 'unavailable'

export interface BodyweightCoefficient {
  /** Fracción del peso corporal que actúa como resistencia externa. */
  factor: number
  /** Fuente verificable del coeficiente. */
  source: string
  /** Qué NO cubre el coeficiente (variantes excluidas, supuestos). */
  limitation: string
}

export interface EquivalentLoad {
  /** Carga externa real registrada en la serie, o `null` si no se registró. */
  externalKg: number | null
  /** Peso corporal usado y de dónde salió. `null` si no hay medición fiable. */
  bodyweightKg: number | null
  /** Procedencia del peso corporal: 'session' | 'dated' | null. */
  bodyweightSource: 'session' | 'dated' | null
  /** Carga equivalente estimada en kg, o `null` si no hay modelo válido. */
  equivalentKg: number | null
  /** Procedencia de la carga equivalente. */
  provenance: LoadProvenance
  /** Coeficiente aplicado, si lo hubo. */
  coefficient: number | null
  /** Fuente del coeficiente, si lo hubo. */
  source: string | null
}

/** Fuente común a los coeficientes de flexiones. */
const PUSHUP_SOURCE =
  'Suprak, Dawes & Stephenson (2010). PubMed 20179649. Masa corporal soportada por las ' +
  'extremidades superiores en posición estática; promedio de las dos posiciones.'

/**
 * PERFILES DE ESTIMACIÓN.
 *
 * `flexiones`: tradicional = promedio(69.16 %, 75.04 %) = 72.10 %.
 *              rodillas apoyadas = promedio(53.56 %, 61.80 %) = 57.68 %.
 *              Son los promedios que permite usar el estudio cuando el registro
 *              NO informa la posición de cada repetición.
 *
 * NO incluyen flexiones inclinadas, declinadas, en paralelas tipo diamante ni
 * ninguna otra variante: para esas, `equivalentKg` es `null`.
 */
export const BODYWEIGHT_COEFFICIENTS: Record<string, BodyweightCoefficient> = {
  'flexiones-tradicionales': {
    factor: 0.721,
    source: PUSHUP_SOURCE,
    limitation:
      'Válido solo para flexiones con pies apoyados. Requiere registrar el peso corporal. ' +
      'Mide carga soportada por las manos en posición estática, no fuerza muscular.',
  },
  'flexiones-rodillas-apoyadas': {
    factor: 0.5768,
    source: PUSHUP_SOURCE,
    limitation:
      'Válido solo para flexiones modificado con rodillas apoyadas. Mide carga soportada ' +
      'por las manos en posición estática, no fuerza muscular.',
  },
}

/**
 * Identifica el perfil de flexiones aplicable.
 * `apoyadas` distingue la variante con rodillas apoyadas.
 * No reconoce inclinadas, declinadas ni paralelas: devuelven `null`.
 */
export function pushupProfileKey(opts: { apoyadas?: boolean; inclinada?: boolean }): string | null {
  if (opts.inclinada) { return null }      // sin coeficiente que lo cubra
  return opts.apoyadas ? 'flexiones-rodillas-apoyadas' : 'flexiones-tradicionales'
}

/** Variantes de dominadas con asistencia mecánica conocida. */
export type PullupVariant = 'libre' | 'asistida' | 'negativas'

export interface PullupInput {
  bodyweightKg: number | null
  /** Peso adicional externo (cinturón, lastre). `null` si no se registró. */
  addedKg?: number | null
  /** Asistencia mecánica conocida (bandas, polea). `null` si se desconoce. */
  assistanceKg?: number | null
  variant?: PullupVariant
}

/**
 * Dominadas: la resistencia ES el peso corporal (elevar el propio cuerpo).
 *   equivalente = peso corporal + peso adicional − asistencia conocida
 *
 * Si la asistencia o el peso adicional no están identificados, NO se inventa:
 * se conserva la actividad y `equivalentKg` queda `null`.
 * Sólo la variante `libre` y `negativas` usan la fórmula; `asistida` exige el
 * valor de asistencia para poder estimar.
 */
export function pullupEquivalent(input: PullupInput): EquivalentLoad {
  const variant = input.variant ?? 'libre'
  const base: EquivalentLoad = {
    externalKg: null,
    bodyweightKg: input.bodyweightKg,
    bodyweightSource: input.bodyweightKg !== null && input.bodyweightKg !== undefined ? 'session' : null,
    equivalentKg: null,
    provenance: 'unavailable',
    coefficient: null,
    source: null,
  }

  if ((input.bodyweightKg === null || input.bodyweightKg === undefined) || !(input.bodyweightKg > 0)) {
    // Sin peso corporal medido no hay base: se conserva la actividad, no el kg.
    return { ...base, provenance: 'unavailable' }
  }
  // Un peso adicional desconocido invalida la suma: marcar, no suponer.
  if (input.addedKg === null || input.addedKg === undefined) { return { ...base, provenance: 'unavailable' } }

  let equivalent = input.bodyweightKg + input.addedKg
  if (variant === 'asistida') {
    if (input.assistanceKg === null || input.assistanceKg === undefined) { return { ...base, provenance: 'unavailable' } }
    equivalent -= input.assistanceKg
  }

  return {
    ...base,
    equivalentKg: Math.round(Math.max(0, equivalent) * 10) / 10,
    provenance: 'estimated',
    coefficient: 1,
    source:
      'Peso corporal de la sesión + peso adicional − asistencia conocida. ' +
      'Aproximación de carga relativa al peso corporal (PubMed 19387371). No es una ' +
      'medición de la fuerza aplicada por cada músculo.',
  }
}

/**
 * Sentadilla y cualquier otra variante sin modelo específico:
 * se conservan series y repeticiones, `equivalentKg` = null.
 *
 * No se aplica el 100 % del peso corporal: las fuerzas articulares dependen de
 * la variante, la técnica y la carga externa (PubMed 32569122).
 */
export function bodyweightWithoutModel(
  bodyweightKg: number | null,
  reason: string,
): EquivalentLoad {
  return {
    externalKg: null,
    bodyweightKg,
    bodyweightSource: bodyweightKg !== null && bodyweightKg !== undefined ? 'session' : null,
    equivalentKg: null,
    provenance: 'unavailable',
    coefficient: null,
    source: reason,
  }
}

/** Flexiones: aplica el coeficiente del estudio a la variante correspondiente. */
export function pushupEquivalent(input: {
  bodyweightKg: number | null
  apoyadas?: boolean
  inclinada?: boolean
}): EquivalentLoad {
  const key = pushupProfileKey(input)
  const coeff = key ? BODYWEIGHT_COEFFICIENTS[key] : null
  const base: EquivalentLoad = {
    externalKg: null,
    bodyweightKg: input.bodyweightKg,
    bodyweightSource: input.bodyweightKg !== null && input.bodyweightKg !== undefined ? 'session' : null,
    equivalentKg: null,
    provenance: 'unavailable',
    coefficient: null,
    source: null,
  }
  if (!coeff || (input.bodyweightKg === null || input.bodyweightKg === undefined) || !(input.bodyweightKg > 0)) {
    return {
      ...base,
      source: coeff ? null : 'Sin coeficiente que cubra esta variante de flexión: se conservan las series y repeticiones sin carga equivalente.',
    }
  }
  return {
    ...base,
    equivalentKg: Math.round(input.bodyweightKg * coeff.factor * 10) / 10,
    provenance: 'estimated',
    coefficient: coeff.factor,
    source: coeff.source,
  }
}

/**
 * Peso corporal para una fecha.
 *
 * `byDate` es el historial yaindexado por `YYYY-MM-DD` (procedencia 'dated').
 * NUNCA se cae silenciosamente al peso actual para reconstruir un
 * entrenamiento antiguo: si no hay medición de esa fecha, devuelve `null`.
 */
export function bodyweightForDate(
  date: string,
  byDate: Map<string, number>,
): { kg: number | null; source: 'dated' | null } {
  const exact = byDate.get(date)
  if (exact !== null && exact !== undefined && exact > 0) { return { kg: exact, source: 'dated' } }
  return { kg: null, source: null }
}