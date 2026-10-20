/**
 * ATRIBUCIÓN MUSCULAR DE ACTIVIDADES DEPORTIVAS
 *
 * Separa la energía (kcal) de la exposición muscular: una commotion no
 * determina cuántos kilogramos soportó un músculo, así que NUNCA se convierte
 * a "volumen de fuerza".
 *
 * El aporte deportivo al mapa es un ÍNDICE DE EXPOSICIÓN comparativo, con su
 * propia unidad (minutos-equivalentes), no kilogramos.
 *
 * Precisión de cada atribución:
 *   - 'musculo' : hay fundamento para una región anatómica concreta.
 *   - 'grupo'   : se conoce la región implicada, pero no hay evidencia para
 *                 repartir carga entre músculos individuales.
 *   - 'ninguna' : no se puede determinar con fiabilidad.
 *
 * Los identificadores de región son los del catálogo de músculos y la
 * geometría del atlas (components/progress/muscleGeometry.ts). No se inventan
 * regiones: si un identificador no existe allí, no se usa.
 *
 * Fuentes biomecánicas:
 *   - Padel    https://pubmed.ncbi.nlm.nih.gov/38578364/
 *   - Carrera  https://pubmed.ncbi.nlm.nih.gov/22341011/
 *   - Ciclismo  https://pubmed.ncbi.nlm.nih.gov/27448605/
 *   - Natacion https://pubmed.ncbi.nlm.nih.gov/25556010/
 *   - MET      https://pacompendium.com/adult-compendium/
 *
 * El id de actividad es el de `data/activityCatalog.ts` (catálogo existente).
 */

export type AttributionPrecision = 'musculo' | 'grupo' | 'ninguna'

export interface SportsMuscleAttribution {
  /** Regiones del atlas que participan, cada una con su precisión. */
  regions: { regionId: string; precision: AttributionPrecision }[]
  /** Por qué esta atribución tiene ese límite. */
  limitation: string
  /**
   * Fracción de la sesión considerada trabajo resistido/cíclico sobre el tren
   * implicado (0..1). Es un factor de EXPOSICIÓN, no una carga en kg.
   */
  resistedFactor: number
}

const M = (regionId: string): { regionId: string; precision: AttributionPrecision } =>
  ({ regionId, precision: 'musculo' })
const G = (regionId: string): { regionId: string; precision: AttributionPrecision } =>
  ({ regionId, precision: 'grupo' })

