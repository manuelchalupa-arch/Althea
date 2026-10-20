/**
 * Activity Catalog - Catálogo de actividades deportivas y de fitness
 *
 * Cada entrada tiene ID estable, nombre, categoría, modalidad, intensidad
 * y variantes MET (Metabolic Equivalent of Task) del Compendium of Physical
 * Activities 2024 (Ainsworth et al.).
 *
 * Las variantes permiten seleccionar la intensidad específica de la sesión
 * (caminar lento vs. rápido, trotar vs. correr, etc.) con su código de
 * fuente del Compendium. Cuando el Compendium no tiene una entrada exacta,
 * se usa un proxy documentado con `estimated: true`.
 *
 * Reglas:
 * - Nunca se asignan MET arbitrarios: cada variante cita su sourceCode.
 * - `estimated: true` significa "proxy razonable, no medición directa".
 * - El campo `met` en Activity es el valor por defecto (la variante más común).
 */

export type ActivityLevel = 'ligera' | 'moderada' | 'vigorosa'

export type ActivityModalidad =
  | 'manual'
  | 'gps'
  | 'gimnasio'
  | 'exterior'
  | 'interior'

export type ActivityCategory =
  | 'cardio'
  | 'fuerza'
  | 'deporte'
  | 'mindfulness'
  | 'otros'

/** Variante MET documentada del Compendium 2024. */
export interface ActivityMetVariant {
  /** ID único de la variante dentro de la actividad (ej: 'lento', 'moderado'). */
  id: string
  /** Etiqueta legible para el usuario. */
  label: string
  /** Valor MET del Compendium 2024. */
  met: number
  /** Código de 5 dígitos del Compendium (ej: '17152'). */
  sourceCode: string
  /** true si es un proxy/estimación, no una entrada directa del Compendium. */
  estimated: boolean
  /** Nota opcional sobre la variante. */
  note?: string
}

export interface Activity {
  id: string
  nombre: string
  categoria: ActivityCategory
  modalidad: ActivityModalidad
  intensidad: ActivityLevel
  /** MET por defecto (variante más típica). */
  met: number
  metNote?: string
  metSource?: string
  /** Variantes MET documentadas para esta actividad. */
  variants: ActivityMetVariant[]
}

/** Busca una variante por ID dentro de una actividad. */
export function findVariant(activity: Activity, variantId: string): ActivityMetVariant | undefined {
  return activity.variants.find(v => v.id === variantId)
}

/** Devuelve la variante por defecto (la más cercana al MET base). */
export function defaultVariant(activity: Activity): ActivityMetVariant {
  if (activity.variants.length === 0) {
    return {
      id: 'default',
      label: 'General',
      met: activity.met,
      sourceCode: activity.metSource ?? '00000',
      estimated: false,
    }
  }
  let best = activity.variants[0]
  let bestDiff = Math.abs(best.met - activity.met)
  for (const v of activity.variants) {
    const diff = Math.abs(v.met - activity.met)
    if (diff < bestDiff) {
      best = v
      bestDiff = diff
    }
  }
  return best
}

