/**
 * POLÍTICA DE INTENSIDAD DEL ATLAS
 *
 * ÚNICO lugar donde se decide qué banda corresponde a cada músculo. Antes los
 * umbrales vivían repartidos entre el componente SVG, los cálculos y el CSS.
 *
 * La escala pedida:
 *   - gris        ausencia de actividad registrada
 *   - verde claro actividad muy baja
 *   - verde oscuro actividad baja
 *   - amarillo    actividad por debajo del rango objetivo
 *   - naranja     actividad dentro del rango objetivo
 *   - rojo oscuro actividad por encima del objetivo
 *
 * La comparación contra el objetivo usa el PLAN de la rutina cuando existe
 * (`setsTarget`). Si no hay objetivo, se usa una referencia personal
 * (promedio de períodos anteriores comparables). Si tampoco la hay, la
 * intensidad es RELATIVA al período y se declara `sin-referencia`: el color
 * sigue mostrando actividad, pero el nivel no se interpreta frente a un
 * objetivo.
 *
 * Importante: el nivel NO depende de que exista un período anterior. Si hay
 * actividad actual, el músculo se colorea siempre; la falta de historial sólo
 * elimina la comparación, no la actividad.
 */

/** Banda de la escala. El orden ES el orden de la leyenda. */
export type AtlasLevel =
  | 'sin-actividad'
  | 'muy-baja'
  | 'baja'
  | 'bajo-objetivo'
  | 'en-objetivo'
  | 'sobre-objetivo'

export const ATLAS_LEVELS: AtlasLevel[] = [
  'sin-actividad',
  'muy-baja',
  'baja',
  'bajo-objetivo',
  'en-objetivo',
  'sobre-objetivo',
]

export const ATLAS_LEVEL_LABEL: Record<AtlasLevel, string> = {
  'sin-actividad': 'Sin actividad',
  'muy-baja': 'Muy baja',
  'baja': 'Baja',
  'bajo-objetivo': 'Bajo el objetivo',
  'en-objetivo': 'En el objetivo',
  'sobre-objetivo': 'Sobre el objetivo',
}

/** Tokens CSS de cada banda. La leyenda y el SVG leen de aquí. */
export const ATLAS_LEVEL_TOKEN: Record<AtlasLevel, string> = {
  'sin-actividad': 'var(--althea-muscle-idle)',
  'muy-baja': 'var(--althea-muscle-very-low)',
  'baja': 'var(--althea-muscle-low)',
  'bajo-objetivo': 'var(--althea-muscle-under)',
  'en-objetivo': 'var(--althea-muscle-mid)',
  'sobre-objetivo': 'var(--althea-muscle-high)',
}

export const ATLAS_LEVEL_CLASS: Record<AtlasLevel, string> = {
  'sin-actividad': 'is-idle',
  'muy-baja': 'is-active-verylow',
  'baja': 'is-active-low',
  'bajo-objetivo': 'is-active-under',
  'en-objetivo': 'is-active-mid',
  'sobre-objetivo': 'is-active-high',
}

/** Umbrales de intensidad RELATIVA (0-100) dentro del período. */
export const RELATIVE_BANDS: { until: number; level: AtlasLevel }[] = [
  { until: 15, level: 'muy-baja' },
  { until: 34, level: 'baja' },
  { until: 67, level: 'bajo-objetivo' },
  { until: 101, level: 'en-objetivo' },
]

/** Umbrales de comparación contra el objetivo, como fracción del objetivo. */
export const OBJECTIVE_BANDS: { until: number; level: AtlasLevel }[] = [
  { until: 0.25, level: 'muy-baja' },
  { until: 0.6, level: 'baja' },
  { until: 0.9, level: 'bajo-objetivo' },
  { until: 1.25, level: 'en-objetivo' },
  { until: Infinity, level: 'sobre-objetivo' },
]

export interface LevelInput {
  /** Exposicion de la region en el periodo (0 = sin actividad registrada). */
  exposure: number
  /**
   * Objetivo de series para la region en el periodo, si existe.
   * `null` = la rutina no define objetivo para este musculo.
   */
  setsTarget: number | null
  /** Referencia personal (promedio historico). `null` si no hay suficiente. */
  personalReference: number | null
  /** Maximo de exposicion del periodo, base de la banda relativa. */
  periodMax: number
}

export interface LevelResult {
  level: AtlasLevel
  /** Fraccion sobre el objetivo, si hubo objetivo valido. */
  ratioToTarget: number | null
  /** Fraccion sobre la referencia personal, si hubo referencia valida. */
  ratioToReference: number | null
  /** Fuente de la comparacion, para explicarla en la interfaz y al coach. */
  basis: 'objetivo' | 'referencia-personal' | 'relativa' | 'ninguna'
}

/**
 * Decide la banda. Prioridad: objetivo de la rutina, referencia personal, y
 * como ultimo recurso la intensidad relativa al periodo.
 *
 * Nunca devuelve "exceso fisiologico": solo "por encima del objetivo".
 *
 * Sin ninguna referencia interpretable, la banda sale de la intensidad
 * RELATIVA y `basis` queda en `'relativa'`: el color muestra actividad, pero
 * la interfaz y el coach saben que no puede juzgarse frente a un objetivo.
 */
export function resolveAtlasLevel(input: LevelInput): LevelResult {
  const { exposure, setsTarget, personalReference, periodMax } = input

  if (!(exposure > 0)) {
    return { level: 'sin-actividad', ratioToTarget: null, ratioToReference: null, basis: 'ninguna' }
  }

  if (setsTarget != null && setsTarget > 0) {
    const ratio = exposure / setsTarget
    const level = OBJECTIVE_BANDS.find((b) => ratio < b.until)?.level ?? 'sobre-objetivo'
    return { level, ratioToTarget: null, ratioToReference: null, basis: 'objetivo' }
  }

  if (personalReference != null && personalReference > 0) {
    const ratio = exposure / personalReference
    const level = OBJECTIVE_BANDS.find((b) => ratio < b.until)?.level ?? 'sobre-objetivo'
    return { level, ratioToTarget: null, ratioToReference: ratio, basis: 'referencia-personal' }
  }

  const rel = relativeIntensity(exposure, periodMax)
  const level = RELATIVE_BANDS.find((b) => rel < b.until)?.level ?? 'en-objetivo'
  return { level, ratioToTarget: null, ratioToReference: null, basis: 'relativa' }
}

/** Intensidad 0-100 dentro del período (relativa al máximo de la consulta). */
export function relativeIntensity(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) { return 0 }
  return Math.max(1, Math.min(100, Math.round((value / max) * 100)))
}