export const SPORTS_MUSCLE_MAP: Record<string, SportsMuscleAttribution> = {
  // ── Carrera y caminar ────────────────────────────────────────────────────
  correr: {
    regions: [M('quadriceps'), M('hamstrings'), M('gastrocnemius'), G('gluteus-maximus')],
    limitation:
      'La distribución por fascículo depende de la velocidad y la pendiente; no se reparte carga individual.',
    resistedFactor: 1,
  },
  trotar: {
    regions: [M('quadriceps'), M('hamstrings'), G('gluteus-maximus')],
    limitation: 'Trote ligero: menor componente resistido que la carrera.',
    resistedFactor: 0.8,
  },
  caminar: {
    regions: [G('gastrocnemius'), G('quadriceps')],
    limitation: 'Caminar apenas genera carga resistida; la participación es de apoyo.',
    resistedFactor: 0.35,
  },
  caminar_rampa: {
    regions: [M('quadriceps'), M('gastrocnemius'), G('gluteus-maximus')],
    limitation: 'La pendiente aumenta la carga en cuadriceps y gemelos.',
    resistedFactor: 0.6,
  },

  // ── Ciclismo y remo ──────────────────────────────────────────────────────
  bicicleta_exterior: {
    regions: [M('quadriceps'), G('hamstrings'), G('gluteus-medius'), G('gastrocnemius')],
    limitation: 'El reparto depende de la cadencia y del estilo de pedaleo.',
    resistedFactor: 1,
  },
  bicicleta_fija: {
    regions: [M('quadriceps'), G('hamstrings'), G('gluteus-medius')],
    limitation: 'Mismo reparto que el ciclismo exterior.',
    resistedFactor: 0.95,
  },
  elíptica: {
    regions: [M('quadriceps'), G('hamstrings'), G('gastrocnemius')],
    limitation: 'Patrón cerrado con menor carga excentrica que el pedal.',
    resistedFactor: 0.85,
  },
  remo: {
    regions: [M('latissimus-dorsi'), M('trapezius'), G('hamstrings'), G('quadriceps')],
    limitation: 'El tiron es concentrico; la carga excentrica es menor que en fuerza.',
    resistedFactor: 0.9,
  },
  escaladora: {
    regions: [M('quadriceps'), M('gastrocnemius'), G('gluteus-maximus')],
    limitation: 'Predominio claro del tren inferior.',
    resistedFactor: 0.8,
  },

  // ── Deportes de conjunto ─────────────────────────────────────────────────
  padel: {
    regions: [
      M('quadriceps'), M('hamstrings'), G('gastrocnemius'), G('adductors'),
      M('latissimus-dorsi'), M('pectoralis-major'), G('obliquus-externus'),
      G('anterior-deltoid'), G('posterior-deltoid'), G('infraspinatus'),
    ],
    limitation:
      'Combina arranques, frenadas y saltos. El reparto por musculo individual ' +
      'depende del nivel de juego y no esta cuantificado en la literatura citada.',
    resistedFactor: 1,
  },
  futbol: {
    regions: [
      M('quadriceps'), M('hamstrings'), G('adductors'), G('gastrocnemius'),
      G('gluteus-maximus'), M('latissimus-dorsi'), M('pectoralis-major'),
      G('anterior-deltoid'), G('obliquus-externus'),
    ],
    limitation: 'Alta demanda de tren inferior por impactos y cambios de direccion.',
    resistedFactor: 1,
  },
  tenis: {
    regions: [
      G('anterior-deltoid'), G('posterior-deltoid'), G('infraspinatus'),
      M('latissimus-dorsi'), M('trapezius'), G('obliquus-externus'),
      G('quadriceps'), G('hamstrings'),
    ],
    limitation: 'Predominio de tren superior con estabilizacion del core.',
    resistedFactor: 0.9,
  },
  basquet: {
    regions: [
      M('quadriceps'), G('hamstrings'), G('gastrocnemius'),
      M('latissimus-dorsi'), M('pectoralis-major'), G('anterior-deltoid'),
      G('obliquus-externus'),
    ],
    limitation: 'Saltos y aceleracion; sin reparto por fasciculo.',
    resistedFactor: 1,
  },
  voleibol: {
    regions: [
      M('quadriceps'), G('hamstrings'), G('gastrocnemius'),
      M('pectoralis-major'), M('triceps-brachii'), G('obliquus-externus'),
    ],
    limitation: 'Predominio de salto (tren inferior) y brazos en el remate.',
    resistedFactor: 0.8,
  },
  natacion: {
    regions: [
      G('latissimus-dorsi'), G('trapezius'), G('posterior-deltoid'),
      G('infraspinatus'), G('hamstrings'), G('gastrocnemius'), G('obliquus-externus'),
    ],
    limitation:
      'La distribucion depende del estilo (crawl, braza, espalda, mariposa). ' +
      'Sin el estilo informado solo se puede afirmar participacion de grupo: ' +
      'asignar un musculo concreto seria inventar.',
    resistedFactor: 1,
  },
  handball: {
    regions: [
      G('anterior-deltoid'), G('infraspinatus'), M('latissimus-dorsi'),
      M('trapezius'), G('quadriceps'), G('hamstrings'), G('obliquus-externus'),
    ],
    limitation: 'Trabajo de tren superior con desplazamientos y contactos.',
    resistedFactor: 0.9,
  },
  hockey: {
    regions: [
      M('quadriceps'), G('hamstrings'), G('adductors'), G('gluteus-medius'),
      G('obliquus-externus'),
    ],
    limitation: 'Desplazamientos y frenadas sobre hielo.',
    resistedFactor: 0.9,
  },
  rugby: {
    regions: [
      M('quadriceps'), M('hamstrings'), G('adductors'), G('gluteus-maximus'),
      M('trapezius'), M('latissimus-dorsi'), G('anterior-deltoid'),
    ],
    limitation: 'Contactos y empuje; alta demanda de tren posterior.',
    resistedFactor: 1,
  },
  badminton: {
    regions: [G('anterior-deltoid'), G('infraspinatus'), G('obliquus-externus'), G('hamstrings')],
    limitation: 'Desplazamientos cortos con predominio de tren superior.',
    resistedFactor: 0.7,
  },
  squash: {
    regions: [
      G('quadriceps'), G('hamstrings'), G('gastrocnemius'),
      G('anterior-deltoid'), G('obliquus-externus'),
    ],
    limitation: 'Alta intensidad con movimientos laterales constantes.',
    resistedFactor: 0.85,
  },

  // ── Fuerza con peso corporal (entradas del catalogo de actividades) ──────
  sentadilla_cuerpo: {
    regions: [M('quadriceps'), G('gluteus-maximus'), G('hamstrings')],
    limitation:
      'Sentadilla libre: la carga equivalente en kg NO se estima (ver bodyweightLoad). ' +
      'Solo se registra exposicion.',
    resistedFactor: 0.8,
  },
  fondos_cuerpo: {
    regions: [M('triceps-brachii'), G('pectoralis-major'), G('anterior-deltoid')],
    limitation: 'Fondos en paralelas: predominio de triceps y tren superior.',
    resistedFactor: 0.8,
  },
  plancha: {
    regions: [G('obliquus-externus'), G('rectus-abdominis'), M('spinal-erectors')],
    limitation: 'Isometrico: genera exposicion, no volumen de fuerza.',
    resistedFactor: 0.6,
  },
  otros: {
    regions: [],
    limitation: 'Actividad sin catalogo muscular: se conserva la sesion, sin atribucion.',
    resistedFactor: 0,
  },
}

