// Síntesis de la Biblioteca: solo los ejercicios TRADICIONALES por grupo muscular.
// Fuente de verdad: lista curada por el usuario (2026-10). El catálogo externo
// ExerciseGym solo aporta GIF/instrucciones vía gymId; nunca se listan sus
// variantes. Los ids del catálogo se conservan cuando hay match para que
// favoritos y ejercicios excluidos ya guardados sigan funcionando.
import type { Exercise } from '@/services/exerciseGym'

export type TraditionalGroupId = 'piernas' | 'pecho' | 'espalda' | 'core' | 'hombros-y-brazos'

export const TRADITIONAL_GROUPS: { id: TraditionalGroupId; label: string; bodyPart: Exercise['bodyPart'] }[] = [
  { id: 'piernas', label: 'Piernas', bodyPart: 'legs' },
  { id: 'pecho', label: 'Pecho', bodyPart: 'chest' },
  { id: 'espalda', label: 'Espalda', bodyPart: 'back' },
  { id: 'core', label: 'Core', bodyPart: 'core' },
  { id: 'hombros-y-brazos', label: 'Hombros y brazos', bodyPart: 'arms' },
]

export type TraditionalSeed = {
  /** Id propio estable del catálogo curado (fallback cuando gymId no matchea). */
  id: string
  group: TraditionalGroupId
  name: string
  focus: string
  equipment: string
  /** Clave muscular estilo ExerciseGym (para ejercicios sintetizados y el form de custom). */
  muscle: string
  /** Id exacto en ExerciseGymGifsDB (verificado contra api/es/exercises.json). */
  gymId?: string
}

