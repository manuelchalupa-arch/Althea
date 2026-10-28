/** Finalidad real de un ejercicio dentro de las bibliotecas. */
export type ExercisePurpose = 'conventional' | 'warmup' | 'stretch' | 'mobility'

type Classifiable = {
  id?: string
  name?: string
  /** Campo curado de las semillas locales: "Estiramiento · cuádriceps". */
  focus?: string
  /** Clasificación explícita de la lista curada (manda sobre todo lo demás). */
  purpose?: ExercisePurpose
  category?: string
  exerciseObjective?: string
  equipment?: string
}

/**
 * Clasifica por finalidad con los datos que trae el ejercicio: el `purpose`
 * curado, su `focus`, su `exerciseObjective` o la `category` del catálogo.
 * Antes se daba por estiramiento cualquier ejercicio con banda, pelota o
 * rodillo, lo que metía fuerza con banda dentro de la biblioteca de estiramientos.
 */
export function exercisePurpose(ex: Classifiable): ExercisePurpose {
  if (ex.purpose) { return ex.purpose }
  const text = `${ex.name || ''} ${ex.focus || ''} ${ex.id || ''}`.toLowerCase()
  if (text.includes('calentamiento')) { return 'warmup' }
  if (text.includes('movilidad')) { return 'mobility' }
  if (text.includes('estiramiento') || text.includes('stretch')) { return 'stretch' }
  if (ex.exerciseObjective === 'mobility') { return 'mobility' }
  const cat = (ex.category || '').toLowerCase()
  if (cat === 'warmup' || cat === 'calentamiento') { return 'warmup' }
  if (cat === 'mobility' || cat === 'movilidad') { return 'mobility' }
  if (cat === 'stretching' || cat === 'estiramiento') { return 'stretch' }
  return 'conventional'
}

/** Estiramientos + movilidad: el bloque preparatorio que antes iba todo junto. */
export function isStretchingExercise(ex: Classifiable): boolean {
  const purpose = exercisePurpose(ex)
  return purpose === 'stretch' || purpose === 'mobility'
}

/** Opciones de finalidad para los selectores de ejercicios. */
export const EXERCISE_PURPOSES: { id: ExercisePurpose; label: string }[] = [
  { id: 'conventional', label: 'Convencionales' },
  { id: 'warmup', label: 'Calentamiento' },
  { id: 'stretch', label: 'Estiramientos' },
  { id: 'mobility', label: 'Movilidad' },
]
