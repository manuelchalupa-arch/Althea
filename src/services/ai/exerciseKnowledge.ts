// EXERCISE KNOWLEDGE — inferencia de campos biomecánicos para ejercicios
import * as Gym from '@/services/exerciseGym'

export interface ExerciseKnowledgeEntry {
  id: string
  name: string
  muscle: string
  secondaryMuscles: string[]
  bodyPart: string
  equipment: string
  category: string
  gifUrl?: string
  movementPattern?: string
  jointActions?: string[]
  planesOfMotion?: string[]
  stabilityRequirement?: string
  technicalDemand?: string
  difficulty?: string
  objective?: string
  regressions?: string[]
  progressions?: string[]
  commonErrors?: string[]
  biomechanicalNotes?: string
  contraindications?: string[]
}

// Mapa de inferencia: category/muscle → movementPattern (cuando la API no lo provee)
const INFERRED_PATTERN: Record<string, string> = {
  'strength': 'isolation',
  'stretching': 'isolation',
  'cardio': 'carry',
  'plyometrics': 'power',
}

function inferMovementPattern(ex: Gym.Exercise): string {
  const name = (ex.name || '').toLowerCase()
  const muscle = (ex.muscle || '').toLowerCase()
  const cat = (ex.category || '').toLowerCase()
  // Inferencia por nombre
  if (name.includes('press') || name.includes('push') || name.includes('extens')) {return 'push'}
  if (name.includes('curl') || name.includes('row') || name.includes('pull') || name.includes('remo')) {return 'pull'}
  if (name.includes('squat') || name.includes('sentadilla') || name.includes('leg press')) {return 'squat'}
  if (name.includes('deadlift') || name.includes('peso muerto') || name.includes('hip') || name.includes('rdl')) {return 'hinge'}
  if (name.includes('carry') || name.includes('farmer')) {return 'carry'}
  // Inferencia por músculo
  if (muscle === 'chest' || muscle === 'shoulders' || muscle === 'triceps') {return 'push'}
  if (muscle === 'back' || muscle === 'biceps') {return 'pull'}
  if (muscle === 'quadriceps' || muscle === 'glutes') {return 'squat'}
  if (muscle === 'hamstrings') {return 'hinge'}
  return INFERRED_PATTERN[cat] || 'isolation'
}

function inferDifficulty(ex: Gym.Exercise): string {
  const equip = (ex.equipment || '').toLowerCase()
  if (equip === 'bodyweight') {return 'beginner'}
  if (equip === 'dumbbell' || equip === 'band') {return 'intermediate'}
  return 'intermediate'
}

/** Enriquecer un ejercicio de la API con campos inferidos */
export function enrichExercise(ex: Gym.Exercise): ExerciseKnowledgeEntry {
  return {
    id: ex.id,
    name: ex.name,
    muscle: ex.muscle,
    secondaryMuscles: ex.secondaryMuscles || [],
    bodyPart: ex.bodyPart,
    equipment: ex.equipment,
    category: ex.category,
    movementPattern: inferMovementPattern(ex),
    difficulty: inferDifficulty(ex),
    objective: ex.category === 'strength' ? 'hypertrophy' : 'endurance',
  }
}