export const TRADITIONAL_SEEDS: TraditionalSeed[] = [
  // ─── Piernas ───
  { id: 'trad/back-squat', group: 'piernas', name: 'Sentadilla con barra', focus: 'Cuádriceps · ejercicio global', equipment: 'barra', muscle: 'quads', gymId: 'glutes/barbell-low-bar-squat' },
  { id: 'trad/leg-press-45', group: 'piernas', name: 'Prensa de piernas 45°', focus: 'Cuádriceps · fuerza apoyada', equipment: 'máquina', muscle: 'quads', gymId: 'glutes/sled-45-leg-press' },
  { id: 'trad/leg-extension', group: 'piernas', name: 'Extensión de piernas', focus: 'Cuádriceps · aislamiento', equipment: 'máquina', muscle: 'quads', gymId: 'quads/lever-leg-extension' },
  { id: 'trad/rdl', group: 'piernas', name: 'Peso muerto rumano', focus: 'Isquiotibiales · bisagra de cadera', equipment: 'barra', muscle: 'hamstrings', gymId: 'glutes/barbell-romanian-deadlift' },
  { id: 'trad/leg-curl', group: 'piernas', name: 'Curl femoral', focus: 'Isquiotibiales · flexión de rodilla', equipment: 'máquina', muscle: 'hamstrings', gymId: 'hamstrings/lever-lying-leg-curl' },
  { id: 'trad/hip-thrust', group: 'piernas', name: 'Hip thrust con barra', focus: 'Glúteos · empuje de cadera', equipment: 'barra', muscle: 'glutes' },
  { id: 'trad/calf-raise-standing', group: 'piernas', name: 'Elevación de talones de pie', focus: 'Gastrocnemio', equipment: 'máquina', muscle: 'calves', gymId: 'calves/lever-standing-calf-raise' },
  { id: 'trad/calf-raise-seated', group: 'piernas', name: 'Elevación de talones sentado', focus: 'Sóleo', equipment: 'máquina', muscle: 'calves', gymId: 'calves/lever-seated-calf-raise' },

  // ─── Pecho ───
  { id: 'trad/bench-press', group: 'pecho', name: 'Press de banca con barra', focus: 'Pecho medio / general', equipment: 'barra', muscle: 'pectorals', gymId: 'pectorals/barbell-bench-press' },
  { id: 'trad/incline-db-press', group: 'pecho', name: 'Press inclinado con mancuernas', focus: 'Pecho superior', equipment: 'mancuernas', muscle: 'pectorals', gymId: 'pectorals/dumbbell-incline-bench-press' },
  { id: 'trad/chest-dip', group: 'pecho', name: 'Fondos en paralelas', focus: 'Pecho inferior', equipment: 'paralelas', muscle: 'pectorals', gymId: 'pectorals/chest-dip-on-dip-pull-up-cage' },
  { id: 'trad/cable-fly', group: 'pecho', name: 'Cruce de poleas', focus: 'Aislamiento / poleas', equipment: 'polea', muscle: 'pectorals', gymId: 'pectorals/cable-middle-fly' },

  // ─── Espalda ───
  { id: 'trad/pull-up', group: 'espalda', name: 'Dominadas', focus: 'Dorsal ancho · amplitud', equipment: 'barra fija', muscle: 'lats', gymId: 'lats/pull-up' },
  { id: 'trad/lat-pulldown', group: 'espalda', name: 'Jalón al pecho', focus: 'Dorsal ancho · amplitud', equipment: 'polea', muscle: 'lats', gymId: 'lats/cable-pulldown' },
  { id: 'trad/barbell-row', group: 'espalda', name: 'Remo con barra', focus: 'Espalda media · grosor', equipment: 'barra', muscle: 'upper-back', gymId: 'upper-back/barbell-bent-over-row' },
  { id: 'trad/deadlift', group: 'espalda', name: 'Peso muerto', focus: 'Espalda baja · erectores', equipment: 'barra', muscle: 'glutes', gymId: 'glutes/barbell-deadlift' },
  { id: 'trad/hyperextension', group: 'espalda', name: 'Extensiones lumbares 45°', focus: 'Espalda baja', equipment: 'banco', muscle: 'spine', gymId: 'spine/hyperextension-on-bench' },
  { id: 'trad/shrug', group: 'espalda', name: 'Encogimientos de hombros', focus: 'Trapecios', equipment: 'barra', muscle: 'traps', gymId: 'traps/barbell-shrug' },

  // ─── Core ───
  { id: 'trad/cable-crunch', group: 'core', name: 'Crunch en polea', focus: 'Recto abdominal', equipment: 'polea', muscle: 'abs', gymId: 'abs/cable-kneeling-crunch' },
  { id: 'trad/hanging-leg-raise', group: 'core', name: 'Elevación de piernas colgado', focus: 'Abdomen inferior', equipment: 'barra fija', muscle: 'abs', gymId: 'abs/hanging-leg-raise' },
  { id: 'trad/russian-twist', group: 'core', name: 'Giros rusos', focus: 'Oblicuos', equipment: 'mancuerna', muscle: 'abs', gymId: 'abs/russian-twist' },
  { id: 'trad/plank', group: 'core', name: 'Plancha abdominal', focus: 'Estabilidad del core', equipment: 'peso corporal', muscle: 'abs', gymId: 'abs/weighted-front-plank' },
  { id: 'trad/ab-wheel', group: 'core', name: 'Rueda abdominal', focus: 'Estabilidad del core', equipment: 'rueda', muscle: 'abs', gymId: 'abs/wheel-rollerout' },

  // ─── Hombros y brazos · Hombros ───
  { id: 'trad/military-press', group: 'hombros-y-brazos', name: 'Press militar con barra', focus: 'Deltoides anterior', equipment: 'barra', muscle: 'delts', gymId: 'delts/barbell-standing-close-grip-military-press' },
  { id: 'trad/lateral-raise', group: 'hombros-y-brazos', name: 'Elevaciones laterales', focus: 'Deltoides lateral', equipment: 'mancuernas', muscle: 'delts', gymId: 'delts/dumbbell-lateral-raise' },
  { id: 'trad/rear-delt-fly', group: 'hombros-y-brazos', name: 'Pájaro en máquina', focus: 'Deltoides posterior', equipment: 'máquina', muscle: 'delts', gymId: 'delts/lever-seated-reverse-fly' },

  // ─── Hombros y brazos · Bíceps ───
  { id: 'trad/barbell-curl', group: 'hombros-y-brazos', name: 'Curl de bíceps con barra', focus: 'Bíceps general', equipment: 'barra', muscle: 'biceps', gymId: 'biceps/barbell-curl' },
  { id: 'trad/hammer-curl', group: 'hombros-y-brazos', name: 'Curl martillo', focus: 'Braquial / braquiorradial', equipment: 'mancuernas', muscle: 'biceps', gymId: 'biceps/dumbbell-hammer-curl' },
  { id: 'trad/preacher-curl', group: 'hombros-y-brazos', name: 'Curl predicador', focus: 'Bíceps · aislamiento', equipment: 'banco scott', muscle: 'biceps', gymId: 'biceps/barbell-preacher-curl' },
  { id: 'trad/concentration-curl', group: 'hombros-y-brazos', name: 'Curl concentrado', focus: 'Bíceps · aislamiento', equipment: 'mancuerna', muscle: 'biceps', gymId: 'biceps/dumbbell-concentration-curl' },

  // ─── Hombros y brazos · Tríceps ───
  { id: 'trad/overhead-extension', group: 'hombros-y-brazos', name: 'Extensión de tríceps tras nuca', focus: 'Cabeza larga', equipment: 'barra', muscle: 'triceps', gymId: 'triceps/barbell-seated-overhead-triceps-extension' },
  { id: 'trad/pushdown', group: 'hombros-y-brazos', name: 'Extensión de tríceps en polea', focus: 'Cabeza lateral / media', equipment: 'polea', muscle: 'triceps', gymId: 'triceps/cable-pushdown' },
  { id: 'trad/skull-crusher', group: 'hombros-y-brazos', name: 'Press francés (skull crusher)', focus: 'Masa general', equipment: 'barra', muscle: 'triceps', gymId: 'triceps/barbell-lying-triceps-extension-skull-crusher' },

  // ——— Estiramientos / movilidad (bloque de calentamiento) ———
  { id: 'trad/stretch-quad-band', group: 'piernas', name: 'Estiramiento de cuádriceps con banda', focus: 'Estiramiento · cuádriceps', equipment: 'banda', muscle: 'quads' },
  { id: 'trad/stretch-hamstring-ball', group: 'piernas', name: 'Estiramiento de isquiotibiales con pelota', focus: 'Estiramiento · isquiotibiales', equipment: 'pelota', muscle: 'hamstrings' },
  { id: 'trad/stretch-calf-wall', group: 'piernas', name: 'Estiramiento de pantorrillas en pared', focus: 'Estiramiento · pantorrilla', equipment: 'peso corporal', muscle: 'calves' },
  { id: 'trad/stretch-hip-mobility-band', group: 'piernas', name: 'Movilidad de cadera con banda', focus: 'Movilidad · cadera', equipment: 'banda', muscle: 'glutes' },
  { id: 'trad/stretch-adductor-floor', group: 'piernas', name: 'Estiramiento de aductores en suelo', focus: 'Estiramiento · aductores', equipment: 'peso corporal', muscle: 'quads' },
  { id: 'trad/stretch-chest-band', group: 'pecho', name: 'Estiramiento de pecho con banda', focus: 'Estiramiento · pecho', equipment: 'banda', muscle: 'pectorals' },
  { id: 'trad/stretch-chest-doorway', group: 'pecho', name: 'Estiramiento de pecho en marco', focus: 'Estiramiento · pecho', equipment: 'peso corporal', muscle: 'pectorals' },
  { id: 'trad/stretch-thoracic-roller', group: 'pecho', name: 'Movilidad torácica con rodillo', focus: 'Movilidad · torácica', equipment: 'foam roller', muscle: 'upper-back' },
  { id: 'trad/stretch-lat-band', group: 'espalda', name: 'Estiramiento de dorsal con banda', focus: 'Estiramiento · dorsal', equipment: 'banda', muscle: 'lats' },
  { id: 'trad/stretch-cat-cow', group: 'espalda', name: 'Estiramiento gato-vaca', focus: 'Movilidad · columna', equipment: 'peso corporal', muscle: 'spine' },
  { id: 'trad/stretch-trap', group: 'espalda', name: 'Estiramiento de trapecios', focus: 'Estiramiento · trapecios', equipment: 'peso corporal', muscle: 'traps' },
  { id: 'trad/stretch-shoulder-band', group: 'hombros-y-brazos', name: 'Estiramiento de hombros con banda', focus: 'Estiramiento · hombros', equipment: 'banda', muscle: 'delts' },
  { id: 'trad/stretch-shoulder-ball', group: 'hombros-y-brazos', name: 'Movilidad de hombros con pelota', focus: 'Movilidad · hombros', equipment: 'pelota', muscle: 'delts' },
  { id: 'trad/stretch-shoulder-cross', group: 'hombros-y-brazos', name: 'Estiramiento cruzado de hombros', focus: 'Estiramiento · hombros', equipment: 'peso corporal', muscle: 'delts' },
  { id: 'trad/stretch-bicep-wall', group: 'hombros-y-brazos', name: 'Estiramiento de bíceps en pared', focus: 'Estiramiento · bíceps', equipment: 'peso corporal', muscle: 'biceps' },
  { id: 'trad/stretch-tricep-overhead', group: 'hombros-y-brazos', name: 'Estiramiento de tríceps sobre cabeza', focus: 'Estiramiento · tríceps', equipment: 'peso corporal', muscle: 'triceps' },
  { id: 'trad/stretch-forearm', group: 'hombros-y-brazos', name: 'Estiramiento de antebrazos', focus: 'Estiramiento · antebrazos', equipment: 'peso corporal', muscle: 'biceps' },
  { id: 'trad/stretch-cobra', group: 'core', name: 'Estiramiento abdominal en cobra', focus: 'Estiramiento · abdomen', equipment: 'peso corporal', muscle: 'abs' },
  { id: 'trad/stretch-oblique', group: 'core', name: 'Estiramiento de oblicuos', focus: 'Estiramiento · oblicuos', equipment: 'peso corporal', muscle: 'abs' },
  { id: 'trad/stretch-spine-roller', group: 'core', name: 'Movilidad de columna con rodillo', focus: 'Movilidad · columna', equipment: 'foam roller', muscle: 'abs' },
]