/** Atribucion de una actividad, o `null` si el catalogo no la cubre. */
export function sportsAttribution(activityId: string): SportsMuscleAttribution | null {
  return SPORTS_MUSCLE_MAP[activityId] ?? null
}

/**
 * Gasto energetico estimado.
 *
 *   kcal = MET x 3,5 x peso (kg) / 200 x minutos
 *
 * Es energia, NO carga muscular: nunca se usa para generar volumen en kg.
 * Si falta peso o minutos devuelve `null` en vez de 0.
 */
export function estimateEnergyKcal(input: {
  met: number
  minutes: number
  bodyweightKg: number | null
}): { kcal: number | null; source: 'estimated'; note: string } {
  const { met, minutes, bodyweightKg } = input
  if (!(met > 0) || !(minutes > 0) || bodyweightKg === null || bodyweightKg === undefined || !(bodyweightKg > 0)) {
    return {
      kcal: null,
      source: 'estimated',
      note: 'Faltan MET, minutos o peso corporal: no se estima energia.',
    }
  }
  const kcal = (met * 3.5 * bodyweightKg) / 200 * minutes
  return {
    kcal: Math.round(kcal),
    source: 'estimated',
    note: 'MET x 3,5 x peso (kg) / 200 x minutos (Compendium of Physical Activities 2024).',
  }
}

/**
 * Exposicion deportiva de una sesion, en minutos-equivalentes.
 * No es/kg ni series: es una magnitud propia del indice deportivo.
 */
export function sportsExposureMinutes(input: {
  activityId: string
  durationMinutes: number | null
}): {
  minutes: number
  attributed: boolean
  precision: AttributionPrecision | null
  reason: string | null
} {
  const attr = sportsAttribution(input.activityId)
  if (input.durationMinutes === null || input.durationMinutes === undefined || !(input.durationMinutes > 0)) {
    return { minutes: 0, attributed: false, precision: null, reason: 'La sesion no tiene duracion registrada.' }
  }
  if (!attr || attr.regions.length === 0) {
    return {
      minutes: Math.round(input.durationMinutes),
      attributed: false,
      precision: null,
      reason: attr?.limitation ?? 'Sin catalogo muscular para esta actividad.',
    }
  }
  return {
    minutes: Math.round(input.durationMinutes * attr.resistedFactor * 10) / 10,
    attributed: true,
    precision: attr.regions.some((r) => r.precision === 'musculo') ? 'musculo' : 'grupo',
    reason: attr.limitation,
  }
}