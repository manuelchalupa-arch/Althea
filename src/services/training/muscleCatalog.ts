// CATÁLOGO DE MÚSCULOS — datos desacoplados del gráfico SVG.
//
// Cada entrada describe un músculo real de la anatomía: id estable, nombre en
// español, nombre técnico, grupo (los mismos 5 grupos que usa la medición de
// volumen), rol de activación, sinergistas y ejercicios que lo trabajan.
// El mapa (MuscleMap.tsx) SOLO dibuja: nunca define estos datos.

import type { MuscleGroup } from '@/services/training/muscleGroups'

export type MuscleView = 'front' | 'back'
export type MuscleActivation = 'primary' | 'secondary' | 'stabilizer'

export interface MuscleEntity {
  /** Identificador anatómico estable, usado como data-muscle-id en el SVG. */
  id: string
  nameEs: string
  nameAnatomy: string
  group: MuscleGroup
  view: MuscleView
  activation: MuscleActivation
  /** Ids de músculos con los que trabaja en conjunto. */
  synergists: string[]
  /** Ejercicios que lo activan de forma principal (biblioteca de la app). */
  exercises: string[]
}

export const MUSCLE_CATALOG: MuscleEntity[] = [
  // ── Frontal ─────────────────────────────────────────────────────────────
  {
    id: 'anterior-deltoid',
    nameEs: 'Deltoides anterior',
    nameAnatomy: 'Deltoideus, pars anterior',
    group: 'HOMBROS',
    view: 'front',
    activation: 'primary',
    synergists: ['pectoralis-major', 'triceps-brachii'],
    exercises: ['Press militar', 'Elevaciones frontales', 'Press de banca'],
  },
  {
    id: 'pectoralis-major',
    nameEs: 'Pectoral mayor',
    nameAnatomy: 'Pectoralis major',
    group: 'PECHO',
    view: 'front',
    activation: 'primary',
    synergists: ['anterior-deltoid', 'triceps-brachii'],
    exercises: ['Press de banca', 'Aperturas', 'Flexiones'],
  },
  {
    id: 'biceps-brachii',
    nameEs: 'Bíceps braquial',
    nameAnatomy: 'Biceps brachii',
    group: 'BRAZOS',
    view: 'front',
    activation: 'primary',
    synergists: ['forearm-flexors', 'anterior-deltoid'],
    exercises: ['Curl de bíceps', 'Curl martillo', 'Dominadas supinas'],
  },
  {
    id: 'forearm-flexors',
    nameEs: 'Flexores del antebrazo',
    nameAnatomy: 'Musculi flexores carpi',
    group: 'BRAZOS',
    view: 'front',
    activation: 'stabilizer',
    synergists: ['biceps-brachii'],
    exercises: ['Curl de muñeca', 'Agarre con mancuerna', 'Remo con barra'],
  },
  {
    id: 'rectus-abdominis',
    nameEs: 'Recto abdominal',
    nameAnatomy: 'Rectus abdominis',
    group: 'PECHO',
    view: 'front',
    activation: 'secondary',
    synergists: ['obliquus-externus'],
    exercises: ['Crunch', 'Plancha', 'Elevación de piernas'],
  },
  {
    id: 'obliquus-externus',
    nameEs: 'Oblicuo externo',
    nameAnatomy: 'Obliquus externus abdominis',
    group: 'PECHO',
    view: 'front',
    activation: 'stabilizer',
    synergists: ['rectus-abdominis'],
    exercises: ['Plancha lateral', 'Rotaciones con cable', 'Russian twist'],
  },
  {
    id: 'quadriceps',
    nameEs: 'Cuádriceps femoral',
    nameAnatomy: 'Quadriceps femoris',
    group: 'PIERNAS',
    view: 'front',
    activation: 'primary',
    synergists: ['gluteus-maximus', 'tibialis-anterior'],
    exercises: ['Sentadilla', 'Prensa de piernas', 'Zancadas'],
  },
  {
    id: 'tibialis-anterior',
    nameEs: 'Tibial anterior',
    nameAnatomy: 'Tibialis anterior',
    group: 'PIERNAS',
    view: 'front',
    activation: 'secondary',
    synergists: ['quadriceps'],
    exercises: ['Dorsiflexión con banda', 'Skipping', 'Caminata con rodillas altas'],
  },

  // ── Posterior ───────────────────────────────────────────────────────────
  {
    id: 'trapezius',
    nameEs: 'Trapecio',
    nameAnatomy: 'Trapezius',
    group: 'ESPALDA',
    view: 'back',
    activation: 'primary',
    synergists: ['latissimus-dorsi', 'posterior-deltoid'],
    exercises: ['Encogimientos', 'Remo con barra', 'Peso muerto'],
  },
  {
    id: 'latissimus-dorsi',
    nameEs: 'Dorsal ancho',
    nameAnatomy: 'Latissimus dorsi',
    group: 'ESPALDA',
    view: 'back',
    activation: 'primary',
    synergists: ['trapezius', 'biceps-brachii'],
    exercises: ['Dominadas', 'Jalón al pecho', 'Remo con barra'],
  },
  {
    id: 'spinal-erectors',
    nameEs: 'Erectores de la columna',
    nameAnatomy: 'Erector spinae',
    group: 'ESPALDA',
    view: 'back',
    activation: 'stabilizer',
    synergists: ['latissimus-dorsi', 'gluteus-maximus'],
    exercises: ['Peso muerto', 'Buenos días', 'Hiperextensiones'],
  },
  {
    id: 'posterior-deltoid',
    nameEs: 'Deltoides posterior',
    nameAnatomy: 'Deltoideus, pars posterior',
    group: 'HOMBROS',
    view: 'back',
    activation: 'secondary',
    synergists: ['trapezius', 'latissimus-dorsi'],
    exercises: ['Elevaciones posteriores', 'Face pull', 'Remo alto'],
  },
  {
    id: 'triceps-brachii',
    nameEs: 'Tríceps braquial',
    nameAnatomy: 'Triceps brachii',
    group: 'BRAZOS',
    view: 'back',
    activation: 'primary',
    synergists: ['posterior-deltoid', 'anterior-deltoid'],
    exercises: ['Fondos', 'Extensión de tríceps', 'Press cerrado'],
  },
  {
    id: 'forearm-extensors',
    nameEs: 'Extensores del antebrazo',
    nameAnatomy: 'Musculi extensores carpi',
    group: 'BRAZOS',
    view: 'back',
    activation: 'stabilizer',
    synergists: ['triceps-brachii'],
    exercises: ['Remo con agarre largo', 'Farmer walk', 'Curl de muñeca invertido'],
  },
  {
    id: 'gluteus-maximus',
    nameEs: 'Glúteo mayor',
    nameAnatomy: 'Gluteus maximus',
    group: 'PIERNAS',
    view: 'back',
    activation: 'primary',
    synergists: ['hamstrings', 'quadriceps'],
    exercises: ['Hip thrust', 'Peso muerto rumano', 'Sentadilla'],
  },
  {
    id: 'hamstrings',
    nameEs: 'Isquiotibiales',
    nameAnatomy: 'Biceps femoris y semimembranoso',
    group: 'PIERNAS',
    view: 'back',
    activation: 'primary',
    synergists: ['gluteus-maximus', 'gastrocnemius'],
    exercises: ['Peso muerto rumano', 'Curl femoral', 'Nórdicos'],
  },
  {
    id: 'gastrocnemius',
    nameEs: 'Sóleo y gemelo',
    nameAnatomy: 'Gastrocnemius y soleus',
    group: 'PIERNAS',
    view: 'back',
    activation: 'secondary',
    synergists: ['hamstrings'],
    exercises: ['Elevaciones de talón', 'Prensa de gemelos', 'Saltos'],
  },
]

const byId = new Map(MUSCLE_CATALOG.map(m => [m.id, m]))

export function getMuscle(id: string): MuscleEntity | undefined {
  return byId.get(id)
}

export function musclesForView(view: MuscleView): MuscleEntity[] {
  return MUSCLE_CATALOG.filter(m => m.view === view)
}

export const ACTIVATION_LABEL: Record<MuscleActivation, string> = {
  primary: 'Principal',
  secondary: 'Secundario',
  stabilizer: 'Estabilizador',
}

/** Nombres en español de los sinergistas de un músculo. */
export function synergyNames(muscle: MuscleEntity): string[] {
  return muscle.synergists.map(id => byId.get(id)?.nameEs).filter((n): n is string => !!n)
}