/** Opciones del formulario de ejercicios custom, derivadas de la síntesis (sin listas sueltas). */
export const CUSTOM_FORM_MUSCLES = [...new Set(TRADITIONAL_SEEDS.map(s => s.muscle))]
export const CUSTOM_FORM_EQUIPMENT = [...new Set(TRADITIONAL_SEEDS.map(s => s.equipment))]
/** Vocabulario fijo de Exercise.category (la API de categorías ya no se consume). */
export const CUSTOM_FORM_CATEGORIES = ['strength', 'hypertrophy', 'cardio', 'stretching']

export type TraditionalEntry = TraditionalSeed & {
  /** Exercise Gym-compatible: del catálogo si hay match, si no sintetizado desde el seed. */
  exercise: Exercise
  matched: boolean
}

function synthesizeExercise(seed: TraditionalSeed): Exercise {
  const bodyPart = TRADITIONAL_GROUPS.find(g => g.id === seed.group)?.bodyPart ?? 'core'
  return {
    id: seed.id,
    slug: seed.id.replace('trad/', ''),
    name: seed.name,
    muscle: seed.muscle,
    bodyPart,
    equipment: seed.equipment,
    category: 'strength',
    secondaryMuscles: [],
    instructions: [],
    file: '',
    gifUrl: '',
  }
}