/** Catálogo completo de actividades con variantes MET del Compendium 2024. */
export const activityCatalog: Activity[] = [
  /** Caminata y carrera */
  {
    id: 'caminar', nombre: 'Caminar', categoria: 'cardio', modalidad: 'exterior', intensidad: 'ligera',
    met: 3.3, metNote: 'Caminata moderada (2.5 mph)', metSource: '17190',
    variants: [
      { id: 'lento', label: 'Lento (2.0 mph)', met: 2.5, sourceCode: '17152', estimated: false },
      { id: 'moderado', label: 'Moderado (2.5 mph)', met: 3.3, sourceCode: '17190', estimated: false },
      { id: 'rapido', label: 'Rápido (3.0 mph)', met: 3.8, sourceCode: '17200', estimated: false },
      { id: 'muy_rapido', label: 'Muy rápido (3.5 mph)', met: 4.5, sourceCode: '17210', estimated: false },
    ],
  },
  {
    id: 'trotar', nombre: 'Trotar', categoria: 'cardio', modalidad: 'exterior', intensidad: 'moderada',
    met: 7.5, metNote: 'Trote general', metSource: '12020',
    variants: [
      { id: 'suave', label: 'Trote suave', met: 6.0, sourceCode: '12010', estimated: false, note: 'Jog/walk combination' },
      { id: 'general', label: 'Trote general', met: 7.5, sourceCode: '12020', estimated: false },
    ],
  },
  {
    id: 'correr', nombre: 'Correr', categoria: 'cardio', modalidad: 'exterior', intensidad: 'vigorosa',
    met: 9.8, metNote: 'Carrera 6 mph (10 min/km)', metSource: '12060',
    variants: [
      { id: '5mph', label: '5 mph (12 min/km)', met: 8.3, sourceCode: '12050', estimated: false },
      { id: '6mph', label: '6 mph (10 min/km)', met: 9.8, sourceCode: '12060', estimated: false },
      { id: '7mph', label: '7 mph (8.5 min/km)', met: 11.5, sourceCode: '12070', estimated: false },
      { id: '8mph', label: '8 mph (7.5 min/km)', met: 13.8, sourceCode: '12080', estimated: false },
    ],
  },

  /** Bicicleta */
  {
    id: 'bicicleta_exterior', nombre: 'Bicicleta exterior', categoria: 'cardio', modalidad: 'exterior', intensidad: 'moderada',
    met: 6.8, metNote: 'Ciclismo moderado (16-19 km/h)', metSource: '01070',
    variants: [
      { id: 'tranquilo', label: 'Tranquilo (<16 km/h)', met: 4.0, sourceCode: '01060', estimated: false },
      { id: 'moderado', label: 'Moderado (16-19 km/h)', met: 6.8, sourceCode: '01070', estimated: false },
      { id: 'vigoroso', label: 'Vigoroso (>19 km/h)', met: 10.0, sourceCode: '01080', estimated: false },
    ],
  },
  {
    id: 'bicicleta_fija', nombre: 'Bicicleta fija', categoria: 'cardio', modalidad: 'gimnasio', intensidad: 'moderada',
    met: 5.5, metNote: 'Bicicleta estática 100W', metSource: '01252',
    variants: [
      { id: 'moderado', label: 'Moderado (100W)', met: 5.5, sourceCode: '01252', estimated: false },
      { id: 'spin', label: 'Clase de spin', met: 9.0, sourceCode: '01270', estimated: false },
      { id: 'vigoroso', label: 'Vigoroso (200W)', met: 11.0, sourceCode: '01254', estimated: false },
    ],
  },
  {
    id: 'cinta_correr', nombre: 'Cinta de correr', categoria: 'cardio', modalidad: 'gimnasio', intensidad: 'vigorosa',
    met: 9.8, metNote: 'Equivalente a carrera 6 mph; para estimaciones precisas usar distancia + pendiente (ACSM)',
    variants: [
      { id: 'caminata', label: 'Caminata en cinta', met: 3.3, sourceCode: '17190', estimated: true, note: 'Proxy: equivalente de caminata a igual velocidad' },
      { id: 'trote', label: 'Trote en cinta (5 mph)', met: 8.3, sourceCode: '12050', estimated: true, note: 'Proxy: equivalente de carrera a igual velocidad' },
      { id: 'carrera', label: 'Carrera en cinta (6 mph)', met: 9.8, sourceCode: '12060', estimated: true, note: 'Proxy: equivalente de carrera a igual velocidad' },
    ],
  },
  {
    id: 'eliptica', nombre: 'Elíptica', categoria: 'cardio', modalidad: 'gimnasio', intensidad: 'moderada',
    met: 5.0, metNote: 'Elíptica moderada',
    variants: [
      { id: 'ligera', label: 'Ligera', met: 4.0, sourceCode: '02047', estimated: true, note: 'Proxy: elliptical trainer light effort' },
      { id: 'moderada', label: 'Moderada', met: 5.0, sourceCode: '02048', estimated: true, note: 'Proxy: elliptical trainer moderate effort' },
      { id: 'vigorosa', label: 'Vigorosa', met: 6.5, sourceCode: '02049', estimated: true, note: 'Proxy: elliptical trainer vigorous effort' },
    ],
  },
  {
    id: 'escaladora', nombre: 'Escaladora', categoria: 'cardio', modalidad: 'gimnasio', intensidad: 'vigorosa',
    met: 8.0, metNote: 'Escaladora (StairMaster)',
    variants: [
      { id: 'moderada', label: 'Moderada', met: 7.0, sourceCode: '02050', estimated: true, note: 'Proxy: stair climbing moderate' },
      { id: 'vigorosa', label: 'Vigorosa', met: 9.0, sourceCode: '02051', estimated: true, note: 'Proxy: stair climbing vigorous' },
    ],
  },
  {
    id: 'remo', nombre: 'Remo', categoria: 'cardio', modalidad: 'gimnasio', intensidad: 'vigorosa',
    met: 7.0, metNote: 'Remo ergómetro',
    variants: [
      { id: 'moderado', label: 'Moderado', met: 5.5, sourceCode: '02100', estimated: true, note: 'Proxy: rowing machine moderate' },
      { id: 'vigoroso', label: 'Vigoroso', met: 8.5, sourceCode: '02101', estimated: true, note: 'Proxy: rowing machine vigorous' },
    ],
  },

  /** Deportes de equipo y individuales */
  {
    id: 'futbol', nombre: 'Fútbol', categoria: 'deporte', modalidad: 'exterior', intensidad: 'vigorosa',
    met: 7.0, metNote: 'Práctica de fútbol', metSource: '15375',
    variants: [
      { id: 'practica', label: 'Práctica ligera', met: 7.0, sourceCode: '15375', estimated: false },
      { id: 'partido', label: 'Partido competitivo', met: 10.0, sourceCode: '15350', estimated: false },
    ],
  },
  {
    id: 'padel', nombre: 'Pádel', categoria: 'deporte', modalidad: 'exterior', intensidad: 'vigorosa',
    met: 6.8, metNote: 'Proxy: tenis general moderado (el pádel no está en el Compendium 2024)', metSource: '15675',
    variants: [
      { id: 'general', label: 'General / moderado', met: 6.8, sourceCode: '15675', estimated: true, note: 'Proxy de tenis general moderado; el pádel no tiene entrada propia en el Compendium 2024' },
      { id: 'competitivo', label: 'Competitivo', met: 8.0, sourceCode: '15676', estimated: true, note: 'Proxy de tenis competitivo' },
    ],
  },
  {
    id: 'tenis', nombre: 'Tenis', categoria: 'deporte', modalidad: 'exterior', intensidad: 'vigorosa',
    met: 6.8, metNote: 'Tenis general moderado', metSource: '15675',
    variants: [
      { id: 'dobles', label: 'Dobles', met: 6.0, sourceCode: '15680', estimated: false },
      { id: 'general', label: 'General moderado', met: 6.8, sourceCode: '15675', estimated: false },
      { id: 'individual', label: 'Individual', met: 8.0, sourceCode: '15690', estimated: false },
    ],
  },
  {
    id: 'basquet', nombre: 'Baloncesto', categoria: 'deporte', modalidad: 'exterior', intensidad: 'vigorosa',
    met: 8.0, metNote: 'Baloncesto partido', metSource: '15040',
    variants: [
      { id: 'practica', label: 'Práctica', met: 6.0, sourceCode: '15050', estimated: false },
      { id: 'partido', label: 'Partido', met: 8.0, sourceCode: '15040', estimated: false },
    ],
  },
  {
    id: 'voleibol', nombre: 'Vóley', categoria: 'deporte', modalidad: 'exterior', intensidad: 'moderada',
    met: 6.0, metNote: 'Vóley partido', metSource: '15420',
    variants: [
      { id: 'practica', label: 'Práctica', met: 4.5, sourceCode: '15440', estimated: false },
      { id: 'partido', label: 'Partido', met: 6.0, sourceCode: '15420', estimated: false },
    ],
  },
  {
    id: 'natacion', nombre: 'Natación', categoria: 'deporte', modalidad: 'exterior', intensidad: 'vigorosa',
    met: 6.0, metNote: 'Natación crawl moderada',
    variants: [
      { id: 'moderada', label: 'Crawl moderado', met: 6.0, sourceCode: '18050', estimated: true, note: 'Proxy: swimming crawl moderate' },
      { id: 'vigorosa', label: 'Crawl vigoroso', met: 8.5, sourceCode: '18060', estimated: true, note: 'Proxy: swimming crawl vigorous' },
    ],
  },
  {
    id: 'handball', nombre: 'Handball', categoria: 'deporte', modalidad: 'exterior', intensidad: 'vigorosa',
    met: 8.0, metNote: 'Handball',
    variants: [
      { id: 'general', label: 'General', met: 8.0, sourceCode: '15400', estimated: true, note: 'Proxy: handball general' },
    ],
  },
  {
    id: 'hockey', nombre: 'Hockey', categoria: 'deporte', modalidad: 'exterior', intensidad: 'vigorosa',
    met: 7.0, metNote: 'Hockey sobre hierba',
    variants: [
      { id: 'general', label: 'General', met: 7.0, sourceCode: '15200', estimated: true, note: 'Proxy: field hockey general' },
    ],
  },
  {
    id: 'rugby', nombre: 'Rugby', categoria: 'deporte', modalidad: 'exterior', intensidad: 'vigorosa',
    met: 8.0, metNote: 'Rugby',
    variants: [
      { id: 'general', label: 'General', met: 8.0, sourceCode: '15580', estimated: true, note: 'Proxy: rugby general' },
    ],
  },
  {
    id: 'badminton', nombre: 'Bádminton', categoria: 'deporte', modalidad: 'exterior', intensidad: 'vigorosa',
    met: 5.5, metNote: 'Bádminton social', metSource: '15030',
    variants: [
      { id: 'social', label: 'Social', met: 5.5, sourceCode: '15030', estimated: false },
      { id: 'competitivo', label: 'Competitivo', met: 7.0, sourceCode: '15020', estimated: false },
    ],
  },
  {
    id: 'squash', nombre: 'Squash', categoria: 'deporte', modalidad: 'interior', intensidad: 'vigorosa',
    met: 7.3, metNote: 'Squash general', metSource: '15652',
    variants: [
      { id: 'general', label: 'General', met: 7.3, sourceCode: '15652', estimated: false },
      { id: 'competitivo', label: 'Competitivo', met: 12.0, sourceCode: '15650', estimated: false },
    ],
  },

  /** Fuerza y entrenamiento */
  {
    id: 'caminar_rampa', nombre: 'Caminar rampa', categoria: 'fuerza', modalidad: 'exterior', intensidad: 'moderada',
    met: 5.0, metNote: 'Caminar cuesta arriba',
    variants: [
      { id: 'ligera', label: 'Pendiente ligera', met: 4.0, sourceCode: '17220', estimated: true, note: 'Proxy: walking uphill light' },
      { id: 'moderada', label: 'Pendiente moderada', met: 6.0, sourceCode: '17230', estimated: true, note: 'Proxy: walking uphill moderate' },
      { id: 'vigorosa', label: 'Pendiente vigorosa', met: 8.0, sourceCode: '17240', estimated: true, note: 'Proxy: walking uphill vigorous' },
    ],
  },
  {
    id: 'sentadilla_cuerpo', nombre: 'Sentadilla cuerpo libre', categoria: 'fuerza', modalidad: 'gimnasio', intensidad: 'vigorosa',
    met: 5.0, metNote: 'Calisthenics moderate',
    variants: [
      { id: 'moderada', label: 'Moderada', met: 5.0, sourceCode: '02022', estimated: false, note: 'Calisthenics (push-ups, sit-ups, pull-ups, lunges), moderate' },
      { id: 'vigorosa', label: 'Vigorosa', met: 8.0, sourceCode: '02025', estimated: false, note: 'Calisthenics, vigorous' },
    ],
  },
  {
    id: 'fondos_cuerpo', nombre: 'Fondos cuerpo libre', categoria: 'fuerza', modalidad: 'gimnasio', intensidad: 'vigorosa',
    met: 5.0, metNote: 'Calisthenics moderate',
    variants: [
      { id: 'moderada', label: 'Moderada', met: 5.0, sourceCode: '02022', estimated: false, note: 'Calisthenics, moderate' },
      { id: 'vigorosa', label: 'Vigorosa', met: 8.0, sourceCode: '02025', estimated: false, note: 'Calisthenics, vigorous' },
    ],
  },
  {
    id: 'plancha', nombre: 'Plancha', categoria: 'fuerza', modalidad: 'gimnasio', intensidad: 'moderada',
    met: 3.5, metNote: 'Isométrico',
    variants: [
      { id: 'general', label: 'General', met: 3.5, sourceCode: '02030', estimated: true, note: 'Proxy: plank hold' },
    ],
  },

  /** Otras actividades */
  {
    id: 'otros', nombre: 'Otras actividades', categoria: 'otros', modalidad: 'exterior', intensidad: 'ligera',
    met: 3.0, metNote: 'Actividad física general',
    variants: [
      { id: 'general', label: 'General', met: 3.0, sourceCode: '02000', estimated: true, note: 'Proxy: aerobic general' },
    ],
  },
]