/**
 * Cruza la lista curada con el catálogo externo. Devuelve una entrada por
 * semilla (33), en el orden de TRADITIONAL_SEEDS — nunca variantes del catálogo.
 */
export function buildTraditionalList(catalog: Exercise[]): TraditionalEntry[] {
  const byId = new Map(catalog.map((e) => [e.id, e]))
  return TRADITIONAL_SEEDS.map((seed) => {
    const found = seed.gymId ? byId.get(seed.gymId) : undefined
    return {
      ...seed,
      exercise: found ?? synthesizeExercise(seed),
      matched: Boolean(found),
    }
  })
}

export function traditionalForGroup(
  catalog: Exercise[],
  group: TraditionalGroupId | '__all__',
): TraditionalEntry[] {
  const all = buildTraditionalList(catalog)
  return group === '__all__' ? all : all.filter((e) => e.group === group)
}

/** Ejercicio listable con su grupo, para los selectores de exclusiones. */
export type TraditionalItem = Exercise & { group: TraditionalGroupId }

export function traditionalItems(catalog: Exercise[]): TraditionalItem[] {
  return buildTraditionalList(catalog).map((t) => ({ ...t.exercise, group: t.group }))
}

/**
 * Excluye/incluye de una vez todos los ejercicios de un grupo (toggle).
 * Si ya están todos excluidos los quita; si no, agrega solo los que faltan.
 */
export function toggleGroupExcluded(
  items: TraditionalItem[],
  group: TraditionalGroupId,
  excluded: string[],
): string[] {
  const ids = items.filter((e) => e.group === group).map((e) => e.id)
  if (ids.length === 0) { return excluded }
  return ids.every((id) => excluded.includes(id))
    ? excluded.filter((x) => !ids.includes(x))
    : [...excluded, ...ids.filter((id) => !excluded.includes(id))]
}
